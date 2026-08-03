# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueWorklog


class IssueWorklogSerializer(BaseSerializer):
    logged_by_detail = serializers.SerializerMethodField()

    class Meta:
        model = IssueWorklog
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "logged_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_logged_by_detail(self, obj):
        user = obj.logged_by
        if not user:
            return None
        return {
            "id": str(user.id),
            "display_name": user.display_name,
            "avatar_url": getattr(user, "avatar_url", None),
        }

    def validate_duration(self, value):
        # A day has 1440 minutes. Anything above it is a typo — most often
        # hours typed into a field that wanted minutes — and silently accepting
        # it corrupts every total that entry appears in.
        if value > 1440:
            raise serializers.ValidationError(
                "A single worklog cannot exceed 24 hours (1440 minutes). "
                "Split it across the days the work actually happened."
            )
        return value
