"""Copy uploaded files from the server disk (PRIVATE_CONTENT_ROOT) into the object storage bucket.

Run once on the API service after setting FILE_STORAGE_BACKEND=s3 (Render: mentormama-api → Shell):

    python manage.py copy_media_to_object_storage --dry-run
    python manage.py copy_media_to_object_storage

It is safe to run again: files already in the bucket are skipped, and nothing on the disk is changed or
deleted. Every file keeps its stored name, so database rows need no update. Until the copy is done the app
keeps reading missing files from the disk, so there is no downtime.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import models


def stored_file_names() -> list[tuple[str, str]]:
    """Every distinct file name referenced by a file field, with the model label that references it."""
    found: dict[str, str] = {}
    for model in apps.get_models():
        fields = [field.name for field in model._meta.get_fields() if isinstance(field, models.FileField)]
        for field in fields:
            for name in model._default_manager.exclude(**{field: ""}).exclude(**{f"{field}__isnull": True}).values_list(field, flat=True).iterator():
                found.setdefault(name, f"{model._meta.label}.{field}")
    return sorted((name, label) for name, label in found.items())


class Command(BaseCommand):
    help = "Copy uploaded files from the server disk into the object storage bucket (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="List what would be copied without copying.")
        parser.add_argument("--source", default=str(settings.PRIVATE_CONTENT_ROOT), help="Folder that holds the files.")

    def handle(self, *args, dry_run=False, source=None, **options):
        from botocore.exceptions import ClientError

        from apps.core.storage import s3_client

        bucket = getattr(settings, "MEDIA_STORAGE_BUCKET", "")
        if not bucket:
            raise CommandError("Set MEDIA_STORAGE_BUCKET (or EXPORT_STORAGE_BUCKET) first.")
        prefix = getattr(settings, "MEDIA_STORAGE_PREFIX", "private").strip("/")
        root = Path(source)
        client = s3_client()
        copied = present = missing = failed = 0
        for name, label in stored_file_names():
            key = f"{prefix}/{name}" if prefix else name
            try:
                client.head_object(Bucket=bucket, Key=key)
                present += 1
                continue
            except ClientError as error:
                if str(error.response.get("Error", {}).get("Code")) not in {"404", "NoSuchKey", "NotFound"}:
                    raise CommandError(f"Cannot read the bucket ({error.response.get('Error', {}).get('Code')}). Check the credentials.") from error
            local = root / name
            if not local.is_file():
                missing += 1
                self.stdout.write(self.style.WARNING(f"missing on disk  {name}  ({label})"))
                continue
            if dry_run:
                copied += 1
                self.stdout.write(f"would copy  {name}")
                continue
            try:
                client.upload_file(str(local), bucket, key, ExtraArgs={"ContentType": mimetypes.guess_type(name)[0] or "application/octet-stream"})
                copied += 1
                self.stdout.write(f"copied  {name}")
            except Exception as error:  # keep going: one bad file must not stop the rest
                failed += 1
                self.stderr.write(f"failed  {name}: {error.__class__.__name__}")
        verb = "would copy" if dry_run else "copied"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {copied} · already in the bucket {present} · missing on disk {missing} · failed {failed}"))
        if failed:
            raise CommandError(f"{failed} file(s) could not be copied; run the command again.")
