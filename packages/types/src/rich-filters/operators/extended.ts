/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CORE_COLLECTION_OPERATOR, CORE_COMPARISON_OPERATOR, CORE_EQUALITY_OPERATOR } from "./core";

/**
 * Extended logical operators.
 * NOT wraps a single child expression and inverts it. The API's complex filter backend
 * understands `{"not": {...}}` and turns it into `~Q(...)`.
 */
export const EXTENDED_LOGICAL_OPERATOR = {
  NOT: "not",
} as const;

/**
 * Extended equality operators
 */
export const EXTENDED_EQUALITY_OPERATOR = {} as const;

/**
 * Extended collection operators
 */
export const EXTENDED_COLLECTION_OPERATOR = {} as const;

/**
 * Extended comparison operators
 */
export const EXTENDED_COMPARISON_OPERATOR = {} as const;

/**
 * Extended operators that support multiple values
 */
export const EXTENDED_MULTI_VALUE_OPERATORS = [] as const;

/**
 * All extended operators
 */
export const EXTENDED_OPERATORS = {
  ...EXTENDED_EQUALITY_OPERATOR,
  ...EXTENDED_COLLECTION_OPERATOR,
  ...EXTENDED_COMPARISON_OPERATOR,
} as const;
/**
 * All extended operators that can be used in filter conditions
 */
export type TExtendedSupportedOperators = (typeof EXTENDED_OPERATORS)[keyof typeof EXTENDED_OPERATORS];

// -------- NEGATED (DISPLAY-ONLY) OPERATORS --------

/**
 * Negated operators are never stored on a condition node and are never sent to the API.
 * They exist purely so the filter UI can render a single "is not"/"is none of" chip for a
 * condition that is wrapped in a NOT group. `getOperatorForPayload` splits them back into
 * `{ operator, isNegation }` before anything touches the expression tree.
 */
export const NEGATED_EQUALITY_OPERATOR = {
  NOT_EXACT: "not_exact",
} as const;

export const NEGATED_COLLECTION_OPERATOR = {
  NOT_IN: "not_in",
} as const;

export const NEGATED_COMPARISON_OPERATOR = {
  NOT_RANGE: "not_range",
} as const;

export const NEGATED_OPERATORS = {
  ...NEGATED_EQUALITY_OPERATOR,
  ...NEGATED_COLLECTION_OPERATOR,
  ...NEGATED_COMPARISON_OPERATOR,
} as const;

/**
 * All negated operators available for display in the filter UI.
 */
export type TNegatedOperators = (typeof NEGATED_OPERATORS)[keyof typeof NEGATED_OPERATORS];

/**
 * Negated operators that map onto a date-capable positive operator.
 */
export type TNegatedDateOperators =
  | typeof NEGATED_EQUALITY_OPERATOR.NOT_EXACT
  | typeof NEGATED_COMPARISON_OPERATOR.NOT_RANGE;

/**
 * Negated operators that map onto a select-capable positive operator.
 */
export type TNegatedSelectOperators =
  | typeof NEGATED_EQUALITY_OPERATOR.NOT_EXACT
  | typeof NEGATED_COLLECTION_OPERATOR.NOT_IN;

/**
 * Maps a positive (payload) operator to its negated display counterpart.
 */
export const POSITIVE_TO_NEGATED_OPERATOR_MAP = {
  [CORE_EQUALITY_OPERATOR.EXACT]: NEGATED_EQUALITY_OPERATOR.NOT_EXACT,
  [CORE_COLLECTION_OPERATOR.IN]: NEGATED_COLLECTION_OPERATOR.NOT_IN,
  [CORE_COMPARISON_OPERATOR.RANGE]: NEGATED_COMPARISON_OPERATOR.NOT_RANGE,
} as const;

/**
 * Maps a negated display operator back to the positive operator stored on the condition.
 */
export const NEGATED_TO_POSITIVE_OPERATOR_MAP = {
  [NEGATED_EQUALITY_OPERATOR.NOT_EXACT]: CORE_EQUALITY_OPERATOR.EXACT,
  [NEGATED_COLLECTION_OPERATOR.NOT_IN]: CORE_COLLECTION_OPERATOR.IN,
  [NEGATED_COMPARISON_OPERATOR.NOT_RANGE]: CORE_COMPARISON_OPERATOR.RANGE,
} as const;
