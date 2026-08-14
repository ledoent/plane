# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
import uuid
from datetime import timedelta
from urllib.parse import quote

# Third party imports
import boto3
from botocore.exceptions import ClientError
import google.auth
from google.auth.transport import requests as _google_requests
from google.cloud import storage as _gcs

# Module imports
from plane.utils.exception_logger import log_exception
from storages.backends.gcloud import GoogleCloudStorage
from storages.backends.s3boto3 import S3Boto3Storage


def _content_disposition(disposition, filename=None):
    """Build an RFC 5987-encoded Content-Disposition header value.

    Shared by the S3 and GCS backends. When no filename is given a random one is
    used, matching the presigned-download behaviour Plane relies on.
    """
    if filename is None:
        filename = uuid.uuid4().hex
    return f"{disposition}; filename*=UTF-8''{quote(filename)}"


class S3Storage(S3Boto3Storage):
    def url(self, name, parameters=None, expire=None, http_method=None):
        return name

    """S3 storage class to generate presigned URLs for S3 objects"""

    def __init__(self, request=None):
        # Get the AWS credentials and bucket name from the environment
        self.aws_access_key_id = os.environ.get("AWS_ACCESS_KEY_ID")
        # Use the AWS_SECRET_ACCESS_KEY environment variable for the secret key
        self.aws_secret_access_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        # Use the AWS_S3_BUCKET_NAME environment variable for the bucket name
        self.aws_storage_bucket_name = os.environ.get("AWS_S3_BUCKET_NAME")
        # Use the AWS_REGION environment variable for the region
        self.aws_region = os.environ.get("AWS_REGION")
        # Use the AWS_S3_ENDPOINT_URL environment variable for the endpoint URL
        self.aws_s3_endpoint_url = os.environ.get("AWS_S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT_URL")
        # Use the SIGNED_URL_EXPIRATION environment variable for the expiration time (default: 3600 seconds)
        self.signed_url_expiration = int(os.environ.get("SIGNED_URL_EXPIRATION", "3600"))

        if os.environ.get("USE_MINIO") == "1":
            # Determine protocol based on environment variable
            if os.environ.get("MINIO_ENDPOINT_SSL") == "1":
                endpoint_protocol = "https"
            else:
                endpoint_protocol = request.scheme if request else "http"
            # Create an S3 client for MinIO
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.aws_region,
                endpoint_url=(f"{endpoint_protocol}://{request.get_host()}" if request else self.aws_s3_endpoint_url),
                config=boto3.session.Config(signature_version="s3v4"),
            )
        else:
            # Create an S3 client
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.aws_region,
                endpoint_url=self.aws_s3_endpoint_url,
                config=boto3.session.Config(signature_version="s3v4"),
            )

    def generate_presigned_post(self, object_name, file_type, file_size, expiration=None):
        """Generate a presigned URL to upload an S3 object"""
        if expiration is None:
            expiration = self.signed_url_expiration
        fields = {"Content-Type": file_type}

        conditions = [
            {"bucket": self.aws_storage_bucket_name},
            ["content-length-range", 1, file_size],
            {"Content-Type": file_type},
        ]

        # Add condition for the object name (key)
        if object_name.startswith("${filename}"):
            conditions.append(["starts-with", "$key", object_name[: -len("${filename}")]])
        else:
            fields["key"] = object_name
            conditions.append({"key": object_name})

        # Generate the presigned POST URL
        try:
            # Generate a presigned URL for the S3 object
            response = self.s3_client.generate_presigned_post(
                Bucket=self.aws_storage_bucket_name,
                Key=object_name,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=expiration,
            )
        # Handle errors
        except ClientError as e:
            print(f"Error generating presigned POST URL: {e}")
            return None

        return response

    def _get_content_disposition(self, disposition, filename=None):
        """Helper method to generate Content-Disposition header value"""
        return _content_disposition(disposition, filename)

    def generate_presigned_url(
        self,
        object_name,
        expiration=None,
        http_method="GET",
        disposition="inline",
        filename=None,
    ):
        """Generate a presigned URL to share an S3 object"""
        if expiration is None:
            expiration = self.signed_url_expiration
        content_disposition = self._get_content_disposition(disposition, filename)
        try:
            response = self.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.aws_storage_bucket_name,
                    "Key": str(object_name),
                    "ResponseContentDisposition": content_disposition,
                },
                ExpiresIn=expiration,
                HttpMethod=http_method,
            )
        except ClientError as e:
            log_exception(e)
            return None

        # The response contains the presigned URL
        return response

    def get_object_metadata(self, object_name):
        """Get the metadata for an S3 object"""
        try:
            response = self.s3_client.head_object(Bucket=self.aws_storage_bucket_name, Key=object_name)
        except ClientError as e:
            log_exception(e)
            return None

        return {
            "ContentType": response.get("ContentType"),
            "ContentLength": response.get("ContentLength"),
            "LastModified": (response.get("LastModified").isoformat() if response.get("LastModified") else None),
            "ETag": response.get("ETag"),
            "Metadata": response.get("Metadata", {}),
        }

    def copy_object(self, object_name, new_object_name):
        """Copy an S3 object to a new location"""
        try:
            response = self.s3_client.copy_object(
                Bucket=self.aws_storage_bucket_name,
                CopySource={"Bucket": self.aws_storage_bucket_name, "Key": object_name},
                Key=new_object_name,
            )
        except ClientError as e:
            log_exception(e)
            return None

        return response

    def upload_file(
        self,
        file_obj,
        object_name: str,
        content_type: str = None,
        extra_args: dict = {},
    ) -> bool:
        """Upload a file directly to S3"""
        try:
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_fileobj(
                file_obj,
                self.aws_storage_bucket_name,
                object_name,
                ExtraArgs=extra_args,
            )
            return True
        except ClientError as e:
            log_exception(e)
            return False

    def delete_files(self, object_names):
        """Delete an S3 object"""
        try:
            self.s3_client.delete_objects(
                Bucket=self.aws_storage_bucket_name,
                Delete={"Objects": [{"Key": object_name} for object_name in object_names]},
            )
            return True
        except ClientError as e:
            log_exception(e)
            return False


