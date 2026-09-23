/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";
import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { createConditionNode, createNotGroupNode } from "@plane/utils";
import { FilterInstance } from "../src/store/rich-filters/filter";
import { workItemFiltersAdapter } from "../src/store/work-item-filters/adapter";

const stateCondition = (value: string[]) =>
  createConditionNode<TWorkItemFilterProperty, string>({
    property: "state_id",
    operator: COLLECTION_OPERATOR.IN,
    value,
  });

describe("work item filter adapter - NOT groups", () => {
  it("serializes a negated condition as the API's `not` wrapper", () => {
    const expression = createNotGroupNode(stateCondition(["state-1", "state-2"]));

    expect(workItemFiltersAdapter.toExternal(expression)).toEqual({
      not: { state_id__in: "state-1,state-2" },
    });
  });

  it("keeps the positive operator inside the `not` wrapper", () => {
    // The API FilterSet only declares `state_id__in`, never `state_id__not_in`, so the
    // operator on the condition must stay positive or the request is rejected.
    const external = workItemFiltersAdapter.toExternal(createNotGroupNode(stateCondition(["state-1"])));
    const innerKeys = Object.keys((external as { not: Record<string, unknown> }).not);

    expect(innerKeys).toEqual(["state_id__in"]);
  });

  it("parses the API's `not` wrapper back into a NOT group", () => {
    const internal = workItemFiltersAdapter.toInternal({
      not: { state_id__in: "state-1,state-2" },
    } as TWorkItemFilterExpression);

    expect(internal?.type).toBe("group");
    expect((internal as { logicalOperator: string }).logicalOperator).toBe(LOGICAL_OPERATOR.NOT);
    expect((internal as { child: { property: string; operator: string; value: unknown } }).child).toMatchObject({
      property: "state_id",
      operator: COLLECTION_OPERATOR.IN,
      value: ["state-1", "state-2"],
    });
  });

  it("round-trips a mixed positive/negated expression", () => {
    const external = {
      and: [{ state_id__in: "state-1" }, { not: { label_id__in: "label-1,label-2" } }],
    } as TWorkItemFilterExpression;

    const internal = workItemFiltersAdapter.toInternal(external);
    expect(internal).not.toBeNull();
    expect(workItemFiltersAdapter.toExternal(internal!)).toEqual(external);
  });
});

describe("filter instance - toggling negation", () => {
  const newFilter = () => {
    let latest: TWorkItemFilterExpression | undefined;
    const filter = new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
      adapter: workItemFiltersAdapter,
      onExpressionChange: (expression) => {
        latest = expression;
      },
    });
    return { filter, getLatest: () => latest };
  };

  it("emits a `not` wrapper when a condition is added as negated", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      true
    );

    expect(getLatest()).toEqual({ not: { state_id__in: "state-1" } });
  });

  it("wraps an existing positive condition when the operator flips to negated", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      false
    );
    expect(getLatest()).toEqual({ state_id__in: "state-1" });

    const conditionId = filter.allConditions[0].id;
    filter.updateConditionOperator(conditionId, COLLECTION_OPERATOR.IN, true);

    expect(getLatest()).toEqual({ not: { state_id__in: "state-1" } });
  });

  it("unwraps back to a positive condition, preserving the selected values", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1", "state-2"] },
      true
    );

    const conditionId = filter.allConditions[0].id;
    filter.updateConditionOperator(conditionId, COLLECTION_OPERATOR.IN, false);

    expect(getLatest()).toEqual({ state_id__in: "state-1,state-2" });
  });

  it("negates one condition of an AND group without touching the other", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      false
    );
    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "label_id", operator: COLLECTION_OPERATOR.IN, value: ["label-1"] },
      false
    );

    const labelCondition = filter.allConditions.find((condition) => condition.property === "label_id");
    filter.updateConditionOperator(labelCondition!.id, COLLECTION_OPERATOR.IN, true);

    expect(getLatest()).toEqual({
      and: [{ state_id__in: "state-1" }, { not: { label_id__in: "label-1" } }],
    });
  });

  it("adds a second filter alongside a root-level NOT group", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      true
    );
    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "label_id", operator: COLLECTION_OPERATOR.IN, value: ["label-1"] },
      false
    );

    expect(getLatest()).toEqual({
      and: [{ not: { state_id__in: "state-1" } }, { label_id__in: "label-1" }],
    });
  });

  it("keeps the NOT wrapper when the negated condition's value changes", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      true
    );

    const conditionId = filter.allConditions[0].id;
    filter.updateConditionValue(conditionId, ["state-1", "state-2"]);

    expect(getLatest()).toEqual({ not: { state_id__in: "state-1,state-2" } });
  });

  it("drops the whole NOT group when the negated condition is cleared", () => {
    const { filter } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      true
    );

    const conditionId = filter.allConditions[0].id;
    filter.updateConditionValue(conditionId, []);

    expect(filter.expression).toBeNull();
  });

  it("reports the negated display operator for the wrapped condition", () => {
    const { filter } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      true
    );

    expect(filter.allConditionsForDisplay[0].operator).toBe("not_in");
  });

  it("removes the NOT wrapper along with its condition", () => {
    const { filter, getLatest } = newFilter();

    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: ["state-1"] },
      false
    );
    filter.addCondition(
      LOGICAL_OPERATOR.AND,
      { property: "label_id", operator: COLLECTION_OPERATOR.IN, value: ["label-1"] },
      true
    );

    const labelCondition = filter.allConditions.find((condition) => condition.property === "label_id");
    filter.removeCondition(labelCondition!.id);

    expect(getLatest()).toEqual({ state_id__in: "state-1" });
  });
});
