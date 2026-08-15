# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
from unittest.mock import Mock, patch
import pytest
from plane.settings.storage import S3Storage


@pytest.mark.unit
class TestS3StorageSignedURLExpiration:
    """Test the configurable signed URL expiration in S3Storage"""

    @patch.dict(os.environ, {}, clear=True)
    @patch("plane.settings.storage.boto3")
    def test_default_expiration_without_env_variable(self, mock_boto3):
        """Test that default expiration is 3600 seconds when env variable is not set"""
        # Mock the boto3 client
        mock_boto3.client.return_value = Mock()

        # Create S3Storage instance without SIGNED_URL_EXPIRATION env variable
        storage = S3Storage()

        # Assert default expiration is 3600
        assert storage.signed_url_expiration == 3600

    @patch.dict(os.environ, {"SIGNED_URL_EXPIRATION": "30"}, clear=True)
    @patch("plane.settings.storage.boto3")
    def test_custom_expiration_with_env_variable(self, mock_boto3):
        """Test that expiration is read from SIGNED_URL_EXPIRATION env variable"""
        # Mock the boto3 client
        mock_boto3.client.return_value = Mock()

        # Create S3Storage instance with SIGNED_URL_EXPIRATION=30
        storage = S3Storage()

        # Assert expiration is 30
        assert storage.signed_url_expiration == 30

    @patch.dict(os.environ, {"SIGNED_URL_EXPIRATION": "300"}, clear=True)
    @patch("plane.settings.storage.boto3")
    def test_custom_expiration_multiple_values(self, mock_boto3):
        """Test that expiration works with different custom values"""
        # Mock the boto3 client
        mock_boto3.client.return_value = Mock()

        # Create S3Storage instance with SIGNED_URL_EXPIRATION=300
        storage = S3Storage()

        # Assert expiration is 300
        assert storage.signed_url_expiration == 300

    @patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "test-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret",
            "AWS_S3_BUCKET_NAME": "test-bucket",
            "AWS_REGION": "us-east-1",
        },
        clear=True,
    )
    @patch("plane.settings.storage.boto3")
    def test_generate_presigned_post_uses_default_expiration(self, mock_boto3):
        """Test that generate_presigned_post uses the configured default expiration"""
        # Mock the boto3 client and its response
        mock_s3_client = Mock()
        mock_s3_client.generate_presigned_post.return_value = {
            "url": "https://test-url.com",
            "fields": {},
        }
        mock_boto3.client.return_value = mock_s3_client

        # Create S3Storage instance
        storage = S3Storage()

        # Call generate_presigned_post without explicit expiration
        storage.generate_presigned_post("test-object", "image/png", 1024)

        # Assert that the boto3 method was called with the default expiration (3600)
        mock_s3_client.generate_presigned_post.assert_called_once()
        call_kwargs = mock_s3_client.generate_presigned_post.call_args[1]
        assert call_kwargs["ExpiresIn"] == 3600

    @patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "test-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret",
            "AWS_S3_BUCKET_NAME": "test-bucket",
            "AWS_REGION": "us-east-1",
            "SIGNED_URL_EXPIRATION": "60",
        },
        clear=True,
    )
    @patch("plane.settings.storage.boto3")
    def test_generate_presigned_post_uses_custom_expiration(self, mock_boto3):
        """Test that generate_presigned_post uses custom expiration from env variable"""
        # Mock the boto3 client and its response
        mock_s3_client = Mock()
        mock_s3_client.generate_presigned_post.return_value = {
            "url": "https://test-url.com",
            "fields": {},
        }
        mock_boto3.client.return_value = mock_s3_client

        # Create S3Storage instance with SIGNED_URL_EXPIRATION=60
        storage = S3Storage()

        # Call generate_presigned_post without explicit expiration
        storage.generate_presigned_post("test-object", "image/png", 1024)

        # Assert that the boto3 method was called with custom expiration (60)
        mock_s3_client.generate_presigned_post.assert_called_once()
        call_kwargs = mock_s3_client.generate_presigned_post.call_args[1]
        assert call_kwargs["ExpiresIn"] == 60

    @patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "test-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret",
            "AWS_S3_BUCKET_NAME": "test-bucket",
            "AWS_REGION": "us-east-1",
        },
        clear=True,
    )
    @patch("plane.settings.storage.boto3")
    def test_generate_presigned_url_uses_default_expiration(self, mock_boto3):
        """Test that generate_presigned_url uses the configured default expiration"""
        # Mock the boto3 client and its response
        mock_s3_client = Mock()
        mock_s3_client.generate_presigned_url.return_value = "https://test-url.com"
        mock_boto3.client.return_value = mock_s3_client

        # Create S3Storage instance
        storage = S3Storage()

        # Call generate_presigned_url without explicit expiration
        storage.generate_presigned_url("test-object")

        # Assert that the boto3 method was called with the default expiration (3600)
        mock_s3_client.generate_presigned_url.assert_called_once()
        call_kwargs = mock_s3_client.generate_presigned_url.call_args[1]
        assert call_kwargs["ExpiresIn"] == 3600

    @patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "test-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret",
            "AWS_S3_BUCKET_NAME": "test-bucket",
            "AWS_REGION": "us-east-1",
            "SIGNED_URL_EXPIRATION": "30",
        },
        clear=True,
    )
    @patch("plane.settings.storage.boto3")
    def test_generate_presigned_url_uses_custom_expiration(self, mock_boto3):
        """Test that generate_presigned_url uses custom expiration from env variable"""
        # Mock the boto3 client and its response
        mock_s3_client = Mock()
        mock_s3_client.generate_presigned_url.return_value = "https://test-url.com"
        mock_boto3.client.return_value = mock_s3_client

        # Create S3Storage instance with SIGNED_URL_EXPIRATION=30
        storage = S3Storage()

        # Call generate_presigned_url without explicit expiration
        storage.generate_presigned_url("test-object")

        # Assert that the boto3 method was called with custom expiration (30)
        mock_s3_client.generate_presigned_url.assert_called_once()
        call_kwargs = mock_s3_client.generate_presigned_url.call_args[1]
        assert call_kwargs["ExpiresIn"] == 30

    @patch.dict(
        os.environ,
        {
            "AWS_ACCESS_KEY_ID": "test-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret",
            "AWS_S3_BUCKET_NAME": "test-bucket",
            "AWS_REGION": "us-east-1",
            "SIGNED_URL_EXPIRATION": "30",
        },
        clear=True,
    )
    @patch("plane.settings.storage.boto3")
    def test_explicit_expiration_overrides_default(self, mock_boto3):
        """Test that explicit expiration parameter overrides the default"""
        # Mock the boto3 client and its response
        mock_s3_client = Mock()
        mock_s3_client.generate_presigned_url.return_value = "https://test-url.com"
        mock_boto3.client.return_value = mock_s3_client

        # Create S3Storage instance with SIGNED_URL_EXPIRATION=30
        storage = S3Storage()

        # Call generate_presigned_url with explicit expiration=120
        storage.generate_presigned_url("test-object", expiration=120)

        # Assert that the boto3 method was called with explicit expiration (120)
        mock_s3_client.generate_presigned_url.assert_called_once()
        call_kwargs = mock_s3_client.generate_presigned_url.call_args[1]
        assert call_kwargs["ExpiresIn"] == 120


