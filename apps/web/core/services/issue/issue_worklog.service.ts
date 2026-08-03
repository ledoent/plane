/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type { TIssueWorklog, TIssueWorklogEditableFields, TIssueWorklogSummary } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Worklog routes exist only under the `issues/` namespace — unlike links or
 * attachments there is no epic-scoped equivalent — so the path is fixed rather
 * than parameterised on `TIssueServiceType`.
 */
export class IssueWorklogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string, issueId: string): string {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs`;
  }

  async getWorklogs(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueWorklog[]> {
    return this.get(`${this.basePath(workspaceSlug, projectId, issueId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async getWorklogSummary(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueWorklogSummary> {
    return this.get(`${this.basePath(workspaceSlug, projectId, issueId)}/summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async createWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklogEditableFields>
  ): Promise<TIssueWorklog> {
    return this.post(`${this.basePath(workspaceSlug, projectId, issueId)}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklogEditableFields>
  ): Promise<TIssueWorklog> {
    return this.patch(`${this.basePath(workspaceSlug, projectId, issueId)}/${worklogId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteWorklog(workspaceSlug: string, projectId: string, issueId: string, worklogId: string): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, issueId)}/${worklogId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
