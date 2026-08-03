/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const WorklogsActionButton = observer(function WorklogsActionButton(props: Props) {
  const { customButton, disabled = false, issueServiceType } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { toggleWorklogForm, toggleOpenWidget, openWidgets } = useIssueDetail(issueServiceType);

  const handleOnClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    // Opening the form inside a collapsed widget would hide the thing the click
    // just asked for, so expand first. `setLastWidgetAction` would do it too,
    // but it collapses every other widget as a side effect — too heavy for a
    // click that only means "show me the form".
    if (!openWidgets.includes("worklogs")) toggleOpenWidget("worklogs");
    toggleWorklogForm(true);
  };

  return (
    <button type="button" onClick={handleOnClick} disabled={disabled} aria-label={t("worklogs.log_time")}>
      {customButton ? customButton : <PlusIcon className="h-4 w-4" />}
    </button>
  );
});
