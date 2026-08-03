/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueServiceType, TIssueWorklogEditableFields } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

export type TWorklogOperations = {
  create: (data: Partial<TIssueWorklogEditableFields>) => Promise<void>;
  update: (worklogId: string, data: Partial<TIssueWorklogEditableFields>) => Promise<void>;
  remove: (worklogId: string) => Promise<void>;
};

/**
 * The API answers a rejected duration with a field-level error rather than a
 * flat `error` string, so surface `duration[0]` before falling back — that
 * message ("cannot exceed 24 hours…") is the one worth reading.
 */
const readError = (error: any, fallback: string): string =>
  error?.data?.duration?.[0] ?? error?.data?.error ?? fallback;

export const useWorklogOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
): TWorklogOperations => {
  const { createWorklog, updateWorklog, removeWorklog } = useIssueDetail(issueServiceType);
  // i18n
  const { t } = useTranslation();

  return useMemo(
    () => ({
      create: async (data: Partial<TIssueWorklogEditableFields>) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await createWorklog(workspaceSlug, projectId, issueId, data);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("worklogs.toasts.created.title"),
            message: t("worklogs.toasts.created.message"),
          });
        } catch (error: any) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("worklogs.toasts.not_created.title"),
            message: readError(error, t("worklogs.toasts.not_created.message")),
          });
          throw error;
        }
      },
      update: async (worklogId: string, data: Partial<TIssueWorklogEditableFields>) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await updateWorklog(workspaceSlug, projectId, issueId, worklogId, data);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("worklogs.toasts.updated.title"),
            message: t("worklogs.toasts.updated.message"),
          });
        } catch (error: any) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("worklogs.toasts.not_updated.title"),
            message: readError(error, t("worklogs.toasts.not_updated.message")),
          });
          throw error;
        }
      },
      remove: async (worklogId: string) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await removeWorklog(workspaceSlug, projectId, issueId, worklogId);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("worklogs.toasts.removed.title"),
            message: t("worklogs.toasts.removed.message"),
          });
        } catch (error: any) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("worklogs.toasts.not_removed.title"),
            message: readError(error, t("worklogs.toasts.not_removed.message")),
          });
        }
      },
    }),
    [workspaceSlug, projectId, issueId, createWorklog, updateWorklog, removeWorklog, t]
  );
};
