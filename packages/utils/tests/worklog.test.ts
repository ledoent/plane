/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { formatMinutesAsDuration, parseDurationToMinutes, MAX_WORKLOG_DURATION } from "../src/work-item/worklog";

describe("parseDurationToMinutes", () => {
  it("reads hours and minutes together", () => {
    expect(parseDurationToMinutes("1h 30m")).toBe(90);
    expect(parseDurationToMinutes("2h15m")).toBe(135);
    expect(parseDurationToMinutes("  3h   5m  ")).toBe(185);
  });

  it("reads hours alone", () => {
    expect(parseDurationToMinutes("2h")).toBe(120);
    expect(parseDurationToMinutes("1.5h")).toBe(90);
    expect(parseDurationToMinutes("0.25h")).toBe(15);
  });

  it("reads minutes alone", () => {
    expect(parseDurationToMinutes("90m")).toBe(90);
    expect(parseDurationToMinutes("45m")).toBe(45);
  });

  it("reads a bare number as minutes", () => {
    expect(parseDurationToMinutes("90")).toBe(90);
    expect(parseDurationToMinutes("1")).toBe(1);
  });

  it("is case insensitive", () => {
    expect(parseDurationToMinutes("1H 30M")).toBe(90);
  });

  it("rounds fractional minutes to the nearest whole one", () => {
    // 1.51h is 90.6 minutes; nobody bills a fraction of a minute.
    expect(parseDurationToMinutes("1.51h")).toBe(91);
    expect(parseDurationToMinutes("0.51h")).toBe(31);
  });

  it("refuses input it cannot read rather than guessing", () => {
    expect(parseDurationToMinutes("")).toBeNull();
    expect(parseDurationToMinutes("   ")).toBeNull();
    expect(parseDurationToMinutes("abc")).toBeNull();
    expect(parseDurationToMinutes("1h 30")).toBeNull();
    expect(parseDurationToMinutes("-30m")).toBeNull();
    expect(parseDurationToMinutes("1d")).toBeNull();
    expect(parseDurationToMinutes("h")).toBeNull();
    expect(parseDurationToMinutes("m")).toBeNull();
  });

  it("refuses zero and anything that rounds to zero", () => {
    expect(parseDurationToMinutes("0m")).toBeNull();
    expect(parseDurationToMinutes("0")).toBeNull();
    expect(parseDurationToMinutes("0.4m")).toBeNull();
  });

  it("refuses more than a day, matching the API", () => {
    expect(parseDurationToMinutes("24h")).toBe(MAX_WORKLOG_DURATION);
    expect(parseDurationToMinutes("24h 1m")).toBeNull();
    expect(parseDurationToMinutes("25h")).toBeNull();
    expect(parseDurationToMinutes("1441")).toBeNull();
  });
});

describe("formatMinutesAsDuration", () => {
  it("renders minutes under an hour", () => {
    expect(formatMinutesAsDuration(45)).toBe("45m");
    expect(formatMinutesAsDuration(1)).toBe("1m");
  });

  it("drops the minutes on a whole hour", () => {
    expect(formatMinutesAsDuration(60)).toBe("1h");
    expect(formatMinutesAsDuration(120)).toBe("2h");
  });

  it("renders hours and minutes", () => {
    expect(formatMinutesAsDuration(90)).toBe("1h 30m");
    expect(formatMinutesAsDuration(185)).toBe("3h 5m");
  });

  it("renders nothing as 0m", () => {
    expect(formatMinutesAsDuration(0)).toBe("0m");
    expect(formatMinutesAsDuration(-5)).toBe("0m");
    expect(formatMinutesAsDuration(Number.NaN)).toBe("0m");
  });

  it("round-trips through the parser", () => {
    for (const minutes of [1, 45, 60, 90, 120, 185, 1440]) {
      expect(parseDurationToMinutes(formatMinutesAsDuration(minutes))).toBe(minutes);
    }
  });
});
