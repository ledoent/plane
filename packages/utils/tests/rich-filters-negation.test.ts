/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";
import { createAndGroupNode, createConditionNode, createNotGroupNode } from "../src/rich-filters/factories/nodes/core";
import { deepCompareFilterExpressions } from "../src/rich-filters/operations/comparison";
import {
  removeNodeFromExpression,
  sanitizeAndStabilizeExpression,
} from "../src/rich-filters/operations/transformation/core";
import { extractConditionsWithDisplayOperators } from "../src/rich-filters/operations/traversal/core";
import { getDisplayOperator } from "../src/rich-filters/operations/traversal/shared";
import { getNegatedOperator, getOperatorForPayload, isNegatedOperator } from "../src/rich-filters/operators/shared";
import { getGroupChildren } from "../src/rich-filters/types/shared";
import { shouldUnwrapGroup } from "../src/rich-filters/validators/shared";

const stateCondition = (value: string[] = ["state-1"]) =>
  createConditionNode<string, string>({
    property: "state_id",
    operator: COLLECTION_OPERATOR.IN,
    value,
  });

describe("negated operator conversion", () => {
  it("splits a negated display operator into its positive operator plus a negation flag", () => {
    expect(getOperatorForPayload("not_in")).toEqual({ operator: COLLECTION_OPERATOR.IN, isNegation: true });
    expect(getOperatorForPayload("not_exact")).toEqual({ operator: EQUALITY_OPERATOR.EXACT, isNegation: true });
    expect(getOperatorForPayload("not_range")).toEqual({ operator: "range", isNegation: true });
  });

  it("leaves positive operators untouched", () => {
    expect(getOperatorForPayload(COLLECTION_OPERATOR.IN)).toEqual({
      operator: COLLECTION_OPERATOR.IN,
      isNegation: false,
    });
  });

  it("round-trips an operator through its negated form", () => {
    expect(getNegatedOperator(COLLECTION_OPERATOR.IN)).toBe("not_in");
    expect(getOperatorForPayload(getNegatedOperator(COLLECTION_OPERATOR.IN)).operator).toBe(COLLECTION_OPERATOR.IN);
  });

  it("recognises only the negated operators", () => {
    expect(isNegatedOperator("not_in")).toBe(true);
    expect(isNegatedOperator(COLLECTION_OPERATOR.IN)).toBe(false);
  });

  it("does not treat inherited object keys as operators", () => {
    // Operators can arrive from a persisted view or a URL param, so a junk value must not
    // resolve through the prototype chain and end up as the condition's operator.
    for (const inherited of ["constructor", "toString", "__proto__"]) {
      expect(isNegatedOperator(inherited as never)).toBe(false);
      expect(getNegatedOperator(inherited as never)).toBe(inherited);
      expect(getOperatorForPayload(inherited as never)).toEqual({ operator: inherited, isNegation: false });
    }
  });
});

describe("NOT group nodes in the expression tree", () => {
  it("exposes the single child through the generic children accessor", () => {
    const condition = stateCondition();
    const notGroup = createNotGroupNode(condition);

    expect(notGroup.logicalOperator).toBe(LOGICAL_OPERATOR.NOT);
    expect(getGroupChildren(notGroup)).toEqual([condition]);
  });

  it("never unwraps a NOT group, even though it only has one child", () => {
    const notGroup = createNotGroupNode(stateCondition());

    expect(shouldUnwrapGroup(notGroup)).toBe(false);
    // An AND group with a single child is still collapsible
    expect(shouldUnwrapGroup(createAndGroupNode([stateCondition()]))).toBe(true);
  });

  it("reports the negated display operator for a condition wrapped in NOT", () => {
    const condition = stateCondition();
    const expression = createAndGroupNode([createNotGroupNode(condition), stateCondition(["state-2"])]);

    expect(getDisplayOperator(condition.operator, expression, condition.id)).toBe("not_in");
  });

  it("reports the plain operator for a condition that is not wrapped in NOT", () => {
    const condition = stateCondition();
    const expression = createAndGroupNode([condition, stateCondition(["state-2"])]);

    expect(getDisplayOperator(condition.operator, expression, condition.id)).toBe(COLLECTION_OPERATOR.IN);
  });

  it("negates only the wrapped condition when both forms coexist", () => {
    const negated = stateCondition(["state-1"]);
    const positive = stateCondition(["state-2"]);
    const expression = createAndGroupNode([createNotGroupNode(negated), positive]);

    const conditions = extractConditionsWithDisplayOperators(expression);

    expect(conditions.find((c) => c.id === negated.id)?.operator).toBe("not_in");
    expect(conditions.find((c) => c.id === positive.id)?.operator).toBe(COLLECTION_OPERATOR.IN);
  });
});

describe("NOT group lifecycle", () => {
  it("drops the wrapping NOT group when its condition is removed", () => {
    const negated = stateCondition(["state-1"]);
    const positive = stateCondition(["state-2"]);
    const expression = createAndGroupNode([createNotGroupNode(negated), positive]);

    const { expression: result } = removeNodeFromExpression(expression, negated.id);

    // The AND group collapses to the one remaining condition - no orphaned NOT group
    expect(result).toEqual(positive);
  });

  it("keeps a NOT group whose condition still holds a value", () => {
    const expression = createNotGroupNode(stateCondition(["state-1"]));

    expect(sanitizeAndStabilizeExpression(expression)).toEqual(expression);
  });

  it("removes a NOT group whose condition lost its value", () => {
    const expression = createNotGroupNode(stateCondition([]));

    expect(sanitizeAndStabilizeExpression(expression)).toBeNull();
  });
});

describe("expression comparison with negation", () => {
  it("treats a negated condition as different from its positive twin", () => {
    const positive = createAndGroupNode([stateCondition(["state-1"]), stateCondition(["state-2"])]);
    const negated = createAndGroupNode([createNotGroupNode(stateCondition(["state-1"])), stateCondition(["state-2"])]);

    expect(deepCompareFilterExpressions(positive, negated)).toBe(false);
  });

  it("treats two structurally identical negated expressions as equal despite differing node ids", () => {
    const first = createAndGroupNode([createNotGroupNode(stateCondition(["state-1"])), stateCondition(["state-2"])]);
    const second = createAndGroupNode([createNotGroupNode(stateCondition(["state-1"])), stateCondition(["state-2"])]);

    expect(deepCompareFilterExpressions(first, second)).toBe(true);
  });
});
