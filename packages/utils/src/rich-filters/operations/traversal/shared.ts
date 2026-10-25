/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  TAllAvailableOperatorsForDisplay,
  TFilterExpression,
  TFilterProperty,
  TSupportedOperators,
} from "@plane/types";
// local imports
import { isGroupNode, isNotGroupNode } from "../../types/core";
import { getGroupChildren } from "../../types/shared";
import { getNegatedOperator } from "../../operators/shared";

/**
 * Walks the tree looking for the node with `conditionId` and reports whether its
 * immediate parent is a NOT group.
 *
 * This deliberately does not reuse `findImmediateParent` from ./core - that module imports
 * this one, and pulling it back in here would close an import cycle.
 * @param expression - The filter expression to search in
 * @param conditionId - The ID of the condition to look up
 * @returns True if the condition sits directly inside a NOT group
 */
const isConditionNegated = <P extends TFilterProperty>(
  expression: TFilterExpression<P>,
  conditionId: string
): boolean => {
  if (!isGroupNode(expression)) return false;

  const children = getGroupChildren(expression);

  // Direct hit: this group is the condition's immediate parent
  if (children.some((child) => child.id === conditionId)) {
    return isNotGroupNode(expression);
  }

  return children.some((child) => isConditionNegated(child, conditionId));
};

/**
 * Helper function to get the display operator for a condition.
 * This checks for NOT group context and applies negation if needed.
 * @param operator - The original operator
 * @param expression - The filter expression
 * @param conditionId - The ID of the condition
 * @returns The display operator (possibly negated)
 */
export const getDisplayOperator = <P extends TFilterProperty>(
  operator: TSupportedOperators,
  expression: TFilterExpression<P>,
  conditionId: string
): TAllAvailableOperatorsForDisplay => {
  // A condition wrapped in a NOT group renders as its negated twin ("is not", "is none of")
  if (isConditionNegated(expression, conditionId)) {
    return getNegatedOperator(operator);
  }

  // Otherwise, return the operator as-is
  return operator;
};
