"""Programme-owned library content and role visibility."""

from django.db import models

from apps.core.models import BaseModel
from apps.core.storage import private_storage
from apps.identity.models import Role


class ContentKind(models.TextChoices):
    GUIDE = "guide", "Guide"
    DOCUMENT = "document", "Document"
    EXTERNAL = "external", "External resource"


class ContentCategory(models.TextChoices):
    GENERAL = "general", "General"
    ONBOARDING = "onboarding", "Onboarding"
    CLINICAL_CARE = "clinical_care", "Clinical care"
    SAFEGUARDING = "safeguarding", "Safeguarding"
    TEMPLATES = "templates", "Templates"
    REFERENCE = "reference", "Reference"


def default_visible_roles():
    return [Role.MENTOR, Role.STUDENT, Role.COORDINATOR, Role.NURSE_MANAGER]


def content_document_storage():
    """Kept by name because migrations reference it; every upload uses the shared private storage."""
    return private_storage()


class ContentItem(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="content_items")
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    summary = models.CharField(max_length=500, blank=True, default="")
    body = models.TextField(blank=True, default="")
    resource_url = models.URLField(blank=True, default="")
    document_file = models.FileField(upload_to="content/documents/", storage=content_document_storage, blank=True, null=True)
    cover_image = models.FileField(upload_to="content/covers/", storage=content_document_storage, blank=True, null=True)
    content_type = models.CharField(max_length=32, choices=ContentKind.choices, default=ContentKind.GUIDE)
    category = models.CharField(max_length=32, choices=ContentCategory.choices, default=ContentCategory.GENERAL)
    visible_roles = models.JSONField(default=default_visible_roles)
    tags = models.JSONField(default=list)
    #: Facility ids this item is limited to. Empty means everyone in the audience. Matched against the
    #: signed-in person's facility, so it applies to mentors and nurse managers.
    facility_ids = models.JSONField(default=list)
    #: Plain-text projection of the body (rich-text JSON is not searchable as stored).
    search_text = models.TextField(blank=True, default="", editable=False)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="created_content_items")

    def save(self, *args, **kwargs):
        from apps.learning.text import plain_text

        self.search_text = plain_text(self.body)[:20000]
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "body" in update_fields and "search_text" not in update_fields:
            kwargs["update_fields"] = [*update_fields, "search_text"]
        super().save(*args, **kwargs)

    class Meta:
        db_table = "content_item"
        constraints = [models.UniqueConstraint(fields=["program", "slug"], name="content_slug_per_program")]


class ContentRevision(BaseModel):
    """Immutable snapshot of a library item before a new revision is authored."""

    item = models.ForeignKey(ContentItem, on_delete=models.PROTECT, related_name="revisions")
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, default="")
    summary = models.CharField(max_length=500, blank=True, default="")
    body = models.TextField(blank=True, default="")
    resource_url = models.URLField(blank=True, default="")
    document_file = models.FileField(upload_to="content/revisions/", storage=content_document_storage, blank=True, null=True)
    cover_image = models.FileField(upload_to="content/revisions/", storage=content_document_storage, blank=True, null=True)
    content_type = models.CharField(max_length=32, default="guide")
    category = models.CharField(max_length=32, choices=ContentCategory.choices, default=ContentCategory.GENERAL)
    visible_roles = models.JSONField(default=default_visible_roles)
    authored_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="content_revisions")

    class Meta:
        db_table = "content_revision"
        constraints = [models.UniqueConstraint(fields=["item", "version"], name="content_revision_version")]
