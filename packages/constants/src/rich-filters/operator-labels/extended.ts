/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TExtendedSupportedOperators, TNegatedDateOperators, TNegatedOperators } from "@plane/types";
import { NEGATED_COLLECTION_OPERATOR, NEGATED_COMPARISON_OPERATOR, NEGATED_EQUALITY_OPERATOR } from "@plane/types";

/**
 * Extended operator labels
 */
export const EXTENDED_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {} as const;

/**
 * Negated operator labels for all operators
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<TNegatedOperators, string> = {
  [NEGATED_EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [NEGATED_COLLECTION_OPERATOR.NOT_IN]: "is none of",
  [NEGATED_COMPARISON_OPERATOR.NOT_RANGE]: "is not between",
} as const;

/**
 * Negated date operator labels for all date operators
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<TNegatedDateOperators, string> = {
  [NEGATED_EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [NEGATED_COMPARISON_OPERATOR.NOT_RANGE]: "is not between",
} as const;
