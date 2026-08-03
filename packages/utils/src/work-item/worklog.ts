/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Minutes in a day. The API refuses a single entry above this. */
export const MAX_WORKLOG_DURATION = 1440;

const HOURS_AND_MINUTES = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/;
const BARE_NUMBER = /^\d+(?:\.\d+)?$/;

/**
 * Parse the durations people actually type — `1h 30m`, `90m`, `1.5h`, `90` —
 * into whole minutes.
 *
 * A bare number is read as minutes, because that is the unit the field asks
 * for and the unit the API stores. Returns `null` for anything unparseable or
 * out of range rather than guessing: a wrong duration here becomes a wrong
 * invoice line, so refusing is the safer failure.
 */
export const parseDurationToMinutes = (input: string): number | null => {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  let minutes: number;

  if (BARE_NUMBER.test(value)) {
    minutes = Number(value);
  } else {
    const match = value.match(HOURS_AND_MINUTES);
    // A match with neither group filled means the input was empty of units —
    // `HOURS_AND_MINUTES` makes both optional, so it happily matches "".
    if (!match || (match[1] === undefined && match[2] === undefined)) return null;
    minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  }

  if (!Number.isFinite(minutes)) return null;

  // Fractional hours are legitimate input (1.5h); fractional minutes are not a
  // unit anyone bills in, so collapse to the nearest whole minute.
  const rounded = Math.round(minutes);
  if (rounded < 1 || rounded > MAX_WORKLOG_DURATION) return null;

  return rounded;
};

/**
 * Render whole minutes the way they were most likely entered: `90` -> `1h 30m`,
 * `120` -> `2h`, `45` -> `45m`.
 */
export const formatMinutesAsDuration = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";

  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};
