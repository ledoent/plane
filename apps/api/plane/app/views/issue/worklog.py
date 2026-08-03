# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Sum

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.permissions import ProjectEntityPermission
from plane.app.serializers import IssueWorklogSerializer
from plane.db.models import IssueWorklog


class IssueWorklogViewSet(BaseViewSet):
    permission_classes = [ProjectEntityPermission]

    model = IssueWorklog
    serializer_class = IssueWorklogSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("logged_by")
            .distinct()
        )

    def create(self, request, slug, project_id, issue_id):
        serializer = IssueWorklogSerializer(data=request.data)
        if serializer.is_valid():
            # logged_by is the caller, never the payload: letting a client name
            # the person would let anyone book time against a colleague, and
            # that time turns into an invoice line.
            serializer.save(project_id=project_id, issue_id=issue_id, logged_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = self.get_queryset().get(pk=pk)
        if worklog.logged_by_id != request.user.id:
            return Response(
                {"error": "You can only edit your own worklogs."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = IssueWorklogSerializer(worklog, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = self.get_queryset().get(pk=pk)
        if worklog.logged_by_id != request.user.id:
            return Response(
                {"error": "You can only delete your own worklogs."},
                status=status.HTTP_403_FORBIDDEN,
            )
        worklog.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueWorklogSummaryEndpoint(BaseViewSet):
    """Totals for a work item, so the UI does not have to add up pages itself."""

    permission_classes = [ProjectEntityPermission]
    model = IssueWorklog

    def list(self, request, slug, project_id, issue_id):
        rows = (
            IssueWorklog.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id
            )
            .values("logged_by_id", "logged_by__display_name")
            .annotate(duration=Sum("duration"))
            .order_by("-duration")
        )
        return Response(
            {
                "total_duration": sum(r["duration"] for r in rows),
                "by_member": [
                    {
                        "logged_by_id": str(r["logged_by_id"]),
                        "display_name": r["logged_by__display_name"],
                        "duration": r["duration"],
                    }
                    for r in rows
                ],
            },
            status=status.HTTP_200_OK,
        )
