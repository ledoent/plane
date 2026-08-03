/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import { parseDurationToMinutes } from "@plane/utils";
// local imports
import type { TWorklogOperations } from "./helper";

type Props = {
  worklogOperations: TWorklogOperations;
  onClose: () => void;
};

/** `new Date()` in the browser is local time; `toISOString` is UTC and would
 * hand the API yesterday's date for anyone west of Greenwich after 00:00 UTC. */
const todayAsISODate = (): string => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export function LogTimeForm(props: Props) {
  const { worklogOperations, onClose } = props;
  // i18n
  const { t } = useTranslation();
  // state
  const [duration, setDuration] = useState("");
  const [loggedAt, setLoggedAt] = useState(todayAsISODate);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);

  // Focused on mount rather than via `autoFocus`: this form only ever renders
  // because the user clicked "Log time", so moving the caret into the duration
  // field is finishing their action, not hijacking the page.
  useEffect(() => {
    durationRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const minutes = parseDurationToMinutes(duration);
    if (minutes === null) {
      setError(t("worklogs.form.invalid_duration"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await worklogOperations.create({ duration: minutes, logged_at: loggedAt, description });
      setDuration("");
      setDescription("");
      onClose();
    } catch {
      // The operation helper has already raised a toast carrying the API's
      // reason; keep the form open so the entry is not lost.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-col gap-2 rounded-sm border-[0.5px] border-subtle bg-surface-2 p-3"
      data-testid="worklog-form"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-col gap-1">
          <Input
            ref={durationRef}
            id="worklog-duration"
            name="duration"
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t("worklogs.form.duration_placeholder")}
            aria-label={t("worklogs.form.duration_label")}
            hasError={!!error}
            className="w-32"
            data-testid="worklog-duration-input"
          />
          {error && <span className="text-danger text-caption-sm-regular">{error}</span>}
        </div>
        <Input
          id="worklog-logged-at"
          name="logged_at"
          type="date"
          value={loggedAt}
          onChange={(e) => setLoggedAt(e.target.value)}
          aria-label={t("worklogs.form.date_label")}
          className="w-40"
          data-testid="worklog-date-input"
        />
        <Input
          id="worklog-description"
          name="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("worklogs.form.description_placeholder")}
          aria-label={t("worklogs.form.description_label")}
          className="min-w-48 flex-1"
          data-testid="worklog-description-input"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="base" loading={isSubmitting} data-testid="worklog-submit">
          {isSubmitting ? t("common.adding") : t("worklogs.form.submit")}
        </Button>
        <Button type="button" variant="secondary" size="base" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