@pytest.mark.unit
class TestContentDisposition:
    """Shared RFC 5987 Content-Disposition helper used by both backends."""

    def test_encodes_given_filename(self):
        from plane.settings.storage import _content_disposition

        assert _content_disposition("attachment", "my report.pdf") == "attachment; filename*=UTF-8''my%20report.pdf"

    def test_defaults_to_random_filename_when_missing(self):
        from plane.settings.storage import _content_disposition

        value = _content_disposition("inline")
        assert value.startswith("inline; filename*=UTF-8''")
        # a uuid4 hex (32 chars) is used when no filename is supplied
        assert len(value.split("''", 1)[1]) == 32


@pytest.mark.unit
class TestGCSSigningEmailResolution:
    """The signing identity is where the subtle Workload Identity 'default' bug
    lives: signing as "default" is an IAM 400, so resolution must not accept it."""

    def test_explicit_env_override_wins(self):
        from plane.settings.storage import GCSStorage

        creds = Mock(service_account_email="adc@proj.iam.gserviceaccount.com")
        with patch.dict(os.environ, {"GS_SIGNING_SA": "explicit@proj.iam.gserviceaccount.com"}):
            assert GCSStorage._resolve_signing_email(creds) == "explicit@proj.iam.gserviceaccount.com"

    def test_uses_adc_identity_when_no_override(self):
        from plane.settings.storage import GCSStorage

        creds = Mock(service_account_email="adc@proj.iam.gserviceaccount.com")
        with patch.dict(os.environ, {}, clear=True):
            assert GCSStorage._resolve_signing_email(creds) == "adc@proj.iam.gserviceaccount.com"

    @patch(
        "plane.settings.storage._metadata_service_account_email",
        return_value="bound@proj.iam.gserviceaccount.com",
    )
    def test_falls_back_to_metadata_when_default(self, mock_metadata):
        from plane.settings.storage import GCSStorage

        creds = Mock(service_account_email="default")
        with patch.dict(os.environ, {}, clear=True):
            assert GCSStorage._resolve_signing_email(creds) == "bound@proj.iam.gserviceaccount.com"
        mock_metadata.assert_called_once()


