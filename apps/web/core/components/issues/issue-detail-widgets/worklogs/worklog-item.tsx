/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar } from "@plane/propel/avatar";
import { TrashIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { formatMinutesAsDuration, renderFormattedDate } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useUser } from "@/hooks/store/user";
// local imports
import type { TWorklogOperations } from "./helper";

type Props = {
  worklogId: string;
  worklogOperations: TWorklogOperations;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

export const WorklogItem = observer(function WorklogItem(props: Props) {
  const { worklogId, worklogOperations, disabled, issueServiceType } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    worklog: { getWorklogById },
  } = useIssueDetail(issueServiceType);
  const { data: currentUser } = useUser();
  const { isMobile } = usePlatformOS();
  // derived values
  const worklog = getWorklogById(worklogId);

  if (!worklog) return null;

  // The API refuses an edit or delete from anyone but the author, so hiding the
  // control keeps the UI honest about what it will let you do.
  const isAuthor = !!currentUser?.id && currentUser.id === worklog.logged_by;
  const canDelete = isAuthor && !disabled;
  const author = worklog.logged_by_detail;

  return (
    <div
      className="group flex h-10 flex-shrink-0 items-center justify-between gap-3 rounded-sm border-[0.5px] border-subtle bg-surface-2 px-3 hover:bg-layer-1"
      data-testid="worklog-item"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar
          size="md"
          name={author?.display_name ?? t("common.unknown_user")}
          src={author?.avatar_url ?? undefined}
          className="flex-shrink-0"
        />
        <span className="flex-shrink-0 text-body-xs-medium text-primary" data-testid="worklog-duration">
          {formatMinutesAsDuration(worklog.duration)}
        </span>
        <span className="flex-shrink-0 text-caption-sm-regular text-tertiary">
          {renderFormattedDate(worklog.logged_at)}
        </span>
        {worklog.description && (
          <Tooltip tooltipContent={worklog.description} isMobile={isMobile}>
            <span className="w-0 flex-1 truncate text-caption-sm-regular text-tertiary">{worklog.description}</span>
          </Tooltip>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="text-caption-sm-regular text-placeholder">
          {author?.display_name ?? t("common.unknown_user")}
        </span>
        {canDelete && (
          <button
            type="button"
            aria-label={t("worklogs.delete")}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => worklogOperations.remove(worklogId)}
            data-testid="worklog-delete"
          >
            <TrashIcon className="size-3.5 text-tertiary hover:text-danger-secondary" />
          </button>
        )}
      </div>
    </div>
  );
});
