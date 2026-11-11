from pathlib import Path
import mimetypes

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import audit
from apps.core.errors import InvalidTransition
from apps.core.http import IdempotentCommand
from apps.identity import capabilities
from apps.content.models import ContentItem, ContentRevision
from apps.content.serializers import ContentItemWriteSerializer
from apps.learning.models import ModuleCompletion, TrainingModule


def _unique_slug(program_id, wanted, exclude_id=None):
    base = (slugify(wanted)[:200]) or "content"
    slug, counter = base, 2
    taken = ContentItem.objects.filter(program_id=program_id)
    if exclude_id:
        taken = taken.exclude(id=exclude_id)
    while taken.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _in_facility_scope(queryset, user):
    """Items limited to certain facilities are visible only to people at those facilities."""
    if user.role == "program_admin":
        return queryset
    scope = Q(facility_ids=[])
    if user.facility_id:
        scope |= Q(facility_ids__contains=[str(user.facility_id)])
    return queryset.filter(scope)


def _can_see(item, user) -> bool:
    if user.role == "program_admin":
        return True
    if item.archived_at or not item.is_published or user.role not in item.visible_roles:
        return False
    return not item.facility_ids or (user.facility_id is not None and str(user.facility_id) in item.facility_ids)


def _row(item):
    resource_url = f"/api/v1/content/{item.id}/document" if item.document_file else item.resource_url
    return {"id": str(item.id), "title": item.title, "slug": item.slug, "summary": item.summary,
            "body": item.body, "resource_url": resource_url, "cover_image": f"/api/v1/content/{item.id}/cover" if item.cover_image else "", "content_type": item.content_type,
            "category": item.category, "status": "archived" if item.archived_at else "published" if item.is_published else "draft",
            "visible_roles": item.visible_roles, "tags": item.tags, "facility_ids": item.facility_ids, "published": item.is_published,
            "document_name": item.document_file.name.rsplit("/", 1)[-1] if item.document_file else "",
            "published_at": item.published_at, "archived_at": item.archived_at, "updated_at": item.updated_at,
            "version": item.revisions.count() + 1}


def _library_content_row(item):
    resource_url = f"/api/v1/content/{item.id}/document" if item.document_file else item.resource_url
    return {"id": str(item.id), "source_id": str(item.id), "kind": item.content_type, "title": item.title,
            "summary": item.summary, "audience": item.visible_roles, "category": item.category, "tags": item.tags,
            "status": "archived" if item.archived_at else "published" if item.is_published else "draft",
            "required": False, "updated_at": item.updated_at, "updated_by": item.created_by.full_name or item.created_by.email,
            "resource_url": resource_url, "cover_image": f"/api/v1/content/{item.id}/cover" if item.cover_image else "", "lessons": 0, "completed": False}


def _library_module_row(module, done=frozenset()):
    return {"id": f"module:{module.id}", "source_id": str(module.id), "kind": "module", "title": module.title,
            "summary": module.description, "audience": module.visible_roles, "category": module.category, "tags": [],
            "status": "archived" if module.archived_at else "published" if module.is_published else "draft", "required": module.is_required,
            "updated_at": module.updated_at, "updated_by": "Programme team", "resource_url": "",
            "lessons": module.lessons.count(), "completed": module.id in done}


class LibraryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content = ContentItem.objects.filter(program_id=request.user.program_id).select_related("created_by")
        modules = TrainingModule.objects.filter(program_id=request.user.program_id)
        if request.user.role != "program_admin":
            content = _in_facility_scope(content.filter(is_published=True, archived_at=None, visible_roles__contains=[request.user.role]), request.user)
            modules = modules.filter(is_published=True, archived_at=None, visible_roles__contains=[request.user.role])
        kind = request.query_params.get("kind")
        audience = request.query_params.get("audience")
        category = request.query_params.get("category")
        status = request.query_params.get("status")
        required = request.query_params.get("required") == "true"
        search = request.query_params.get("search", "").strip()
        visible_content = content
        visible_modules = modules
        done = set(ModuleCompletion.objects.filter(user=request.user).values_list("module_id", flat=True))
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
                content = content.filter(is_published=True, archived_at=None)
                modules = modules.filter(is_published=True)
            elif status == "draft":
                content = content.filter(is_published=False, archived_at=None)
                modules = modules.filter(is_published=False, archived_at=None)
            elif status == "archived":
                content = content.filter(archived_at__isnull=False)
                modules = modules.filter(archived_at__isnull=False)
        if search:
            content = content.filter(Q(title__icontains=search) | Q(summary__icontains=search) | Q(search_text__icontains=search) | Q(tags__icontains=search.lower()))
            modules = modules.filter(Q(title__icontains=search) | Q(description__icontains=search))
        tag = request.query_params.get("tag", "").strip().lower()
        if tag:
            content = content.filter(tags__contains=[tag])
            modules = modules.none()
        if required:
            content = content.none()
            modules = modules.filter(is_required=True)
        count_rows = [_library_content_row(item) for item in visible_content] + [_library_module_row(module, done) for module in visible_modules]
        rows = [_library_content_row(item) for item in content] + [_library_module_row(module, done) for module in modules]
        rows.sort(key=lambda row: row["updated_at"], reverse=True)
        all_tags = sorted({t for item in visible_content for t in item.tags})
        return Response({"data": rows, "meta": {"total": len(rows), "tags": all_tags, "counts": {
            "all": len(count_rows), "guide": sum(row["kind"] == "guide" for row in count_rows), "module": sum(row["kind"] == "module" for row in count_rows),
            "document": sum(row["kind"] == "document" for row in count_rows), "external": sum(row["kind"] == "external" for row in count_rows),
        }}})


class ContentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = ContentItem.objects.filter(program_id=request.user.program_id, archived_at=None)
        if request.user.role != "program_admin":
            rows = _in_facility_scope(rows.filter(is_published=True).filter(visible_roles__contains=[request.user.role]), request.user)
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
                values = dict(payload.validated_data)
                values["slug"] = _unique_slug(request.user.program_id, values["slug"])
                item = ContentItem.objects.create(program_id=request.user.program_id, created_by=request.user, **values)
                audit.record(actor=request.user, action="content.created", entity_table="content_item", entity_id=item.id,
                             scope={"program_id": str(request.user.program_id)}, changes={"title": item.title})
                command.record(item.id)
        return Response({"data": _row(item)}, status=201)


class ContentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item and not _can_see(item, request.user):
            item = None
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        return Response({"data": _row(item)})

    def delete(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        if item.is_published and not item.archived_at:
            raise InvalidTransition("Unpublish or archive this content before deleting it.")
        title, pk = item.title, item.id
        files = [f for f in (item.document_file, item.cover_image) if f]
        for revision in item.revisions.all():
            files.extend(f for f in (revision.document_file, revision.cover_image) if f)
        with transaction.atomic():
            item.revisions.all().delete()
            item.delete()
            audit.record(actor=request.user, action="content.deleted", entity_table="content_item", entity_id=pk,
                         scope={"program_id": str(request.user.program_id)}, changes={"title": title})
        for stored in files:
            try:
                stored.delete(save=False)
            except OSError:
                pass
        return Response(status=204)


class ContentDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None or not item.document_file or not _can_see(item, request.user):
            return Response({"error": {"code": "not_found", "message": "Document not found."}}, status=404)
        # Named after the item, not the stored file (which may carry a storage suffix).
        suffix = Path(item.document_file.name).suffix.lower()
        filename = f"{slugify(item.title)[:80] or 'document'}{suffix}"
        inline_pdf = request.query_params.get("inline") == "1" and suffix == ".pdf"
        response = FileResponse(item.document_file.open("rb"), as_attachment=not inline_pdf, filename=filename,
                                content_type="application/pdf" if inline_pdf else "application/octet-stream")
        if inline_pdf:
            # Shown inside MentorMAMA only; never framed by another site.
            response["X-Frame-Options"] = "SAMEORIGIN"
            response["Content-Security-Policy"] = "frame-ancestors 'self'"
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
            or not _can_see(item, request.user)
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
        data = payload.validated_data
        keep_published = str(request.data.get("keep_published", "")).lower() in {"true", "1"} and item.is_published
        with IdempotentCommand(request, "revise_content") as command:
            if not command.replayed:
                version = item.revisions.count() + 1
                # Snapshot the state being replaced so history is restorable.
                ContentRevision.objects.create(
                    item=item, version=version, authored_by=request.user, title=item.title, slug=item.slug,
                    summary=item.summary, body=item.body, resource_url=item.resource_url,
                    document_file=item.document_file or None, cover_image=item.cover_image or None,
                    content_type=item.content_type, category=item.category, visible_roles=item.visible_roles,
                )
                updates = ["title", "slug", "summary", "body", "resource_url", "content_type", "category", "visible_roles", "tags", "facility_ids", "is_published", "published_at", "updated_at"]
                if data.get("document_file"):
                    item.document_file = data["document_file"]
                    updates.append("document_file")
                if data.get("cover_image"):
                    item.cover_image = data["cover_image"]
                    updates.append("cover_image")
                for field in ("title", "summary", "body", "resource_url", "content_type", "category", "visible_roles", "tags", "facility_ids"):
                    if field in data:
                        setattr(item, field, data[field])
                item.slug = _unique_slug(item.program_id, data.get("slug") or item.title, exclude_id=item.id)
                if not keep_published:
                    item.is_published = False
                    item.published_at = None
                item.save(update_fields=updates)
                audit.record(actor=request.user, action="content.revised", entity_table="content_item", entity_id=item.id,
                             scope={"program_id": str(request.user.program_id)}, changes={"version": version, "kept_published": keep_published})
                command.record(item.id)
        return Response({"data": _row(item)})


class ContentUnpublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        item.is_published = False
        item.published_at = None
        item.save(update_fields=["is_published", "published_at", "updated_at"])
        audit.record(actor=request.user, action="content.unpublished", entity_table="content_item", entity_id=item.id,
                     scope={"program_id": str(request.user.program_id)})
        return Response({"data": _row(item)})


class ContentDuplicateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        source = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if source is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        with IdempotentCommand(request, "duplicate_content") as command:
            if command.replayed:
                copy = ContentItem.objects.filter(id=command.result_ref).first()
            else:
                title = f"{source.title} (copy)"[:200]
                copy = ContentItem(
                    program_id=source.program_id, created_by=request.user, title=title,
                    slug=_unique_slug(source.program_id, title), summary=source.summary, body=source.body,
                    resource_url=source.resource_url, content_type=source.content_type, category=source.category,
                    visible_roles=source.visible_roles,
                )
                for field in ("document_file", "cover_image"):
                    stored = getattr(source, field)
                    if stored:
                        with stored.open("rb") as handle:
                            getattr(copy, field).save(stored.name.rsplit("/", 1)[-1], ContentFile(handle.read()), save=False)
                copy.save()
                audit.record(actor=request.user, action="content.duplicated", entity_table="content_item", entity_id=copy.id,
                             scope={"program_id": str(request.user.program_id)}, changes={"source_id": str(source.id)})
                command.record(copy.id)
        return Response({"data": _row(copy)}, status=201)


class ContentRevisionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id):
        capabilities.require(request.user, "manage_content")
        item = ContentItem.objects.filter(id=content_id, program_id=request.user.program_id).first()
        if item is None:
            return Response({"error": {"code": "not_found", "message": "Content item not found."}}, status=404)
        rows = item.revisions.select_related("authored_by").order_by("-version")
        return Response({"data": [{"version": row.version, "title": row.title, "summary": row.summary,
                                    "edited_by": row.authored_by.full_name or row.authored_by.email,
                                    "created_at": row.created_at} for row in rows]})


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
