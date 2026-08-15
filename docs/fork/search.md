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

It isn't, yet — though **the original reasoning is obsolete and the conclusion
now survives for different reasons.**

As first written this was a volume-budget argument: a 10Gi `hcloud-volumes` PVC
against a Hetzner cluster sitting at 47 of 48 volumes. Plane moved to GKE
(`gke_meas-inst-prod_us-east1-b_meas-apps`) on 2026-08-15 and that ceiling is
gone — PVCs are `standard-rwo` on `pd.csi.storage.gke.io`, dynamically
provisioned, no fixed count.

What still holds is scale. **Plane holds 70 issues** (measured 2026-08-15).
Against a corpus that size a Postgres `icontains` is instant and stays instant
well into the thousands. An engine buys nothing measurable here and costs a
second stateful component to run, back up and reindex.

Revisit when **any** of these becomes true:

- issue count passes roughly 5,000, or `icontains` shows up in slow queries
- results need to span comments, attachments and pages in one ranked list
- typo tolerance, stemming or relevance ranking is actually wanted

The third bullet is now reachable **without** an engine — see "Postgres
full-text as the next step". Outline runs stemming, ranking and highlighted
snippets on the same Postgres instance this fork already uses, so wanting
quality no longer implies Typesense. Reach for an engine on the first two
bullets, not the third.

If an engine is ever wanted, copy the duropc `Deployment` + reindex `CronJob`
wholesale. An index is rebuildable by definition, so it can sit on the default
`standard-rwo` class without ceremony.

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

## Tests

Two layers, and the split matters:

| Suite                                   | Cases | What it can catch                       |
| --------------------------------------- | ----- | --------------------------------------- |
| `tests/unit/utils/test_search.py`       | 18    | the shape of the `Q` tree — no database |
| `tests/contract/app/test_search_app.py` | 15    | the endpoints against real rows         |

The unit tests alone were not enough. They pass whether or not
`description_stripped` is ever populated, whether or not the permission filters
still hold, and whether or not the projection leaks markup — because they never
execute a query. The contract tests create work items through the model with
`description_html` and drive both search endpoints, so they exercise the
stripping, the scoping and the SQL.

They also cover what must **not** change: titles still match, markup is not
matchable, a bare number still resolves to its work item, another tenant's
matching work item stays invisible, and a project the caller has left is not
searched. The last two matter because this change widens the searched surface,
and widening what is _searched_ must not widen what is _visible_.

**Verified to have teeth.** Against stock `v1.4.0`, nine of the fifteen contract
tests fail and six pass — the six being exactly the ones guarding unchanged
behaviour.

### Running them

The `ledoent-build.yml` gate runs `pnpm --filter @plane/utils test` — **JS
only**. The Python suite is not in CI, so run it deliberately. The unit tests
need no database; the contract tests need Postgres, and create and drop their
own `test_plane` on it.

```sh
cd apps/api
docker run --rm --network plane-review_default -v "$PWD":/work -w /work \
  -e REDIS_URL=redis://review-redis:6379/ \
  -e DATABASE_URL=postgresql://plane:plane@review-db:5432/plane \
  -e SECRET_KEY=test-secret-key \
  makeplane/plane-backend:v1.4.0 sh -c \
  "pip install -q pytest==9.0.3 pytest-django==4.12.0 factory-boy==3.3.0; \
   python -m pytest plane/tests/unit/utils/test_search.py \
                    plane/tests/contract/app/test_search_app.py -q --create-db"
```

The production image ships without pytest and the settings module reads
`REDIS_URL` at import, hence the env vars. Two traps worth knowing: the mounted
source path must be one Docker Desktop shares — **`/private/tmp` is not**, and
mounting from there silently yields an empty directory rather than an error —
and `--create-db` avoids reusing a stale `test_plane` from an earlier run.

The local review stack ships `run-search-tests.sh` (with a `--stock` mode that
reruns the contract tests against `feat/worklogs` in a throwaway worktree) and
`compare-stacks.sh`, which runs the same queries against both live stacks on the
restored production data.

## The backend fix alone does nothing in the UI

Found by standing the branch up against a restore of production and clicking it,
which the API-level tests could not have caught.

The Power-K palette re-filters the API's results **client-side** before
rendering. Both `power-k/ui/modal/wrapper.tsx` and
`navigation/top-nav-power-k.tsx` passed `cmdk` this filter:

```ts
if (i18nValue.toLowerCase().includes(search.toLowerCase())) return 1;
return 0;
```

The item's value is built from its **title** (`search-results.tsx`), so:

- `gateway` renders — the word is in DUROPC-22's title.
- `sage` renders **nothing** — the API returns 5 matches, the palette throws
  all 5 away, because "sage" appears only in the body.

It is the same contiguous-substring assumption the backend had, duplicated in
the frontend, in the same copy-pasted-twice shape. `includes()` on the raw
query also discards multi-word matches whose words are not adjacent, so it
defeats the tokenization fix too.

The fix mirrors the backend one: a single shared `powerKCommandFilter`
(`power-k/ui/modal/filter.ts`) replacing both copies. Static commands still
match on their visible label; server-driven results are passed through
untouched, marked by a `server-result:` value prefix — the same escape hatch
the existing `no-results` sentinel already used. The server decided the match
against fields the palette never renders; re-deciding it on the title is what
threw the results away.

**Any future work that widens what the API searches needs this frontend change
too, or it will look like it did nothing.**

## Sequence-id lookup is single-token only

