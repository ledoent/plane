# Search — ledoent fork notes

Working notes for the search changes on `ledoent/plane`. Like `worklogs.md`,
this lives under `docs/fork/` so it never collides with an upstream file on a
merge from `preview`.

- **Repo:** `/Users/dkendall/projects/ledoent/plane`
- **Branch:** `feat/search-descriptions` (branched from `feat/worklogs`)
- **Upstream:** `makeplane/plane`, default branch `preview`

## Why this exists

Searching `sage` in `plane.ledoweb.com` returned nothing, while an issue
entirely about Sage — DUROPC-22, "Select the payment gateway on Level 3
capability and effective rate" — sat in the tracker. Searching
`payment gateway review` also returned nothing, even though the title contains
"payment gateway".

Two independent causes, both in the API:

1. **Only titles were searched.** `search_issues()` used
   `fields = ["name", "sequence_id", "project__identifier"]`. The body was
   never consulted, so anything the author wrote below the title was invisible.
2. **Multi-word queries were matched as one contiguous string.**
   `"payment gateway review"` became a single `LIKE '%payment gateway review%'`.
   The three words are all present in DUROPC-22 but not adjacent, so nothing
   matched. Word order and interleaving mattered, which is not what anyone
   expects from a search box.

A third, structural problem made both worse: the predicate was **copy-pasted
twenty times** across `GlobalSearchEndpoint`, `SearchEndpoint` and
`search_issues`, with the issue field list duplicated four times. Fixing one
call site would have left Power-K, entity search and project issue search
behaving differently.

## Why not Typesense

The obvious reflex — and Typesense is already the house standard here, running
in `duropc-production`, `duropc-staging` and `huly` with a 6-hourly reindex
CronJob. It is the right engine if an engine is needed.

It isn't, yet. **Plane holds 65 issues.** A Typesense deployment would cost a
10Gi `hcloud-volumes` PVC — the same shape duropc's uses — and the cluster sits
at **47 of 48** Hetzner volumes, the exact constraint
`infra/deployments/plane/README.md` was written around. Against 65 documents a
Postgres `icontains` is instant and stays instant well into the thousands.

Revisit when **any** of these becomes true:

- issue count passes roughly 5,000, or `icontains` shows up in slow queries
- results need to span comments, attachments and pages in one ranked list
- typo tolerance, stemming or relevance ranking is actually wanted

At that point copy the duropc `Deployment` + reindex `CronJob` wholesale. An
index is rebuildable by definition, so it can sit on `local-path` like Valkey
and RabbitMQ rather than consuming the last hcloud volume.

Note also that upstream's own answer is **OpenSearch**, and it is **Pro edition
and above** — see [Configure OpenSearch for advanced
search](https://developers.plane.so/self-hosting/govern/advanced-search).
Grepping `opensearch` across the AGPL tree, including current `upstream/preview`,
returns zero hits: the feature is absent from CE, not gated in it. Same posture
as worklogs.

## What changed

New `apps/api/plane/utils/search.py`:

- `build_search_query(query, fields, sequence_fields, sequence_query_max_length)`
  — tokenizes on whitespace, ORs across fields, ANDs across tokens.
- Per-entity field constants (`ISSUE_SEARCH_FIELDS`, `PAGE_SEARCH_FIELDS`, …)
  so the endpoints cannot drift apart and widening a search is one line.

`utils/issue_search.py` and all twenty predicate blocks in
`app/views/search/base.py` now delegate to it. `description_stripped` is added
to the issue and page field lists.

`description_stripped` is the plain-text projection of the rich-text body,
maintained by the model on save. **No migration, no backfill, no new index.**
Permission filters are untouched and applied to the same queryset, and the body
is not added to the `values()` projection — nothing becomes visible that a
member could not already open.

### Commit split is deliberate

| Commit                                         | Scope                                            | Upstream?                   |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------- |
| `fix(api): match search terms as words…`       | helper, tokenization, dedupe, sequence-regex fix | **yes** — proposed upstream |
| `feat(api): search work item and page bodies…` | `description_stripped` in the field lists        | **fork-only**               |

The first is a defect fix that touches no full-text behaviour, so it does not
overlap the Pro OpenSearch feature. The second does, and upstream has left
[#3370](https://github.com/makeplane/plane/issues/3370) (Jan 2024),
[#7108](https://github.com/makeplane/plane/issues/7108) and
[#6370](https://github.com/makeplane/plane/issues/6370) open while pointing
users at Advanced Search. Keep it here.

## Verified against live data

Read-only, against `plane-api-wl` on `plane.ledoweb.com`:

| Query                    | Before | After                           |
| ------------------------ | ------ | ------------------------------- |
| `sage`                   | 0      | 5                               |
| `payment gateway review` | 0      | 1 (DUROPC-22)                   |
| `nuvei`                  | 0      | 1                               |
| `level 3 rate`           | 0      | 1 real + sequence noise (below) |
| `gateway`                | 1      | 3                               |

Unit tests: `apps/api/plane/tests/unit/utils/test_search.py`, 16 cases.

The `ledoent-build.yml` gate runs `pnpm --filter @plane/utils test` — **JS only**.
The Python suite is not in CI, so run it deliberately:

```sh
cd apps/api
docker run --rm -v "$PWD":/work -w /work \
  -e REDIS_URL=redis://localhost:6379/ \
  -e DATABASE_URL=postgresql://plane:plane@localhost:5432/plane \
  -e SECRET_KEY=test-secret-key \
  makeplane/plane-backend:v1.4.0 sh -c \
  "pip install -q pytest==9.0.3 pytest-django==4.12.0 factory-boy==3.3.0; \
   python -m pytest plane/tests/unit/utils/test_search.py -q"
```

The production image ships without pytest and the settings module reads
`REDIS_URL` at import, hence the env vars — the tests themselves touch no
database.

## Known wart: sequence-id noise on multi-word queries

Numeric tokens are matched against `sequence_id` and OR-ed onto the **whole**
predicate, so `level 3 rate` returns the one real hit plus every issue that
happens to be number 3 in any project:

```
#3    2. Invite your team 🤜🤛
#22   Select the payment gateway on Level 3 capability and effective rate
#3    Feedback wanted: is Plane working for how we actually work
#3    2. Invite your team 🤜🤛          <- other projects
```

This is **pre-existing upstream behaviour**, not a regression — the old code
OR-ed sequence matches the same way. It was preserved on purpose so the
upstream commit is a strict superset: nothing that matched before stops
matching, which is the strongest argument for merging it.

The fix, if wanted, is to apply the sequence OR only when the query is a single
token — someone typing three words is not searching by ID. That narrows results
versus upstream, so it is a separate decision from the tokenization fix.

## Deploying

`ledoent-build.yml` triggers on push to `feat/worklogs` only. This branch
builds via `workflow_dispatch` with an explicit tag, or merge to
`feat/worklogs` first. Then the usual:

```sh
helm upgrade plane /tmp/plane-helm/charts/plane-ce -n plane \
  -f values.yaml -f values.secret.yaml --set planeVersion=<tag>
```

and write the tag into `infra/deployments/plane/values.yaml` so file and
cluster agree.

**Rollback is safe.** No schema change, no data migration — reverting to an
earlier image restores the old search behaviour with nothing to undo.
