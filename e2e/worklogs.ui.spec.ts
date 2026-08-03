/**
 * Worklogs through the interface.
 *
 * The sibling `worklogs.spec.ts` drives HTTP, which verifies the API but says
 * nothing about whether a person can reach the feature. This one drives the
 * browser: it types a duration the way someone would ("1h 30m") and checks
 * both what the page shows and what the API ended up storing — the parser
 * living only on the client is exactly where those two can disagree.
 *
 * Needs the web app as well as the API:
 *
 *   PLANE_WEB_URL=http://localhost:3000 npx playwright test worklogs.ui.spec.ts
 *
 * Skipped unless PLANE_WEB_URL is set, so the HTTP suite still runs on its own
 * against an API-only stack.
 */
import { expect, test, type Browser } from "@playwright/test";

import { PlaneClient, seedWorkItem, type Seed } from "./support/client";

const WEB_URL = process.env.PLANE_WEB_URL;

test.describe("recording time from the work item page", () => {
  test.skip(!WEB_URL, "set PLANE_WEB_URL to run the browser suite");

  let seed: Seed;
  let client: PlaneClient;
  let storageState: Awaited<ReturnType<PlaneClient["storageState"]>>;

  // The work item page is a heavy client render, and against a dev server the
  // first paint waits on Vite compiling the route. 90s is slack for that, not
  // an expectation about the feature.
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    client = await PlaneClient.signIn();
    // Without this the web app redirects every route to /onboarding/ and the
    // spec would only ever see the profile form.
    await client.completeOnboarding();
    seed = await seedWorkItem(client);
    storageState = await client.storageState();
  });

  const openWorkItem = async (browser: Browser) => {
    const context = await browser.newContext({ baseURL: WEB_URL, storageState });
    const page = await context.newPage();
    await page.goto(`/${seed.workspaceSlug}/projects/${seed.projectId}/issues/${seed.issueId}`);
    // The action row renders once the work item has loaded; everything else in
    // these specs hangs off it.
    const logTime = page.getByRole("button", { name: "Log time" }).first();
    await logTime.waitFor({ state: "visible", timeout: 90_000 });
    return { context, page, logTime };
  };

  test("logging 1h 30m stores 90 minutes and shows it as a total", async ({ browser }) => {
    const { context, page, logTime } = await openWorkItem(browser);

    try {
      // The widget stays hidden until there is something to show, so the entry
      // point is the action button rather than the collapsible.
      await logTime.click();
      await expect(page.getByTestId("worklog-form")).toBeVisible();

      await page.getByTestId("worklog-duration-input").fill("1h 30m");
      await page.getByTestId("worklog-description-input").fill("Scoping call");
      await page.getByTestId("worklog-submit").click();

      // Rendered back through the formatter, not echoed from the input.
      await expect(page.getByTestId("worklog-item")).toHaveCount(1);
      await expect(page.getByTestId("worklog-duration")).toHaveText("1h 30m");
      await expect(page.getByTestId("worklogs-total")).toHaveText("1h 30m");

      // What the server actually stored. "1h 30m" typed in the browser has to
      // arrive as the integer 90, or every total downstream is wrong.
      const logs = await client.get(seed.worklogsUrl);
      expect(logs).toHaveLength(1);
      expect(logs[0].duration).toBe(90);
      expect(logs[0].description).toBe("Scoping call");
      expect(logs[0].logged_by).toBe(client.userId);
    } finally {
      await context.close();
    }
  });

  test("a duration the parser cannot read is refused before it reaches the API", async ({ browser }) => {
    const { context, page, logTime } = await openWorkItem(browser);

    try {
      const before = await client.get(seed.worklogsUrl);

      await logTime.click();
      await page.getByTestId("worklog-duration-input").fill("about half a day");
      await page.getByTestId("worklog-submit").click();

      // The form stays open carrying its complaint, and nothing was posted.
      await expect(page.getByTestId("worklog-form")).toBeVisible();
      await expect(page.getByText(/Enter a duration like/)).toBeVisible();

      const after = await client.get(seed.worklogsUrl);
      expect(after).toHaveLength(before.length);
    } finally {
      await context.close();
    }
  });

  test("an entry can be removed again from the list", async ({ browser }) => {
    const { context, page, logTime } = await openWorkItem(browser);

    try {
      // Earlier specs in this describe share the work item, so the starting
      // count is whatever they left behind rather than zero.
      const rows = page.getByTestId("worklog-item");
      const before = await rows.count();

      await logTime.click();
      await page.getByTestId("worklog-duration-input").fill("45m");
      await page.getByTestId("worklog-submit").click();

      // `count()` takes one snapshot and does not retry, so wait on the
      // assertion instead — the row appears only once the POST resolves.
      await expect(rows).toHaveCount(before + 1);

      // The delete control only appears on hover, and only for the author.
      await rows.first().hover();
      await page.getByTestId("worklog-delete").first().click();

      await expect(rows).toHaveCount(before);
    } finally {
      await context.close();
    }
  });
});
