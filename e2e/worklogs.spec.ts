/**
 * Worklogs, end to end against a locally running Plane API.
 *
 * These drive real HTTP against the built image — a fresh workspace, project
 * and work item are created per run through the same endpoints the UI uses, so
 * a passing run means the feature works in the assembled application, not just
 * in Django's test client.
 */
import { expect, test } from "@playwright/test";

import { PlaneClient, seedWorkItem, type Seed } from "./support/client";

let seed: Seed;
let client: PlaneClient;

test.beforeAll(async () => {
  client = await PlaneClient.signIn();
  seed = await seedWorkItem(client);
});

test.describe("recording time", () => {
  test("logging time against a work item stores it", async () => {
    const log = await client.post(seed.worklogsUrl, {
      duration: 90,
      description: "Scoping call",
    });
    expect(log.duration).toBe(90);
    expect(log.description).toBe("Scoping call");

    const list = await client.get(seed.worklogsUrl);
    expect(list.map((l: any) => l.id)).toContain(log.id);
  });

  test("time is attributed to the caller, not to whoever the payload names", async () => {
    // The payload names somebody else; the server must ignore it. Otherwise
    // anyone could book hours against a colleague and those hours become an
    // invoice line with the wrong name on it.
    const log = await client.post(seed.worklogsUrl, {
      duration: 30,
      logged_by: "00000000-0000-0000-0000-000000000000",
    });
    expect(log.logged_by).toBe(client.userId);
  });

  test("a duration typed in hours instead of minutes is refused", async () => {
    const res = await client.raw("POST", seed.worklogsUrl, { duration: 1441 });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("24 hours");
  });

  test("a zero-length entry is refused", async () => {
    const res = await client.raw("POST", seed.worklogsUrl, { duration: 0 });
    expect(res.status()).toBe(400);
  });

  test("work done earlier can be entered later", async () => {
    // Friday's work, typed on Monday. The billing period follows the date the
    // work happened, not the date somebody got round to recording it.
    const log = await client.post(seed.worklogsUrl, {
      duration: 60,
      logged_at: "2026-01-15",
    });
    expect(log.logged_at).toBe("2026-01-15");
  });
});

test.describe("correcting time", () => {
  test("an author can correct and remove their own entry", async () => {
    const log = await client.post(seed.worklogsUrl, { duration: 60 });

    const updated = await client.patch(`${seed.worklogsUrl}${log.id}/`, { duration: 45 });
    expect(updated.duration).toBe(45);

    const res = await client.raw("DELETE", `${seed.worklogsUrl}${log.id}/`);
    expect(res.status()).toBe(204);

    const list = await client.get(seed.worklogsUrl);
    expect(list.map((l: any) => l.id)).not.toContain(log.id);
  });
});

test.describe("totals", () => {
  test("the summary adds up what was logged", async () => {
    const fresh = await seedWorkItem(client);
    for (const duration of [30, 45, 15]) {
      await client.post(fresh.worklogsUrl, { duration });
    }
    const summary = await client.get(`${fresh.worklogsUrl}summary/`);
    expect(summary.total_duration).toBe(90);
    expect(summary.by_member).toHaveLength(1);
    expect(summary.by_member[0].duration).toBe(90);
  });

  test("a work item with no time reports zero rather than failing", async () => {
    const fresh = await seedWorkItem(client);
    const summary = await client.get(`${fresh.worklogsUrl}summary/`);
    expect(summary.total_duration).toBe(0);
    expect(summary.by_member).toEqual([]);
  });
});

test.describe("access", () => {
  test("an unauthenticated caller cannot read or write time", async () => {
    const anon = await PlaneClient.anonymous();
    expect((await anon.raw("GET", seed.worklogsUrl)).status()).toBeGreaterThanOrEqual(401);
    expect(
      (await anon.raw("POST", seed.worklogsUrl, { duration: 10 })).status()
    ).toBeGreaterThanOrEqual(401);
  });
});