Numeric tokens are matched against `sequence_id` and OR-ed onto the **whole**
predicate. Upstream does that for any query, so `level 3 rate` returned the one
real hit plus every issue that happens to be number 3 in any project:

```
#3    2. Invite your team 🤜🤛
#22   Select the payment gateway on Level 3 capability and effective rate
#3    Feedback wanted: is Plane working for how we actually work
#3    2. Invite your team 🤜🤛          <- other projects
```

Five of six results were noise. The id lookup now applies **only to
single-token queries**: someone typing three words is searching prose, not
looking up an id. `22` and `DUROPC-22` still jump straight to the issue, which
is how the shortcut is actually used.

| Query          | before     | after |
| -------------- | ---------- | ----- |
| `level 3 rate` | 6 (1 real) | **1** |
| `22`           | 4          | 4     |
| `DUROPC-22`    | 1          | 1     |

This is the one change that is **not** a strict superset of upstream: `fix 22`
no longer reaches issue #22 by number. That is deliberate, and it is why it
sits in its own commit — the tokenization commit stays cherry-pickable alone if
upstream would rather not narrow anything.

## Postgres full-text as the next step

Everything above is substring matching. It answers _does this string occur_,
which leaves two gaps that no amount of tokenizing fixes:

- **No stemming.** "migrating" does not find a body that says "migrate".
- **No ranking.** Thirty matches come back in planner order, so nothing useful
  is first.

Measured on the live Outline corpus, which runs Postgres full-text on the same
database server:

```
websearch_to_tsquery('english','migrating')  ->  10 documents
ILIKE '%migrating%'                          ->   0 documents
```

`feat/search-ranking` closes both by copying what Outline does — a stored
`tsvector`, a GIN index, and `ts_rank_cd` ordering — without adding a service.

### What it adds

A `search_vector` generated column on `Issue` and `Page`, weighted
`setweight(name,'A') || setweight(description_stripped,'B')`, plus a GIN index
on it and a GIN **trigram** index on `name`.

It is a `GeneratedField`, not a trigger and not a `save()` assignment.
`description_stripped` is only written in `Model.save()`, so a `.update()`
leaves it stale; a generated column is recomputed by Postgres from whatever is
in the row and cannot drift. Verified on PG16:

| Property                                    | Result                   |
| ------------------------------------------- | ------------------------ |
| Expression accepted as `STORED` (immutable) | yes                      |
| `migrating` reaches a body saying `migrate` | yes                      |
| Title hit vs body hit rank                  | `1.000000` vs `0.400000` |
| Bulk `UPDATE` reflected without `save()`    | yes                      |

### Why it stays hybrid

Full-text **alone would be a regression**. `tsquery` matches whole lexemes, so
a partial token stops matching. Measured on the same fixtures:

```
search "socket"   tsquery -> 0 rows      ILIKE -> 1 row  ("socketlabs")
```

So the predicate is the union of both, and `ts_rank_cd` orders the union.
Substring-only hits score `0.0` and sort last, but they are still returned.
The rule this preserves: **no query that returned a row before returns fewer
rows now.**

### Rollback

Unlike the substring work, this one carries a migration. Reverting the image
alone is not enough — the generated column and its indexes stay behind, which
is harmless (nothing reads them) but should be reversed with the migration if
the change is abandoned.

## Deploying

> **Superseded 2026-08-15.** This section previously described the Hetzner
> deployment — a helm chart under `/tmp/plane-helm`, tags written into
> `infra/deployments/plane/values.yaml`, and images from Zot. Plane has moved
> to GKE and **none of that applies**. The `plane` namespace no longer exists
> on `hetzner-ledo`.

Plane runs on **`gke_meas-inst-prod_us-east1-b_meas-apps`**, namespace `plane`,
helm release `plane` (chart `plane-ce-1.6.2`). Images come from **Artifact
Registry**, not Zot:

```
us-east1-docker.pkg.dev/meas-inst-prod/containers/plane-{backend,frontend,admin,live,space}
```

Chart values live in the measinst infra repo, not this one — see
`measinst/infra/apps/plane/` (`values.yaml` committed, `values.secret.yaml`
gitignored). Deploy with an explicit kube-context:

```sh
helm --kube-context gke_meas-inst-prod_us-east1-b_meas-apps \
  upgrade --install plane ~/projects/ledoent/plane-helm-charts/charts/plane-ce -n plane \
  -f apps/plane/values.yaml -f apps/plane/values.secret.yaml \
  --set planeVersion=<tag>
```

**The aggregate is now adopted.** `repos.yaml` was written up but unadopted
when this doc was first drafted, and the deployment ran a _split_ — different
tags per component, which is how the backend once ran an image predating
`plane/utils/search.py` while the frontend already had the palette fix. Search
appeared dead because only half of it was deployed.

All seven components now run one tag built from `deploy/measinst`:

```
v1.4.0-worklogs-agg-65eeb414ec
```

Verify the halves agree before debugging a search complaint:

```sh
kubectl --context gke_meas-inst-prod_us-east1-b_meas-apps -n plane \
  get deploy -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image'
# every row should carry the same tag
kubectl --context gke_meas-inst-prod_us-east1-b_meas-apps -n plane \
  exec deploy/plane-api-wl -- ls plane/utils/search.py
# absent => backend predates the search helper, body search cannot work
```

**Rollback is safe.** No schema change, no data migration — reverting to an
earlier image restores the old search behaviour with nothing to undo. That
stops being true once the `search_vector` work below lands, which _does_ carry
a migration.
