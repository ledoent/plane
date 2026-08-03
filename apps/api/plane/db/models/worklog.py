# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

# Module imports
from .project import ProjectBaseModel


class IssueWorklog(ProjectBaseModel):
    """Time a person spent on a work item.

    Duration is stored in whole minutes rather than a decimal of hours: the
    canonical unit is the one people enter, and keeping it integral avoids
    0.1h + 0.2h drifting away from 0.3h when a month of entries is summed for
    an invoice.

    ``logged_at`` is the date the work happened, which is not the same as
    ``created_at`` — Friday's work is routinely entered on Monday, and billing
    periods are decided by the former.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_worklog")
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="issue_worklogs"
    )
    duration = models.PositiveIntegerField(
        validators=[MinValueValidator(1)], help_text="Time spent, in minutes."
    )
    description = models.TextField(blank=True, default="")
    # localdate, not now: `now` yields a datetime and DRF refuses to coerce one
    # into a DateField rather than silently drop the timezone.
    logged_at = models.DateField(
        default=timezone.localdate, help_text="The date the work was done."
    )

    class Meta:
        verbose_name = "Issue Worklog"
        verbose_name_plural = "Issue Worklogs"
        db_table = "issue_worklogs"
        ordering = ("-logged_at", "-created_at")
        indexes = [models.Index(fields=["issue", "logged_at"])]

    def __str__(self):
        return f"{self.issue.name} {self.duration}m"
