from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.client import Config
from werkzeug.utils import secure_filename


class ObjectStorageService:
    def __init__(self) -> None:
        self.bucket = os.getenv("BUCKET", "").strip()
        self.endpoint = os.getenv("ENDPOINT", "").strip()
        self.region = os.getenv("REGION", "auto").strip() or "auto"
        self.access_key_id = os.getenv("ACCESS_KEY_ID", "").strip()
        self.secret_access_key = os.getenv("SECRET_ACCESS_KEY", "").strip()
        self._client = None

    @property
    def enabled(self) -> bool:
        return all(
            [
                self.bucket,
                self.endpoint,
                self.access_key_id,
                self.secret_access_key,
            ]
        )

    def get_client(self):
        if not self.enabled:
            raise RuntimeError("Le stockage objet n est pas configure sur ce backend.")
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint,
                region_name=self.region,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def build_object_key(self, parking_id: int, source_type: str, filename: str) -> str:
        safe_name = secure_filename(filename) or f"{source_type}_{uuid4().hex}"
        return f"parking-media/{parking_id}/{source_type}/{uuid4().hex}_{safe_name}"

    def create_presigned_upload(self, object_key: str, mime_type: str, expires_in: int = 3600) -> dict[str, object]:
        client = self.get_client()
        content_type = mime_type or "application/octet-stream"
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        return {
            "upload_url": upload_url,
            "object_key": object_key,
            "headers": {"Content-Type": content_type},
            "expires_in": expires_in,
        }

    def ensure_object_exists(self, object_key: str) -> None:
        self.get_client().head_object(Bucket=self.bucket, Key=object_key)

    def download_file(self, object_key: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and destination.stat().st_size > 0:
            return destination
        self.get_client().download_file(self.bucket, object_key, str(destination))
        return destination

    def delete_file(self, object_key: str) -> None:
        self.get_client().delete_object(Bucket=self.bucket, Key=object_key)