def _metadata_service_account_email():
    """The bound service-account email from the GCE/GKE metadata server.

    Last-resort for signing when the ADC credentials don't expose the identity
    directly (Workload Identity credentials report the literal "default").
    """
    import urllib.request

    req = urllib.request.Request(
        "http://metadata/computeMetadata/v1/instance/service-accounts/default/email",
        headers={"Metadata-Flavor": "Google"},
    )
    return urllib.request.urlopen(req, timeout=5).read().decode().strip()


class GCSStorage(GoogleCloudStorage):
    """Native Google Cloud Storage backend, keyless via Workload Identity.

    Reads/writes use Application Default Credentials (the pod's bound service
    account). Presigned upload POST policies and download URLs are signed
    through the IAM signBlob API, so NO service-account key is ever needed.
    Mirrors the S3Storage interface; the module swaps ``S3Storage`` for this
    class when ``USE_GCS=1`` so the views are unchanged. The class is always
    defined (not gated on the env var) so it stays importable for tests.
    """

    def __init__(self, request=None, **kwargs):
        self._request = request
        self.signed_url_expiration = int(os.environ.get("SIGNED_URL_EXPIRATION", "3600"))
        self._bucket_name = os.environ.get("GS_BUCKET_NAME") or os.environ.get("AWS_S3_BUCKET_NAME")
        self._project_id = os.environ.get("GS_PROJECT_ID")
        super().__init__(
            bucket_name=self._bucket_name,
            project_id=self._project_id,
            default_acl=None,
            querystring_auth=False,
            file_overwrite=False,
            **kwargs,
        )
        self._gclient = _gcs.Client(project=self._project_id)
        self._gbucket = self._gclient.bucket(self._bucket_name)
        # Resolve credentials + the signing identity once, then refresh the
        # token lazily in _signing(). Avoids re-running ADC discovery and a
        # token refresh on every presigned URL.
        self._creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        self._signing_email = self._resolve_signing_email(self._creds)

    @staticmethod
    def _resolve_signing_email(creds):
        """Service account IAM signBlob signs as. An explicit GS_SIGNING_SA
        wins; else the ADC identity — but Workload Identity credentials report
        the literal "default" until refreshed, and signing as "default" is an
        IAM 400, so fall back to the metadata server."""
        email = os.environ.get("GS_SIGNING_SA") or getattr(creds, "service_account_email", None)
        if not email or email == "default":
            try:
                email = _metadata_service_account_email()
            except Exception as e:  # noqa: BLE001
                log_exception(e)
                email = None
        return email

    def _signing(self):
        """Keyless IAM signBlob params: the signing SA email + a fresh token."""
        if not self._creds.valid:
            self._creds.refresh(_google_requests.Request())
        return {"service_account_email": self._signing_email, "access_token": self._creds.token}

    # Plane addresses objects by key and never uses the default-storage URL.
    def url(self, name, parameters=None, expire=None, http_method=None):
        return name

    def generate_presigned_post(self, object_name, file_type, file_size, expiration=None):
        exp = timedelta(seconds=expiration or self.signed_url_expiration)
        conditions = [["content-length-range", 1, file_size], {"Content-Type": file_type}]
        fields = {"Content-Type": file_type}
        try:
            # generate_signed_post_policy_v4 lives on the Client (and takes the
            # bucket name), not on the Bucket object.
            policy = self._gclient.generate_signed_post_policy_v4(
                self._bucket_name, object_name, expiration=exp,
                conditions=conditions, fields=fields, **self._signing(),
            )
            return {"url": policy["url"], "fields": policy["fields"]}
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return None

    def generate_presigned_url(self, object_name, expiration=None, http_method="GET",
                               disposition="inline", filename=None):
        exp = timedelta(seconds=expiration or self.signed_url_expiration)
        try:
            blob = self._gbucket.blob(str(object_name))
            return blob.generate_signed_url(
                version="v4", expiration=exp, method=http_method,
                response_disposition=_content_disposition(disposition, filename),
                **self._signing(),
            )
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return None

    def get_object_metadata(self, object_name):
        try:
            blob = self._gbucket.blob(object_name)
            blob.reload()
            return {
                "ContentType": blob.content_type,
                "ContentLength": blob.size,
                "LastModified": blob.updated.isoformat() if blob.updated else None,
                "ETag": blob.etag,
                "Metadata": blob.metadata or {},
            }
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return None

    def copy_object(self, object_name, new_object_name):
        try:
            self._gbucket.copy_blob(self._gbucket.blob(object_name), self._gbucket, new_object_name)
            return True
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return None

    def upload_file(self, file_obj, object_name, content_type=None, extra_args={}):
        try:
            blob = self._gbucket.blob(object_name)
            blob.upload_from_file(file_obj, content_type=content_type)
            return True
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return False

    def delete_files(self, object_names):
        try:
            self._gbucket.delete_blobs([self._gbucket.blob(n) for n in object_names])
            return True
        except Exception as e:  # noqa: BLE001
            log_exception(e)
            return None


# Views do `from plane.settings.storage import S3Storage`; swap the symbol so
# the whole app uses native GCS when it is turned on.
if os.environ.get("USE_GCS") == "1":
    S3Storage = GCSStorage
