# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Worklogs: recording time against a work item.

The invariants worth protecting are the ones that end up on an invoice —
who the time is attributed to, that it cannot be edited by somebody else,
and that a fat-fingered duration is refused rather than summed.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueWorklog, State
from plane.tests.factories import (
    ProjectFactory,
    ProjectMemberFactory,
    UserFactory,
    WorkspaceFactory,
    WorkspaceMemberFactory,
)

pytestmark = [pytest.mark.django_db, pytest.mark.contract]


@pytest.fixture
def setup():
    owner = UserFactory()
    workspace = WorkspaceFactory(owner=owner)
    WorkspaceMemberFactory(workspace=workspace, member=owner, role=20)
    project = ProjectFactory(workspace=workspace)
    ProjectMemberFactory(project=project, member=owner, role=20)
    state = State.objects.create(
        name="Todo", project=project, workspace=workspace, group="unstarted"
    )
    issue = Issue.objects.create(
        name="Track something", project=project, workspace=workspace, state=state
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {
        "client": client,
        "owner": owner,
        "workspace": workspace,
        "project": project,
        "issue": issue,
    }


def list_url(s):
    return reverse(
        "project-issue-worklogs",
        kwargs={
            "slug": s["workspace"].slug,
            "project_id": s["project"].id,
            "issue_id": s["issue"].id,
        },
    )


def detail_url(s, pk):
    return f"{list_url(s)}{pk}/"


def summary_url(s):
    return f"{list_url(s)}summary/"


class TestWorklogCreate:
    def test_logging_time_records_it_against_the_work_item(self, setup):
        res = setup["client"].post(
            list_url(setup), {"duration": 90, "description": "Scoping call"}, format="json"
        )
        assert res.status_code == 201, res.data
        assert res.data["duration"] == 90
        assert IssueWorklog.objects.count() == 1

    def test_time_is_attributed_to_the_caller_not_the_payload(self, setup):
        """Otherwise anyone could book hours against a colleague, and those
        hours become somebody's invoice line."""
        other = UserFactory()
        res = setup["client"].post(
            list_url(setup), {"duration": 30, "logged_by": str(other.id)}, format="json"
        )
        assert res.status_code == 201
        assert IssueWorklog.objects.get().logged_by_id == setup["owner"].id

    def test_a_duration_over_a_day_is_refused(self, setup):
        """Almost always hours typed into a field that wanted minutes."""
        res = setup["client"].post(list_url(setup), {"duration": 1441}, format="json")
        assert res.status_code == 400
        assert "24 hours" in str(res.data)

    def test_zero_and_negative_durations_are_refused(self, setup):
        for bad in (0, -5):
            res = setup["client"].post(list_url(setup), {"duration": bad}, format="json")
            assert res.status_code == 400, f"{bad} was accepted"

    def test_logged_at_defaults_to_today_but_can_be_backdated(self, setup):
        """Friday's work is routinely entered on Monday."""
        res = setup["client"].post(
            list_url(setup), {"duration": 60, "logged_at": "2026-01-15"}, format="json"
        )
        assert res.status_code == 201
        assert res.data["logged_at"] == "2026-01-15"

    def test_a_worklog_carries_the_project_and_workspace(self, setup):
        setup["client"].post(list_url(setup), {"duration": 15}, format="json")
        log = IssueWorklog.objects.get()
        assert log.project_id == setup["project"].id
        assert log.workspace_id == setup["workspace"].id


class TestWorklogList:
    def test_only_this_work_items_logs_are_returned(self, setup):
        other_issue = Issue.objects.create(
            name="Something else",
            project=setup["project"],
            workspace=setup["workspace"],
            state=setup["issue"].state,
        )
        IssueWorklog.objects.create(
            issue=setup["issue"], project=setup["project"], workspace=setup["workspace"],
            logged_by=setup["owner"], duration=60,
        )
        IssueWorklog.objects.create(
            issue=other_issue, project=setup["project"], workspace=setup["workspace"],
            logged_by=setup["owner"], duration=30,
        )
        res = setup["client"].get(list_url(setup))
        assert res.status_code == 200
        assert len(res.data) == 1
        assert res.data[0]["duration"] == 60

    def test_a_non_member_cannot_read_them(self, setup):
        """Worklogs expose who worked how long — not for outsiders."""
        stranger = UserFactory()
        client = APIClient()
        client.force_authenticate(user=stranger)
        assert client.get(list_url(setup)).status_code in (401, 403)


class TestWorklogOwnership:
    @pytest.fixture
    def foreign_log(self, setup):
        colleague = UserFactory()
        ProjectMemberFactory(project=setup["project"], member=colleague, role=20)
        WorkspaceMemberFactory(workspace=setup["workspace"], member=colleague, role=20)
        return IssueWorklog.objects.create(
            issue=setup["issue"], project=setup["project"], workspace=setup["workspace"],
            logged_by=colleague, duration=120,
        )

    def test_you_cannot_edit_somebody_elses_time(self, setup, foreign_log):
        res = setup["client"].patch(
            detail_url(setup, foreign_log.id), {"duration": 5}, format="json"
        )
        assert res.status_code == 403
        foreign_log.refresh_from_db()
        assert foreign_log.duration == 120

    def test_you_cannot_delete_somebody_elses_time(self, setup, foreign_log):
        res = setup["client"].delete(detail_url(setup, foreign_log.id))
        assert res.status_code == 403
        assert IssueWorklog.objects.filter(id=foreign_log.id).exists()

    def test_you_can_correct_your_own(self, setup):
        res = setup["client"].post(list_url(setup), {"duration": 60}, format="json")
        pk = res.data["id"]
        res = setup["client"].patch(detail_url(setup, pk), {"duration": 45}, format="json")
        assert res.status_code == 200
        assert res.data["duration"] == 45

    def test_you_can_delete_your_own(self, setup):
        pk = setup["client"].post(list_url(setup), {"duration": 60}, format="json").data["id"]
        assert setup["client"].delete(detail_url(setup, pk)).status_code == 204
        assert IssueWorklog.objects.count() == 0


class TestWorklogSummary:
    def test_summary_totals_across_members(self, setup):
        colleague = UserFactory(display_name="Colleague")
        ProjectMemberFactory(project=setup["project"], member=colleague, role=20)
        for user, mins in ((setup["owner"], 60), (setup["owner"], 30), (colleague, 90)):
            IssueWorklog.objects.create(
                issue=setup["issue"], project=setup["project"],
                workspace=setup["workspace"], logged_by=user, duration=mins,
            )
        res = setup["client"].get(summary_url(setup))
        assert res.status_code == 200
        assert res.data["total_duration"] == 180
        assert len(res.data["by_member"]) == 2
        # ordered by size, so the biggest contributor reads first
        assert res.data["by_member"][0]["duration"] == 90

    def test_summary_of_nothing_is_zero_not_an_error(self, setup):
        res = setup["client"].get(summary_url(setup))
        assert res.status_code == 200
        assert res.data["total_duration"] == 0
        assert res.data["by_member"] == []
