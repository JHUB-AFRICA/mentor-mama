"""Export storage boundary: local files in development, S3-compatible (Cloudflare R2) in production."""

from pathlib import Path

from django.conf import settings

CONTENT_TYPES = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "json": "application/json",
    "pdf": "application/pdf",
}


class LocalExportStorage:
    def __init__(self):
        self.root = Path(getattr(settings, "EXPORT_ROOT", "/tmp/mentormama-exports"))
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, content: bytes) -> None:
        (self.root / key).write_bytes(content)

    def open(self, key: str):
        return (self.root / key).open("rb")

    def exists(self, key: str) -> bool:
        return (self.root / key).is_file()


class S3ExportStorage:
    """Exports in the shared bucket, under ``EXPORT_STORAGE_PREFIX``. Uses the same client settings as uploads."""

    def __init__(self, client=None):
        from apps.core.storage import s3_client

        self.bucket = getattr(settings, "EXPORT_STORAGE_BUCKET", "") or getattr(settings, "MEDIA_STORAGE_BUCKET", "")
        if not self.bucket:
            raise RuntimeError("EXPORT_STORAGE_BACKEND=s3 needs EXPORT_STORAGE_BUCKET.")
        self.prefix = getattr(settings, "EXPORT_STORAGE_PREFIX", "exports").strip("/")
        self.client = client or s3_client()

    def _key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def save(self, key: str, content: bytes) -> None:
        suffix = key.rsplit(".", 1)[-1].lower() if "." in key else ""
        self.client.put_object(Bucket=self.bucket, Key=self._key(key), Body=content,
                               ContentType=CONTENT_TYPES.get(suffix, "application/octet-stream"))

    def open(self, key: str):
        # A streaming body: large exports are sent to the browser in chunks, not loaded into memory.
        return self.client.get_object(Bucket=self.bucket, Key=self._key(key))["Body"]

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(key))
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404 or error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise  # credentials or permissions: reported as "storage unavailable" by the API error handler
        return True


def get_export_storage():
    if getattr(settings, "EXPORT_STORAGE_BACKEND", "local") == "s3":
        return S3ExportStorage()
    return LocalExportStorage()
