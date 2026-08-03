/**
 * A thin client over Plane's app API for end-to-end tests.
 *
 * The app namespace authenticates with SessionAuthentication only — no API
 * key — so this does the real browser dance: fetch a CSRF token, sign in, and
 * let the request context carry the session cookie from there.
 */
import { APIRequestContext, request } from "@playwright/test";

const BASE = process.env.PLANE_API_URL ?? "http://localhost:8010";

export type Seed = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  worklogsUrl: string;
};

export class PlaneClient {
  constructor(
    private ctx: APIRequestContext,
    public userId: string = ""
  ) {}

  static async anonymous() {
    return new PlaneClient(await request.newContext({ baseURL: BASE }));
  }

  static async signIn() {
    const ctx = await request.newContext({ baseURL: BASE });
    const csrf = await PlaneClient.csrfToken(ctx);

    // A fresh identity per run keeps runs independent; sign-up doubles as the
    // fixture, since the first user in a workspace is its owner.
    const email = `e2e-${Date.now()}@ledoweb.com`;
    const form = new URLSearchParams({ email, password: "E2ePassw0rd!123" });
    const res = await ctx.post("/auth/sign-up/", {
      headers: {
        "X-CSRFToken": csrf,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: BASE,
      },
      data: form.toString(),
      maxRedirects: 0,
    });
    if (res.status() >= 400) {
      throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
    }
    const client = new PlaneClient(ctx);
    const me = await client.get("/api/users/me/");
    client.userId = me.id;
    return client;
  }

  private static async csrfToken(ctx: APIRequestContext) {
    const res = await ctx.get("/auth/get-csrf-token/");
    const body = await res.json();
    return body.csrf_token ?? body.csrfToken;
  }

  async raw(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, data?: unknown) {
    const csrf = await PlaneClient.csrfToken(this.ctx);
    return this.ctx.fetch(url, {
      method,
      headers: { "X-CSRFToken": csrf, "Content-Type": "application/json", Referer: BASE },
      ...(data === undefined ? {} : { data }),
    });
  }

  private async json(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, data?: unknown) {
    const res = await this.raw(method, url, data);
    if (res.status() >= 400) {
      throw new Error(`${method} ${url} -> ${res.status()} ${await res.text()}`);
    }
    return res.status() === 204 ? null : res.json();
  }

  get = (url: string) => this.json("GET", url);
  post = (url: string, data: unknown) => this.json("POST", url, data);
  patch = (url: string, data: unknown) => this.json("PATCH", url, data);
}

/** A workspace, project and work item, built through the same API the UI uses. */
export async function seedWorkItem(client: PlaneClient): Promise<Seed> {
  const stamp = `${Date.now()}${Math.floor(performance.now())}`.slice(-10);

  const workspace = await client.post("/api/workspaces/", {
    name: `E2E ${stamp}`,
    slug: `e2e-${stamp}`,
    organization_size: "1-10",
  });

  // The identifier is uppercase and length-limited; work items are keyed by it.
  const project = await client.post(`/api/workspaces/${workspace.slug}/projects/`, {
    name: `Worklogs ${stamp}`,
    identifier: `W${stamp.slice(-4)}`,
  });

  const issue = await client.post(
    `/api/workspaces/${workspace.slug}/projects/${project.id}/issues/`,
    { name: `Track time ${stamp}` }
  );

  return {
    workspaceSlug: workspace.slug,
    projectId: project.id,
    issueId: issue.id,
    worklogsUrl: `/api/workspaces/${workspace.slug}/projects/${project.id}/issues/${issue.id}/worklogs/`,
  };
}
