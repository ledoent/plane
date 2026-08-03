/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Duration is whole minutes and `logged_at` is a plain `YYYY-MM-DD` date, both
 * matching the API: the work happened on a day, not at an instant, and minutes
 * stay integral so a month of entries sums exactly for an invoice.
 */
export type TIssueWorklogEditableFields = {
  duration: number;
  description: string;
  logged_at: string;
};

export type TIssueWorklogUserLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type TIssueWorklog = TIssueWorklogEditableFields & {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  logged_by: string;
  logged_by_detail: TIssueWorklogUserLite | null;
  created_at: string;
  updated_at: string;
};

export type TIssueWorklogMap = {
  [worklog_id: string]: TIssueWorklog;
};

export type TIssueWorklogIdMap = {
  [issue_id: string]: string[];
};

export type TIssueWorklogSummaryMember = {
  logged_by_id: string;
  display_name: string;
  duration: number;
};

export type TIssueWorklogSummary = {
  total_duration: number;
  by_member: TIssueWorklogSummaryMember[];
};

export type TIssueWorklogSummaryMap = {
  [issue_id: string]: TIssueWorklogSummary;
};
