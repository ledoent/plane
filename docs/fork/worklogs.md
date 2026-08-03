# Worklogs — ledoent fork notes

Working notes for the time-tracking feature on `ledoent/plane`. Everything in
`docs/fork/` is ours, nested so it never collides with an upstream file on a
merge from `preview`.

- **Repo:** `/Users/dkendall/projects/ledoent/plane`
- **Branch:** `feat/worklogs` (pushed; no PR opened)
- **Upstream:** `makeplane/plane`, default branch `preview`
- **Chart fork:** `ledoent/plane-helm-charts` (from `makeplane/helm-charts`)

## Why this exists

Plane Community Edition has no time tracking. Worklogs are a paid feature from
**Pro ($6/seat/month)**; the free tier also caps at 12 users.

Checked before writing any code, because the answer changes what this work
_is_: the feature is **absent from CE**, not present-but-gated. There is no
worklog model in `apps/api/plane/db/models/`, and `plane.license` handles
instance registration and telemetry, not per-feature entitlement. The only
trace of worklogs in the CE tree is an empty-state illustration at
`packages/propel/src/empty-state/assets/horizontal-stack/worklog.tsx`.

So this is building a feature the fork lacks, not defeating a licence check.
Plane is **AGPL-3.0**; our fork is public, which is what the licence expects of
a modified network-served work.

## Status

| Piece                                         | State             |
| --------------------------------------------- | ----------------- |
| Model, migration, serializer, viewset, routes | **done**          |
| Django contract tests (14)                    | **done, passing** |
| Playwright e2e — HTTP (9)                     | **done, passing** |
| Web UI — service, store, Worklogs widget      | **done**          |
| Duration parser unit tests (14)               | **done, passing** |
| Playwright e2e — browser (3)                  | **done, passing** |
| Odoo billing sync                             | not started       |

## What was built

`IssueWorklog`, following the existing per-issue resource pattern (modelled on
`IssueLink`):

```
apps/api/plane/db/models/worklog.py
apps/api/plane/db/migrations/0123_issueworklog.py
apps/api/plane/app/serializers/worklog.py
apps/api/plane/app/views/issue/worklog.py
apps/api/plane/app/urls/issue.py          (3 routes)
apps/api/plane/tests/contract/test_worklogs.py
```

Routes, all under the app namespace (session auth only — no API key):

```
GET  POST    /api/workspaces/<slug>/projects/<id>/issues/<id>/worklogs/
GET  PATCH  DELETE
             /api/workspaces/<slug>/projects/<id>/issues/<id>/worklogs/<pk>/
GET          /api/workspaces/<slug>/projects/<id>/issues/<id>/worklogs/summary/
```

### Decisions worth not relitigating

**Duration is whole minutes, not decimal hours.** The canonical unit is the one
people type, and integers do not drift the way `0.1 + 0.2` does when a month of
entries is summed for an invoice.

**`logged_at` is separate from `created_at`.** Friday's work is routinely
entered on Monday; the billing period follows when the work happened.

**Three rules exist because the output is money:**

1. Time is attributed to the authenticated caller, never to the payload —
   otherwise anyone could book hours against a colleague and those hours become
   an invoice line with the wrong name on it.
2. Only the author may edit or delete an entry.
3. A duration over 24h (1440 min) is refused — almost always hours typed into a
   field that wanted minutes, which would silently inflate every total it
   appears in.

## Bugs found on the way

**`logged_at` defaulted to `timezone.now`** — a _datetime_ into a `DateField`.
DRF refuses to coerce rather than drop timezone information, so every create
returned 500. Now `timezone.localdate`. The fix was squashed into the original
migration; one unreleased change should not ship two migrations.

**`UserFactory` never set `username`**, which is `UNIQUE`. Any test creating a
second user died on a duplicate empty key — which is why the existing suite
builds extra users by hand instead of using the factory. Fixed in
`apps/api/plane/tests/factories.py`.

Baselined that fix against a clean tree: **7 failed / 26 passed both with and
without it**. The ~43 failures in the full suite are pre-existing on upstream
`preview`, not ours. Re-baseline the same way before blaming any future change.

## Running it locally

```sh
cd /Users/dkendall/projects/ledoent/plane
docker compose -f docker-compose-local.yml -f docker-compose.override.yml up -d \
  plane-db plane-redis plane-mq plane-minio api

cd e2e && npm install && npx playwright test        # 9 tests
```

Django tests (pytest is not in the dev image, hence the install):

```sh
docker compose -f docker-compose-local.yml -f docker-compose.override.yml \
  run --rm --no-deps -T api sh -c \
  "pip install -q -r requirements/test.txt && python -m pytest plane/tests/contract/test_worklogs.py -q"
```