@pytest.mark.unit
class TestGCSCredentialCaching:
    """Credentials resolve once per process, not once per request.

    Views construct a storage object inside the request handler, so anything
    done in __init__ runs per request — and under Workload Identity resolving
    the signing identity means a blocking call to the metadata server.
    """

    def setup_method(self):
        from plane.settings import storage

        storage._GCS_CREDENTIALS_CACHE.clear()

    teardown_method = setup_method

    @patch("plane.settings.storage.google.auth.default")
    def test_adc_discovery_runs_once_across_calls(self, mock_default):
        from plane.settings.storage import _gcs_credentials

        mock_default.return_value = (Mock(service_account_email="sa@proj.iam.gserviceaccount.com"), "proj")

        first_creds, first_email = _gcs_credentials()
        second_creds, second_email = _gcs_credentials()

        mock_default.assert_called_once()
        assert first_creds is second_creds
        assert first_email == second_email == "sa@proj.iam.gserviceaccount.com"

    @patch("plane.settings.storage._metadata_service_account_email")
    @patch("plane.settings.storage.google.auth.default")
    def test_metadata_server_is_not_polled_per_call(self, mock_default, mock_metadata):
        """The Workload Identity path is the expensive one — pin it explicitly."""
        from plane.settings.storage import _gcs_credentials

        mock_default.return_value = (Mock(service_account_email="default"), "proj")
        mock_metadata.return_value = "bound@proj.iam.gserviceaccount.com"

        for _ in range(3):
            _, email = _gcs_credentials()
            assert email == "bound@proj.iam.gserviceaccount.com"

        mock_metadata.assert_called_once()


@pytest.mark.unit
class TestBackendSelection:
    """USE_GCS rebinds the S3Storage symbol; the whole app depends on it."""

    def test_gcs_is_not_selected_by_default(self):
        import importlib

        from plane.settings import storage

        with patch.dict(os.environ, {}, clear=True):
            reloaded = importlib.reload(storage)
            assert reloaded.S3Storage is reloaded.S3Boto3Storage.__subclasses__()[0] or issubclass(
                reloaded.S3Storage, reloaded.S3Boto3Storage
            )
            assert not issubclass(reloaded.S3Storage, reloaded.GoogleCloudStorage)

    def test_use_gcs_swaps_the_symbol(self):
        import importlib

        from plane.settings import storage

        with patch.dict(os.environ, {"USE_GCS": "1"}):
            reloaded = importlib.reload(storage)
            assert reloaded.S3Storage is reloaded.GCSStorage

        # Restore the module for any test importing it afterwards.
        with patch.dict(os.environ, {}, clear=True):
            importlib.reload(storage)

    def test_other_values_do_not_enable_gcs(self):
        import importlib

        from plane.settings import storage

        for value in ("0", "true", "yes", ""):
            with patch.dict(os.environ, {"USE_GCS": value}):
                reloaded = importlib.reload(storage)
                assert reloaded.S3Storage is not reloaded.GCSStorage, value

        with patch.dict(os.environ, {}, clear=True):
            importlib.reload(storage)

    def test_delete_files_reports_failure_as_false_like_s3(self):
        """Callers should not need to know which backend they are talking to."""
        from plane.settings.storage import GCSStorage

        gcs = GCSStorage.__new__(GCSStorage)
        gcs._gbucket = Mock()
        gcs._gbucket.delete_blobs.side_effect = RuntimeError("boom")

        assert GCSStorage.delete_files(gcs, ["a", "b"]) is False
