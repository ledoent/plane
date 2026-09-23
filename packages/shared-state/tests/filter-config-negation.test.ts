/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_OPERATOR, CORE_OPERATORS } from "@plane/types";
import type { IState, TWorkItemFilterProperty } from "@plane/types";
import { getStateFilterConfig, getCreatedAtFilterConfig } from "@plane/utils";
import { FilterConfig } from "../src/store/rich-filters/config";

const STATES = [
  { id: "state-1", name: "Backlog", group: "backlog" },
  { id: "state-2", name: "Done", group: "completed" },
] as IState[];

/**
 * Builds the State filter config the same way `useWorkItemFiltersConfig` does, spreading
 * the result of `useFiltersOperatorConfigs` over the factory params.
 */
const buildStateConfig = (allowNegative: boolean) =>
  new FilterConfig<TWorkItemFilterProperty>(
    getStateFilterConfig<TWorkItemFilterProperty>("state_id")({
      isEnabled: true,
      states: STATES,
      allowedOperators: new Set(Object.values(CORE_OPERATORS)),
      allowNegative,
    })
  );

describe("FilterConfig operator options - negation", () => {
  it("offers both the positive and negated operator once negation is enabled", () => {
    const config = buildStateConfig(true);

    expect(config.getAllDisplayOperatorOptionsByValue(["state-1", "state-2"])).toEqual([
      { value: COLLECTION_OPERATOR.IN, label: "is any of" },
      { value: "not_in", label: "is none of" },
    ]);
  });

  it("uses the singular wording for both options when a single value is selected", () => {
    const config = buildStateConfig(true);

    // This is the case in the screenshot that started this work: one state picked, so the
    // chip reads "is" and the negated option must read "is not" rather than "is none of".
    expect(config.getAllDisplayOperatorOptionsByValue(["state-1"])).toEqual([
      { value: COLLECTION_OPERATOR.IN, label: "is" },
      { value: "not_in", label: "is not" },
    ]);
  });

  it("falls back to a single option when negation is disabled", () => {
    const config = buildStateConfig(false);

    expect(config.getAllDisplayOperatorOptionsByValue(["state-1"])).toEqual([
      { value: COLLECTION_OPERATOR.IN, label: "is" },
    ]);
  });

  it("offers negated variants for every operator of a date filter", () => {
    const config = new FilterConfig<TWorkItemFilterProperty>(
      getCreatedAtFilterConfig<TWorkItemFilterProperty>("created_at")({
        isEnabled: true,
        allowedOperators: new Set(Object.values(CORE_OPERATORS)),
        allowNegative: true,
      })
    );

    expect(config.getAllDisplayOperatorOptionsByValue(undefined)).toEqual([
      { value: "exact", label: "is" },
      { value: "not_exact", label: "is not" },
      { value: "range", label: "between" },
      { value: "not_range", label: "is not between" },
    ]);
  });

  it("resolves a negated operator back to the positive operator's field config", () => {
    const config = buildStateConfig(true);

    // The value input is driven by this config, so a negated condition must still render
    // the multi-select of states rather than falling through to nothing.
    expect(config.getOperatorConfig("not_in")?.type).toBe("multi_select");
  });
});
