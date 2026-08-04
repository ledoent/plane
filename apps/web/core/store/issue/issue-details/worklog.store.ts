/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  TIssueWorklog,
  TIssueWorklogEditableFields,
  TIssueWorklogIdMap,
  TIssueWorklogMap,
  TIssueWorklogSummaryMap,
} from "@plane/types";
// services
import { IssueWorklogService } from "@/services/issue";
// types
import type { IIssueDetail } from "./root.store";

export interface IIssueWorklogStoreActions {
  addWorklogs: (issueId: string, worklogs: TIssueWorklog[]) => void;
  fetchWorklogs: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueWorklog[]>;
  createWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklogEditableFields>
  ) => Promise<TIssueWorklog>;
  updateWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklogEditableFields>
  ) => Promise<TIssueWorklog>;
  removeWorklog: (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => Promise<void>;
}

export interface IIssueWorklogStore extends IIssueWorklogStoreActions {
  // observables
  worklogs: TIssueWorklogIdMap;
  worklogMap: TIssueWorklogMap;
  summaryMap: TIssueWorklogSummaryMap;
  // helper methods
  getWorklogsByIssueId: (issueId: string) => string[] | undefined;
  getWorklogById: (worklogId: string) => TIssueWorklog | undefined;
  getTotalDurationByIssueId: (issueId: string) => number;
}

export class IssueWorklogStore implements IIssueWorklogStore {
  // observables
  worklogs: TIssueWorklogIdMap = {};
  worklogMap: TIssueWorklogMap = {};
  summaryMap: TIssueWorklogSummaryMap = {};
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  issueWorklogService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      // observables
      worklogs: observable,
      worklogMap: observable,
      summaryMap: observable,
      // actions
      addWorklogs: action.bound,
      fetchWorklogs: action,
      createWorklog: action,
      updateWorklog: action,
      removeWorklog: action,
    });
    // root store
    this.rootIssueDetailStore = rootStore;
    // services
    this.issueWorklogService = new IssueWorklogService();
  }

  // helper methods
  getWorklogsByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.worklogs[issueId] ?? undefined;
  };

  getWorklogById = (worklogId: string) => {
    if (!worklogId) return undefined;
    return this.worklogMap[worklogId] ?? undefined;
  };

  /**
   * The total the widget shows. Preferring the server summary keeps the number
   * honest when the list is partial, and falling back to the loaded entries
   * means a freshly created worklog is reflected before the summary refetch
   * lands.
   */
  getTotalDurationByIssueId = (issueId: string) => {
    const summary = this.summaryMap[issueId];
    if (summary) return summary.total_duration;
    const worklogIds = this.worklogs[issueId] ?? [];
    return worklogIds.reduce((total, id) => total + (this.worklogMap[id]?.duration ?? 0), 0);
  };

  // actions
  addWorklogs = (issueId: string, worklogs: TIssueWorklog[]) => {
    runInAction(() => {
      this.worklogs[issueId] = worklogs.map((worklog) => worklog.id);
      worklogs.forEach((worklog) => set(this.worklogMap, worklog.id, worklog));
    });
  };

  /** Refresh the server-side total. Failure is not fatal — the widget falls
   * back to summing what it has — so this never rejects into the caller. */
  private fetchSummary = async (workspaceSlug: string, projectId: string, issueId: string) => {
    try {
      const summary = await this.issueWorklogService.getWorklogSummary(workspaceSlug, projectId, issueId);
      runInAction(() => {
        set(this.summaryMap, issueId, summary);
      });
    } catch (error) {
      console.error("worklog summary", error);
    }
  };

  fetchWorklogs = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issueWorklogService.getWorklogs(workspaceSlug, projectId, issueId);
    this.addWorklogs(issueId, response);
    await this.fetchSummary(workspaceSlug, projectId, issueId);
    return response;
  };

  createWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklogEditableFields>
  ) => {
    const response = await this.issueWorklogService.createWorklog(workspaceSlug, projectId, issueId, data);
    runInAction(() => {
      // The list may never have been fetched — a create from a collapsed widget
      // is legitimate — so seed the array rather than pushing into undefined.
      if (!this.worklogs[issueId]) this.worklogs[issueId] = [];
      this.worklogs[issueId].unshift(response.id);
      set(this.worklogMap, response.id, response);
    });
    await this.fetchSummary(workspaceSlug, projectId, issueId);
    return response;
  };

  updateWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklogEditableFields>
  ) => {
    const initialData = { ...this.worklogMap[worklogId] };
    try {
      runInAction(() => {
        Object.keys(data).forEach((key) => {
          set(this.worklogMap, [worklogId, key], data[key as keyof TIssueWorklogEditableFields]);
        });
      });
      const response = await this.issueWorklogService.updateWorklog(workspaceSlug, projectId, issueId, worklogId, data);
      runInAction(() => {
        set(this.worklogMap, worklogId, response);
      });
      await this.fetchSummary(workspaceSlug, projectId, issueId);
      return response;
    } catch (error) {
      runInAction(() => {
        Object.keys(initialData).forEach((key) => {
          set(this.worklogMap, [worklogId, key], initialData[key as keyof TIssueWorklog]);
        });
      });
      throw error;
    }
  };

  removeWorklog = async (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => {
    await this.issueWorklogService.deleteWorklog(workspaceSlug, projectId, issueId, worklogId);
    runInAction(() => {
      const worklogIndex = this.worklogs[issueId]?.findIndex((id) => id === worklogId) ?? -1;
      if (worklogIndex >= 0) this.worklogs[issueId].splice(worklogIndex, 1);
      delete this.worklogMap[worklogId];
    });
    await this.fetchSummary(workspaceSlug, projectId, issueId);
  };
}
