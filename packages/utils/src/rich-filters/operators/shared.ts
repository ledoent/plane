/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAllAvailableOperatorsForDisplay, TNegatedOperators, TSupportedOperators } from "@plane/types";
import { NEGATED_TO_POSITIVE_OPERATOR_MAP, POSITIVE_TO_NEGATED_OPERATOR_MAP } from "@plane/types";

/**
 * Result type for operator conversion
 */
export type TOperatorForPayload = {
  operator: TSupportedOperators;
  isNegation: boolean;
};

/**
 * Type guard for the display-only negated operators.
 * @param operator - The operator to check
 * @returns True if the operator is a negated display operator
 */
export const isNegatedOperator = (operator: TAllAvailableOperatorsForDisplay): operator is TNegatedOperators =>
  // `Object.hasOwn`, not `in` - operators can arrive from a persisted view or a URL param, and
  // `in` would report inherited keys like "constructor" as negated operators.
  Object.hasOwn(NEGATED_TO_POSITIVE_OPERATOR_MAP, operator);

/**
 * Returns the negated display counterpart of a positive operator.
 * Falls back to the operator itself when it has no negated form.
 * @param operator - The positive operator
 * @returns The negated display operator
 */
export const getNegatedOperator = (operator: TSupportedOperators): TAllAvailableOperatorsForDisplay =>
  Object.hasOwn(POSITIVE_TO_NEGATED_OPERATOR_MAP, operator)
    ? POSITIVE_TO_NEGATED_OPERATOR_MAP[operator as keyof typeof POSITIVE_TO_NEGATED_OPERATOR_MAP]
    : operator;

/**
 * Converts a display operator to the format needed for supported by filter expression condition.
 * @param displayOperator - The operator from the UI
 * @returns Object with supported operator and negation flag
 */
export const getOperatorForPayload = (displayOperator: TAllAvailableOperatorsForDisplay): TOperatorForPayload => {
  if (isNegatedOperator(displayOperator)) {
    return {
      operator: NEGATED_TO_POSITIVE_OPERATOR_MAP[displayOperator],
      isNegation: true,
    };
  }

  return {
    operator: displayOperator,
    isNegation: false,
  };
};