### Setup traps — all of these cost time, none are obvious from the failure

1. **`Instance.is_setup_done` is never set** by `register_instance` /
   `configure_instance`. Until it is, every sign-up redirects with
   `error_code=5000&error_message=INSTANCE_NOT_CONFIGURED` and
   `/api/users/me/` answers 401.
   ```sh
   docker compose -f docker-compose-local.yml -f docker-compose.override.yml \
     exec -T api python manage.py shell -c \
     "from plane.license.models import Instance; i=Instance.objects.first(); i.is_setup_done=True; i.save()"
   ```
2. **`WEB_URL` / `APP_BASE_URL` must be set** in `apps/api/.env` or
   `base_host()` raises and sign-up answers 500 with a bare
   `'NoneType' object has no attribute 'rstrip'`.
3. **`REDIS_URL`, `DATABASE_URL`, `AMQP_URL`** must use the compose service
   names (`plane-redis`, `plane-db`, `plane-mq`), not localhost.
4. **`docker compose restart` does not reload `env_file`.** Use
   `up -d --force-recreate api` after editing it.
5. **The API waits on MinIO** (`Checking bucket...`) — start `plane-minio` or
   it hangs before binding a port.
6. **Port 8000 collides** with an ssh tunnel on this machine.
   `docker-compose.override.yml` moves it to **8010**. Worth naming because the
   failure lies: Docker reports the bind error while the stale listener keeps
   answering, so a health check against 8000 reads green while the app is not
   there. Check with `lsof -nP -iTCP:8000 -sTCP:LISTEN`.
7. **Deleting files under the live bind mount** can leave the container's view
   stale — a `makemigrations` write failed with `FileNotFoundError` on a path
   that existed on the host. Re-run after listing the directory from inside the
   container.

## The web UI

A **Worklogs** collapsible on the work-item detail, built on the links widget's
pattern. Entries show author, date, duration and description; the collapsible's
indicator is the total from `worklogs/summary/`; a "Log time" button in the
action row opens an inline form.

```
packages/types/src/issues/issue_worklog.ts
packages/utils/src/work-item/worklog.ts          parser + formatter
packages/utils/tests/worklog.test.ts             14 tests
apps/web/core/services/issue/issue_worklog.service.ts
apps/web/core/store/issue/issue-details/worklog.store.ts
apps/web/core/components/issues/issue-detail-widgets/worklogs/
e2e/worklogs.ui.spec.ts                          3 browser tests
```

### Decisions worth not relitigating

**The indicator is the total, not a count.** "Twelve entries" is not
information; "6h 30m" is the number people opened the widget for.

**Duration is parsed on the client, and the parser is unit-tested.** The field
takes `1h 30m`, `90m`, `1.5h` or a bare `90`, and a bare number means minutes
because that is the unit the API stores. Anything unreadable is refused rather
than guessed — a wrong duration becomes a wrong invoice line. The browser spec
asserts that typing `1h 30m` stores the integer `90`, which is exactly where a
client-side parser and the server can drift apart.

**The widget stays hidden until there is something to show**, matching links
and attachments — with the addition that an open form counts, or the "Log time"
button would open a form inside a widget that never renders.

**Worklogs are hidden for epics.** The routes are registered under `issues/`
only, so an epic has nowhere to post to; both the collapsible and the action
button check `issueServiceType`.

**Delete is shown only to the author**, mirroring the API rule rather than
letting the UI offer an action the server will refuse.

### Traps found building it

1. **`@plane/utils` had no test runner.** Vitest was already in the workspace
   catalog, so the parser tests cost one devDependency and a `test` script.
2. **A user created through the API alone is not onboarded**, so the web app
   redirects every route to `/onboarding/` and a browser spec sees only the
   profile form. `PlaneClient.completeOnboarding()` clears it.
3. **`CORS_ALLOWED_ORIGINS` unset means `CSRF_TRUSTED_ORIGINS` is empty**, and
   Django then rejects browser POSTs cross-origin. Set it in `apps/api/.env` to
   the web origin before running the browser suite.
4. **Playwright's `count()` takes one snapshot and does not retry.** Use
   `await expect(rows).toHaveCount(n)` after any action that posts.
