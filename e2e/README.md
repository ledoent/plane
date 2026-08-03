# Plane e2e — worklogs

End-to-end tests against a locally running Plane API. Real HTTP against the
built image: each spec signs up, creates its own workspace, project and work
item through the same endpoints the UI calls, so a pass means the feature works
in the assembled application rather than only in Django's test client.

## Running

```sh
cd /path/to/plane
docker compose -f docker-compose-local.yml -f docker-compose.override.yml up -d \
  plane-db plane-redis plane-mq plane-minio api

cd e2e && npm install && npx playwright test
```

### The browser suite

`worklogs.ui.spec.ts` drives the interface rather than HTTP, so it needs the
web app running as well, and it is **skipped unless `PLANE_WEB_URL` is set** —
the HTTP suite still runs on its own against an API-only stack.

```sh
VITE_API_BASE_URL="http://localhost:8010" pnpm --filter web dev
PLANE_WEB_URL=http://localhost:3000 npx playwright test worklogs.ui.spec.ts
```

Two things the API needs before a browser can post to it:

- **`CORS_ALLOWED_ORIGINS`** in `apps/api/.env` must list the web origin. Left
  unset, Django falls back to `CORS_ALLOW_ALL_ORIGINS` but leaves
  `CSRF_TRUSTED_ORIGINS` empty, and every cross-origin POST answers 403.
- **Onboarding.** A user created through sign-up alone has an unfinished
  profile, so the web app redirects every route to `/onboarding/` and the spec
  would only ever see the profile form. `PlaneClient.completeOnboarding()`
  clears it; the specs call it in `beforeAll`.

The suite adopts the API client's session rather than driving the sign-up form:
cookies are not port-scoped, so a session set on `localhost:8010` is sent to
the web app on `localhost:3000` unchanged.

**Check which server actually answers.** `localhost` resolves to `::1` before
`127.0.0.1` on macOS, so two dev servers can hold the same port on different
stacks and the browser silently reaches the wrong application. `lsof -nP
-iTCP:<port> -sTCP:LISTEN` shows both; `curl -s http://localhost:<port>/ | grep
-o '<title>[^<]*'` confirms which one you get.

## First-run setup, and why it is needed

A fresh Plane instance refuses every sign-up with
`error_code=5000&error_message=INSTANCE_NOT_CONFIGURED` and answers `401` on
`/api/users/me/`. The entrypoint runs `register_instance` and
`configure_instance`, but neither flips `Instance.is_setup_done` — that
normally happens through the god-mode admin onboarding. For a headless test
run, set it directly:

```sh
docker compose -f docker-compose-local.yml -f docker-compose.override.yml \
  exec -T api python manage.py shell -c \
  "from plane.license.models import Instance; i=Instance.objects.first(); i.is_setup_done=True; i.save()"
```

Two other things the API needs, both in `apps/api/.env`:

- `REDIS_URL`, `DATABASE_URL`, `AMQP_URL` — the compose service names, not localhost.
- `WEB_URL` / `APP_BASE_URL` — without them `base_host()` raises and sign-up
  answers `500` with `'NoneType' object has no attribute 'rstrip'`.

`docker compose restart` does **not** reload `env_file`; use
`up -d --force-recreate api` after editing it.

## Local port

`docker-compose.override.yml` moves the API to **8010**. On this machine an ssh
tunnel already holds 8000 — and the failure is deceptive, because Docker
reports the bind error while the stale listener keeps answering, so a health
check against 8000 looks healthy while the app is not there. Override
`PLANE_API_URL` if you move it again.

## Why this is standalone

`e2e/` sits outside the pnpm workspace globs (`apps/*`, `packages/*`), so it
carries its own `package.json` and cannot disturb the monorepo's dependency
tree.
