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
*is*: the feature is **absent from CE**, not present-but-gated. There is no
worklog model in `apps/api/plane/db/models/`, and `plane.license` handles
instance registration and telemetry, not per-feature entitlement. The only
trace of worklogs in the CE tree is an empty-state illustration at
`packages/propel/src/empty-state/assets/horizontal-stack/worklog.tsx`.

So this is building a feature the fork lacks, not defeating a licence check.
Plane is **AGPL-3.0**; our fork is public, which is what the licence expects of
a modified network-served work.

## Status

| Piece | State |
|---|---|
| Model, migration, serializer, viewset, routes | **done** |
| Django contract tests (14) | **done, passing** |
| Playwright e2e against the running image (9) | **done, passing** |
| **Web UI** | **not started** — the feature is API-only |
| Odoo billing sync | not started |

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

**`logged_at` defaulted to `timezone.now`** — a *datetime* into a `DateField`.
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

## Next: the web UI

The feature is unusable from the interface today. The work is a standard Plane
vertical slice:

| Layer | Where | Pattern to copy |
|---|---|---|
| Service | `apps/web/core/services/issue/` | `issue_comment.service.ts` |
| Store | `apps/web/core/store/issue/` | the comment/link stores |
| Component | `apps/web/core/components/issues/issue-detail-widgets/` | the links widget |
| Wiring | `issue-detail-widget-collapsibles.tsx`, `action-buttons.tsx` | — |

Suggested surface: a **Worklogs** collapsible on the work-item detail showing
entries with author, date and duration, a total from
`worklogs/summary/`, and an inline "Log time" input accepting `1h 30m` /
`90m` / `1.5h`.

Then extend `e2e/worklogs.spec.ts` with a browser-driven test — the current
nine drive HTTP only, which is real verification of the API but not of the UI.

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
2. **Plane with this fork's worklogs** — one tool, but the UI still needs
   building and a new Odoo sync written against these endpoints.
3. **Plane Pro** for the seats that log time — no fork to maintain, per-seat cost.

If (2), the sync is a near-copy of `huly-odoo-timesync`: the shape is the same
(person, minutes, date, work item), only the source client changes. Keep the
`ir.model.data` external-id idempotency pattern — it is what makes re-runs and
corrections safe.

## Deployment, when it comes to that

`plane.hz.ledoweb.com` already resolves (wildcard, 49.13.40.172).
`plane.ledoweb.com` does **not** — it needs a record; every other service uses
the `*.hz.ledoweb.com` convention.

**Volume headroom is the binding constraint, not CPU or memory.** Hetzner caps
attached volumes at 16/server; the cluster sits at worker1 16/16, worker2
16/16, worker4 14/16 — **2 free slots of 48**. `hcloud-volumes` is the default
StorageClass, and the CE chart ships `storageClass: ""` for postgres, valkey,
rabbitmq and minio, so a default install would ask for 4 and leave pods
Pending.

It fits only if shaped deliberately. The chart supports external everything
(`pgdb_remote_url`, `remote_redis_url`, `external_rabbitmq_url`,
`aws_s3_endpoint_url`):

| Component | Placement | hcloud slots |
|---|---|---|
| Postgres | CNPG cluster (operator already runs 8+) | 1 |
| Valkey, RabbitMQ | `local-path` — cache and queue, rebuildable | 0 |
| Object storage | external S3/GCS instead of bundled MinIO | 0 |

App tier is trivial: 7 deployments at 50m CPU / 50Mi memory requested each.