5. **`localhost` resolves to `::1` before `127.0.0.1` on macOS.** Two dev
   servers can hold the same port on different stacks, and the browser silently
   reaches the other application. Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`
   and confirm the page title.

## The strategic question this is really about

MEAS/Duro work is currently tracked in **Huly**, whose time tracking is free
and already wired to Odoo billing via
`ledoent/huly-odoo-timesync` (private). That sync reads Huly
`TimeSpendReport` records and writes Odoo `account.analytic.line` timesheets,
which roll into `qty_delivered` on a sales order.

So the choice is not "can we run Plane" — the chart works and the cluster fits
it (see below). It is whether Plane is enough of an upgrade to justify
rebuilding the billing path against a different API. Three options:

1. **Plane for issues, Huly for time** — two tools, the existing sync unchanged.
2. **Plane with this fork's worklogs** — one tool. The API and the UI are both
   built now; what remains is a new Odoo sync written against these endpoints.
3. **Plane Pro** for the seats that log time — no fork to maintain, per-seat cost.

If (2), the sync is a near-copy of `huly-odoo-timesync`: the shape is the same
(person, minutes, date, work item), only the source client changes. Keep the
`ir.model.data` external-id idempotency pattern — it is what makes re-runs and
corrections safe.

## Deployment

**Live at https://plane.ledoweb.com** (2026-08-03), running **fork images**
`registry.hz.ledoweb.com/ledoent/plane-*:v1.4.0-worklogs-de1fb87`, built by
`.github/workflows/ledoent-build.yml`. Migration `0123_issueworklog` is
applied. Config, secrets recipe and smoke tests:
`~/projects/ledoent/infra/deployments/plane/`.

All five images are fork-built even though only frontend and backend carry
worklogs code: the chart composes every image as `<image>:{{ .planeVersion }}`,
so the tag is global and a mixed fork/upstream deployment is not expressible
without patching the chart.

**Uploads need bucket CORS, and the failure is deceptive.** Plane mints a
presigned POST and the _browser_ uploads straight to S3, then calls back to
mark the asset complete. With no CORS rule the object still lands in the bucket
— the write succeeds — but the browser blocks JS from reading the response, so
the callback never fires. The symptom is avatars and project covers failing
while the API log shows nothing but `200`s and the bytes sit in S3 with
`FileAsset.is_uploaded = False`. Rule and verification in the deployment README.

**Google sign-in is configured in the database, not the chart.**
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `IS_GOOGLE_ENABLED` are
`InstanceConfiguration` rows (the secret Fernet-encrypted off `SECRET_KEY`), so
they survive redeploys and never touch a values file. Note `/api/instances/` is
cached for two hours — writing the rows directly requires
`invalidate_cache_directly(path="/api/instances/", user=False)` or the change
appears to do nothing.

Both hostnames now resolve to the cluster ingress, `49.13.40.172`:
`plane.hz.ledoweb.com` via the `*.hz` wildcard, and `plane.ledoweb.com` via an
A record added directly (Cloudflare zone `ledoweb.com`, unproxied).

Unproxied is deliberate and matches `observe.ledoweb.com`, the other
cluster-hosted app: the orange cloud caps uploads at 100 MB on the Free plan,
which a tool with file attachments will hit.

Worth knowing for the next host: the cluster's `letsencrypt-prod` ClusterIssuer
resolves `ledoweb.com` by **DNS-01 via Cloudflare**, not HTTP-01 — its
`dnsZones` selector beats the http01 catch-all. cert-manager writes a
`_acme-challenge` TXT record and waits on its own propagation check, so a
`pending` challenge for a few minutes is normal rather than a fault.

**Volume headroom is the binding constraint, not CPU or memory.** Hetzner caps
attached volumes at 16/server; the cluster sits at worker1 16/16, worker2
16/16, worker4 14/16 — **2 free slots of 48**. `hcloud-volumes` is the default
StorageClass, and the CE chart ships `storageClass: ""` for postgres, valkey,
rabbitmq and minio, so a default install would ask for 4 and leave pods
Pending.

It fits only if shaped deliberately. As deployed it consumes **zero** new
volumes — the count was 46/48 before the install and 46/48 after:

| Component        | Placement                                           | hcloud slots |
| ---------------- | --------------------------------------------------- | ------------ |
| Postgres         | `plane` db on the existing `shared-db` CNPG cluster | 0            |
| Valkey, RabbitMQ | `local-path` — cache and queue, rebuildable         | 0            |
| Object storage   | Hetzner S3 `ledo-plane-uploads`, MinIO disabled     | 0            |

Putting the database in the _existing_ shared cluster rather than a new CNPG
cluster is what turns the postgres line from 1 slot into 0, and it inherits the
30-day backups already configured there.

App tier is trivial: 7 deployments at 50m CPU / 50Mi memory requested each —
with one exception. **The worker OOMKills at the chart's 1000Mi default**
(exit 137, restart loop) because Celery imports every module in
`plane.bgtasks` at boot; it needs ~2000Mi. The loop reads like a crash and is
purely the limit.
