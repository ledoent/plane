/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { CollapsibleButton } from "@plane/ui";
import { formatMinutesAsDuration } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { WorklogsActionButton } from "./quick-action-button";

type Props = {
  isOpen: boolean;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

export const WorklogsCollapsibleTitle = observer(function WorklogsCollapsibleTitle(props: Props) {
  const { isOpen, issueId, disabled, issueServiceType } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    worklog: { getTotalDurationByIssueId },
  } = useIssueDetail(issueServiceType);
  // derived values
  const totalDuration = getTotalDurationByIssueId(issueId);

  // The total is the number people came for, so it is the indicator rather than
  // a count of entries — twelve entries is not information, "6h 30m" is.
  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center" data-testid="worklogs-total">
        <p className="text-14 !leading-3 text-tertiary">{formatMinutesAsDuration(totalDuration)}</p>
      </span>
    ),
    [totalDuration]
  );

  return (
    <CollapsibleButton
      isOpen={isOpen}
      title={t("worklogs.title")}
      indicatorElement={indicatorElement}
      actionItemElement={!disabled && <WorklogsActionButton issueServiceType={issueServiceType} disabled={disabled} />}
    />
  );
});
