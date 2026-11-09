"""Export storage boundary: local files in development, S3-compatible in production."""

from io import BytesIO
from pathlib import Path

from django.conf import settings


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
    def __init__(self):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required when EXPORT_STORAGE_BACKEND=s3") from exc
        self.bucket = settings.EXPORT_STORAGE_BUCKET
        self.client = boto3.client(
            "s3", endpoint_url=getattr(settings, "EXPORT_STORAGE_ENDPOINT", "") or None,
            region_name=getattr(settings, "EXPORT_STORAGE_REGION", "") or None,
        )

    def save(self, key: str, content: bytes) -> None:
        content_types = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "json": "application/json", "pdf": "application/pdf"}
        suffix = key.rsplit(".", 1)[-1].lower() if "." in key else ""
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType=content_types.get(suffix, "application/octet-stream"))

    def open(self, key: str):
        return BytesIO(self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read())

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
        except self.client.exceptions.ClientError:
            return False
        return True


def get_export_storage():
    if getattr(settings, "EXPORT_STORAGE_BACKEND", "local") == "s3":
        return S3ExportStorage()
    return LocalExportStorage()
