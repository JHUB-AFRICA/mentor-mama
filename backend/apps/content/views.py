import mimetypes

from django.utils import timezone
from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import audit
from apps.core.http import IdempotentCommand
from apps.identity import capabilities
from apps.content.models import ContentItem, ContentRevision
from apps.content.serializers import ContentItemWriteSerializer
from apps.learning.models import TrainingModule


def _row(item):
    resource_url = f"/api/v1/content/{item.id}/document" if item.document_file else item.resource_url
    return {"id": str(item.id), "title": item.title, "slug": item.slug, "summary": item.summary,
            "body": item.body, "resource_url": resource_url, "cover_image": f"/api/v1/content/{item.id}/cover" if item.cover_image else "", "content_type": item.content_type,
            "category": item.category, "status": "archived" if item.archived_at else "published" if item.is_published else "draft",
            "visible_roles": item.visible_roles, "published": item.is_published,
            "document_name": item.document_file.name.rsplit("/", 1)[-1] if item.document_file else "",
            "published_at": item.published_at, "archived_at": item.archived_at, "updated_at": item.updated_at}


def _library_content_row(item):
    resource_url = f"/api/v1/content/{item.id}/document" if item.document_file else item.resource_url
    return {"id": str(item.id), "source_id": str(item.id), "kind": item.content_type, "title": item.title,
            "summary": item.summary, "audience": item.visible_roles, "category": item.category,
            "status": "archived" if item.archived_at else "published" if item.is_published else "draft",
            "required": False, "updated_at": item.updated_at, "updated_by": item.created_by.get_full_name() or item.created_by.email,
            "resource_url": resource_url, "cover_image": f"/api/v1/content/{item.id}/cover" if item.cover_image else "", "lessons": 0, "completed": False}


def _library_module_row(module):
    return {"id": f"module:{module.id}", "source_id": str(module.id), "kind": "module", "title": module.title,
            "summary": module.description, "audience": module.visible_roles, "category": module.category,
            "status": "published" if module.is_published else "draft", "required": module.is_required,
            "updated_at": module.updated_at, "updated_by": "Programme team", "resource_url": "",
            "lessons": module.lessons.count(), "completed": False}


class LibraryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content = ContentItem.objects.filter(program_id=request.user.program_id).select_related("created_by")
        modules = TrainingModule.objects.filter(program_id=request.user.program_id)
        if request.user.role != "program_admin":
            content = content.filter(is_published=True, archived_at=None, visible_roles__contains=[request.user.role])
            modules = modules.filter(is_published=True, visible_roles__contains=[request.user.role])
        kind = request.query_params.get("kind")
        audience = request.query_params.get("audience")
        category = request.query_params.get("category")
        status = request.query_params.get("status")
        required = request.query_params.get("required") == "true"
        search = request.query_params.get("search", "").strip()
        visible_content = content
        visible_modules = modules
        if kind and kind != "all":
            if kind == "module":
                content = content.none()
            else:
                content = content.filter(content_type=kind)
                modules = modules.none()
        if audience:
            content = content.filter(visible_roles__contains=[audience])
            modules = modules.filter(visible_roles__contains=[audience])
        if category:
            content = content.filter(category=category)
            modules = modules.filter(category=category)
        if status:
            if status == "published":
                content = content.filter(is_published=True, archived_at=None); modules = modules.filter(is_published=True)
            elif status == "draft":
                content = content.filter(is_published=False, archived_at=None); modules = modules.filter(is_published=False)
            elif status == "archived":
                content = content.filter(archived_at__isnull=False); modules = modules.none()
        if search:
            from django.db.models import Q
            content = content.filter(Q(title__icontains=search) | Q(summary__icontains=search) | Q(body__icontains=search))
            modules = modules.filter(Q(title__icontains=search) | Q(description__icontains=search))
        if required:
            content = content.none()
            modules = modules.filter(is_required=True)
        count_rows = [_library_content_row(item) for item in visible_content] + [_library_module_row(module) for module in visible_modules]
        rows = [_library_content_row(item) for item in content] + [_library_module_row(module) for module in modules]
        rows.sort(key=lambda row: row["updated_at"], reverse=True)
        return Response({"data": rows, "meta": {"total": len(rows), "counts": {
            "all": len(count_rows), "guide": sum(row["kind"] == "guide" for row in count_rows), "module": sum(row["kind"] == "module" for row in count_rows),
            "document": sum(row["kind"] == "document" for row in count_rows), "external": sum(row["kind"] == "external" for row in count_rows),
        }}})


class ContentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = ContentItem.objects.filter(program_id=request.user.program_id, archived_at=None)
        if request.user.role != "program_admin":
            rows = rows.filter(is_published=True).filter(visible_roles__contains=[request.user.role])
        rows = rows.order_by("title")
        return Response({"data": [_row(item) for item in rows]})

    def post(self, request):
        capabilities.require(request.user, "manage_content")
        payload = ContentItemWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "create_content") as command:
            if command.replayed:
                item = ContentItem.objects.filter(id=command.result_ref).first()
            else:
                item = ContentItem.objects.create(program_id=request.user.program_id, created_by=request.user, **payload.validated_data)
                audit.record(actor=request.user, action="content.created", entity_table="content_item", entity_id=item.id,
                             scope={"program_id": str(request.user.program_id)}, changes={"title": item.title})
                command.record(item.id)
        return Response({"data": _row(item)}, status=201)


class ContentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item and request.user.role != "program_admin" and (not item.is_published or request.user.role not in item.visible_roles):
            item = None
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        return Response({"data": _row(item)})


class ContentDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if (item is None or not item.document_file or
                (request.user.role != "program_admin" and
                 (item.archived_at or not item.is_published or request.user.role not in item.visible_roles))):
            return Response({"error": {"code": "not_found", "message": "Document not found."}}, status=404)
        response = FileResponse(item.document_file.open("rb"), as_attachment=True,
                                filename=item.document_file.name.rsplit("/", 1)[-1],
                                content_type="application/octet-stream")
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class ContentCoverImageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        item = ContentItem.objects.filter(
            id=content_id, program_id=request.user.program_id
        ).first()
        if (
            item is None
            or not item.cover_image
            or (
                request.user.role != "program_admin"
                and (
                    item.archived_at
                    or not item.is_published
                    or request.user.role not in item.visible_roles
                )
            )
        ):
            return Response(
                {"error": {"code": "not_found", "message": "Content image not found."}},
                status=404,
            )

        content_type = mimetypes.guess_type(item.cover_image.name)[0] or "application/octet-stream"
        response = FileResponse(item.cover_image.open("rb"), content_type=content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class ContentPublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        with IdempotentCommand(request, "publish_content") as command:
            if command.replayed:
                item = ContentItem.objects.filter(id=command.result_ref).first()
            else:
                item.is_published = True
                item.archived_at = None
                item.published_at = timezone.now()
                item.save(update_fields=["is_published", "published_at", "archived_at", "updated_at"])
                audit.record(actor=request.user, action="content.published", entity_table="content_item", entity_id=item.id,
                             scope={"program_id": str(request.user.program_id)})
                command.record(item.id)
        return Response({"data": _row(item)})


class ContentReviseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        payload = ContentItemWriteSerializer(data=request.data, context={"existing_item": item})
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "revise_content") as command:
            if not command.replayed:
                version = item.revisions.count() + 1
                revision_data = {key: value for key, value in payload.validated_data.items() if key != "document_file"}
                ContentRevision.objects.create(item=item, version=version, authored_by=request.user,
                                                document_file=item.document_file, **revision_data)
                if payload.validated_data.get("document_file"):
                    item.document_file = payload.validated_data["document_file"]
                for field in ("title", "slug", "summary", "body", "resource_url", "content_type", "category", "visible_roles"):
                    if field in payload.validated_data:
                        setattr(item, field, payload.validated_data[field])
                item.is_published = False
                item.published_at = None
                updates = ["title", "slug", "summary", "body", "resource_url", "content_type", "category", "visible_roles", "is_published", "published_at", "updated_at"]
                if payload.validated_data.get("document_file"):
                    updates.append("document_file")
                item.save(update_fields=updates)
                audit.record(actor=request.user, action="content.revised", entity_table="content_item", entity_id=item.id,
                             scope={"program_id": str(request.user.program_id)}, changes={"version": version})
                command.record(item.id)
        return Response({"data": _row(item)})


class ContentArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(
            id=content_id, program_id=request.user.program_id
        ).first()
        if item is None:
            return Response(
                {"error": {"code": "not_found", "message": "Content item not found."}},
                status=404,
            )
        restore = bool(request.data.get("restore", False))
        if restore:
            item.archived_at = None
            action = "content.restored"
        else:
            item.archived_at = timezone.now()
            item.is_published = False
            item.published_at = None
            action = "content.archived"
        item.save(
            update_fields=[
                "archived_at",
                "is_published",
                "published_at",
                "updated_at",
            ]
        )
        audit.record(
            actor=request.user,
            action=action,
            entity_table="content_item",
            entity_id=item.id,
            scope={"program_id": str(request.user.program_id)},
        )
        return Response({"data": _row(item)})
