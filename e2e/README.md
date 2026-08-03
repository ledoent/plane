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

* `REDIS_URL`, `DATABASE_URL`, `AMQP_URL` — the compose service names, not localhost.
* `WEB_URL` / `APP_BASE_URL` — without them `base_host()` raises and sign-up
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
