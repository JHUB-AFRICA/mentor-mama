import json
import zipfile
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.content.models import ContentCategory, ContentKind
from apps.core.validators import validate_cover_image


class ContentItemWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    slug = serializers.SlugField(max_length=220)
    summary = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    body = serializers.CharField(required=False, allow_blank=True, default="")
    resource_url = serializers.URLField(required=False, allow_blank=True, default="")
    document_file = serializers.FileField(required=False, allow_null=True)
    cover_image = serializers.FileField(required=False, allow_null=True)
    content_type = serializers.ChoiceField(choices=ContentKind.values, default=ContentKind.GUIDE)
    category = serializers.ChoiceField(choices=ContentCategory.values, default=ContentCategory.GENERAL)
    visible_roles = serializers.ListField(child=serializers.CharField(max_length=32), required=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=30), required=False, max_length=8)
    facility_ids = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=50)

    def validate_tags(self, value):
        cleaned = []
        for tag in value:
            tag = " ".join(tag.split()).lower()
            if tag and tag not in cleaned:
                cleaned.append(tag)
        return cleaned

    def validate_facility_ids(self, value):
        return [str(item) for item in value]

    def to_internal_value(self, data):
        # A QueryDict stringifies nested lists on assignment, so work on a plain mapping.
        data = {key: data.get(key) for key in data} if hasattr(data, "getlist") else dict(data)
        for field in ("visible_roles", "tags", "facility_ids"):
            value = data.get(field)
            if isinstance(value, str):
                try:
                    data[field] = json.loads(value)
                except json.JSONDecodeError:
                    pass
        return super().to_internal_value(data)

    def validate(self, attrs):
        cover = attrs.get("cover_image")
        if cover:
            try:
                validate_cover_image(cover)
            except DjangoValidationError as error:
                raise serializers.ValidationError({"cover_image": error.messages[0]})
        document = attrs.get("document_file")
        if document:
            allowed = {".pdf", ".docx", ".pptx"}
            suffix = Path(document.name).suffix.lower()
            if suffix not in allowed or document.size > 20 * 1024 * 1024:
                raise serializers.ValidationError({"document_file": "Choose a PDF, DOCX or PPTX file smaller than 20MB."})
            head = document.read(8)
            document.seek(0)
            valid = head.startswith(b"%PDF-")
            if suffix in {".docx", ".pptx"} and head.startswith(b"PK"):
                try:
                    with zipfile.ZipFile(document) as archive:
                        names = set(archive.namelist())
                        valid = "[Content_Types].xml" in names and (
                            "word/document.xml" in names if suffix == ".docx" else "ppt/presentation.xml" in names
                        )
                except zipfile.BadZipFile:
                    valid = False
                finally:
                    document.seek(0)
            if not valid:
                raise serializers.ValidationError({"document_file": "This file does not look like a valid PDF, Word document or presentation."})
        if attrs.get("content_type") == ContentKind.EXTERNAL and not attrs.get("resource_url"):
            raise serializers.ValidationError({"resource_url": "An external resource needs a valid URL."})
        existing = self.context.get("existing_item")
        existing_document = existing and (existing.document_file or existing.resource_url)
        if attrs.get("content_type") == ContentKind.DOCUMENT and not (attrs.get("document_file") or attrs.get("resource_url") or existing_document):
            raise serializers.ValidationError({"document_file": "Upload a document or add its managed link."})
        if (attrs.get("content_type") != ContentKind.EXTERNAL and not attrs.get("body")
                and not attrs.get("resource_url") and not document and not existing_document):
            raise serializers.ValidationError({"body": "Add content or a resource URL before saving."})
        return attrs
