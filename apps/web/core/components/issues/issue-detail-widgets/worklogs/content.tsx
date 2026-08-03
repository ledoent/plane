/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useWorklogOperations } from "./helper";
import { LogTimeForm } from "./log-time-form";
import { WorklogItem } from "./worklog-item";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

export const WorklogsCollapsibleContent = observer(function WorklogsCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    isWorklogFormOpen,
    toggleWorklogForm,
    worklog: { getWorklogsByIssueId },
  } = useIssueDetail(issueServiceType);
  // helper
  const worklogOperations = useWorklogOperations(workspaceSlug, projectId, issueId, issueServiceType);
  // derived values
  const worklogIds = getWorklogsByIssueId(issueId) ?? [];

  return (
    <div className="flex flex-col gap-2 py-2" data-testid="worklogs-content">
      {worklogIds.length === 0 && !isWorklogFormOpen && (
        <p className="text-caption-sm-regular text-tertiary">{t("worklogs.empty")}</p>
      )}
      {worklogIds.map((worklogId) => (
        <WorklogItem
          key={worklogId}
          worklogId={worklogId}
          worklogOperations={worklogOperations}
          disabled={disabled}
          issueServiceType={issueServiceType}
        />
      ))}
      {isWorklogFormOpen && !disabled && (
        <LogTimeForm worklogOperations={worklogOperations} onClose={() => toggleWorklogForm(false)} />
      )}
    </div>
  );
});
