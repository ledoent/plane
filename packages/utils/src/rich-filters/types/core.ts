/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TFilterAndGroupNode,
  TFilterConditionNode,
  TFilterExpression,
  TFilterFieldType,
  TFilterGroupNode,
  TFilterNotGroupNode,
  TFilterProperty,
  TFilterValue,
} from "@plane/types";
import { FILTER_FIELD_TYPE, FILTER_NODE_TYPE, LOGICAL_OPERATOR } from "@plane/types";

/**
 * Type guard to check if a node is a condition node.
 * @param node - The node to check
 * @returns True if the node is a condition node
 */
export const isConditionNode = <P extends TFilterProperty, V extends TFilterValue>(
  node: TFilterExpression<P>
): node is TFilterConditionNode<P, V> => node.type === FILTER_NODE_TYPE.CONDITION;

/**
 * Type guard to check if a node is a group node.
 * @param node - The node to check
 * @returns True if the node is a group node
 */
export const isGroupNode = <P extends TFilterProperty>(node: TFilterExpression<P>): node is TFilterGroupNode<P> =>
  node.type === FILTER_NODE_TYPE.GROUP;

/**
 * Type guard to check if a group node is an AND group.
 * @param group - The group node to check
 * @returns True if the group is an AND group
 */
export const isAndGroupNode = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>
): group is TFilterAndGroupNode<P> => group.logicalOperator === LOGICAL_OPERATOR.AND;

/**
 * Type guard to check if a group node is a NOT group.
 * @param group - The group node to check
 * @returns True if the group is a NOT group
 */
export const isNotGroupNode = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>
): group is TFilterNotGroupNode<P> => group.logicalOperator === LOGICAL_OPERATOR.NOT;

/**
 * Type guard to check if an expression is a node wrapped in a NOT group.
 * @param node - The node to check
 * @returns True if the node is a NOT group
 */
export const isNegatedNode = <P extends TFilterProperty>(node: TFilterExpression<P>): node is TFilterNotGroupNode<P> =>
  isGroupNode(node) && isNotGroupNode(node);

/**
 * Type guard to check if a group node has children property
 * @param group - The group node to check
 * @returns True if the group has children property
 */
export const hasChildrenProperty = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>
): group is TFilterAndGroupNode<P> => {
  const groupWithChildren = group as { children?: unknown };
  return "children" in group && Array.isArray(groupWithChildren.children);
};

/**
 * Safely gets the children array from an AND group node.
 * @param group - The AND group node
 * @returns The children array
 */
export const getAndGroupChildren = <P extends TFilterProperty>(group: TFilterAndGroupNode<P>): TFilterExpression<P>[] =>
  group.children;

/**
 * Safely gets the single child of a NOT group node as an array.
 * @param group - The NOT group node
 * @returns A single-element array holding the negated child
 */
export const getNotGroupChildren = <P extends TFilterProperty>(group: TFilterNotGroupNode<P>): TFilterExpression<P>[] =>
  group.child ? [group.child] : [];

/**
 * Type guard to check if a filter type is a date filter type.
 * @param type - The filter type to check
 * @returns True if the filter type is a date filter type
 */
export const isDateFilterType = (
  type: TFilterFieldType
): type is typeof FILTER_FIELD_TYPE.DATE | typeof FILTER_FIELD_TYPE.DATE_RANGE =>
  type === FILTER_FIELD_TYPE.DATE || type === FILTER_FIELD_TYPE.DATE_RANGE;
