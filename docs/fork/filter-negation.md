# Filter negation ("is not") — ledoent fork notes

Working notes for negated work item filters on `ledoent/plane`. Like
`search.md` and `worklogs.md`, this lives under `docs/fork/` so it never
collides with an upstream file on a merge from `preview`.

- **Repo:** `/Users/dkendall/projects/ledoent/plane`
- **Branch:** `feat/filter-negation`
- **Upstream:** `makeplane/plane`, default branch `preview`

## Why this exists

Filtering work items by **State** in `plane.meas-inst.com` offered only `is` —
the operator chip was not even clickable, because the dropdown held a single
option. There was no way to express "everything except Done", which is the
single most common way to look at a backlog.

This is not a bug in the deployment. Negation is **absent from CE**, and
absent in a very deliberate shape: every seam it needs is present in the AGPL
tree, stubbed to a no-op.

| Stub                                                     | CE value                                               |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `types/rich-filters/operators/extended.ts`               | all four operator maps `{}`                            |
| `constants/rich-filters/operator-labels/extended.ts`     | `NEGATED_*_LABELS_MAP` `{}`                            |
| `shared-state/store/rich-filters/config.ts`              | `_getAdditionalOperatorOptions` returns `undefined`    |
| `utils/rich-filters/operators/shared.ts`                 | `getOperatorForPayload` hardcodes `isNegation = false` |
| `utils/rich-filters/operations/traversal/shared.ts`      | `getDisplayOperator` returns its input                 |
| `web/hooks/rich-filters/use-filters-operator-configs.ts` | `allowNegative: false`                                 |

The surrounding machinery is fully built and unused: `isNegation` is threaded
through `addCondition` / `updateConditionOperator` / `restructureExpressionForOperatorChange`,
`shouldUnwrapGroup` takes a `preserveNotGroups` argument it ignores, and
`comparison.ts` sorts on `child.child` — a property no CE node type has.

So this is filling in a feature the fork lacks, not defeating a licence check.
Plane is **AGPL-3.0**; our fork is public, which is what the licence expects of
a modified network-served work.

## Why negation is structural, not an operator

The tempting shape is a `state_id__not_in` lookup key. It does not work, and
the reason is worth recording because it drives the whole design.

`ComplexFilterBackend._validate_fields` rejects any key that is not a declared
filter on the view's `FilterSet`, and `IssueFilterSet` declares only the
positive forms (`state_id__in`, `label_id__in`, …). A `state_id__not_in` key
is a 400.

What the backend _does_ already support is a `not` node —
`_evaluate_node` turns `{"not": {...}}` into `~Q(...)`, with structural
validation in `_validate_structure`. None of that is reachable from the CE UI.

So a negated condition is stored as a **NOT group wrapping the positive
condition**, and the operator on the condition itself stays one the FilterSet
declares:

```jsonc
// "State is none of Backlog, Done"
{ "not": { "state_id__in": "<uuid>,<uuid>" } }

// mixed, as the UI produces it
{ "and": [{ "state_id__in": "<uuid>" }, { "not": { "label_id__in": "<uuid>" } }] }
```

`not_in` / `not_exact` / `not_range` exist **only as display operators**. They
never reach a condition node and never reach the wire.
`getOperatorForPayload` splits them into `{ operator, isNegation }` at the UI
boundary; `getDisplayOperator` reassembles them by checking whether a
condition's immediate parent is a NOT group.

This is also the shape upstream's own stubs imply — `child.child` in
`comparison.ts` means a single-child group node, not a `children` array.

## SQL semantics

Worth knowing, because "is not" means different things for a scalar column and
a many-to-many relation. Both are correct, neither is obvious:

| Filter             | Generated SQL                                    | Means                                 |
| ------------------ | ------------------------------------------------ | ------------------------------------- |
| State is not X     | `NOT (state_id IN (X) AND state_id IS NOT NULL)` | NULL-safe; unset state matches        |
| Label is none of X | `NOT (EXISTS(SELECT 1 FROM issue_labels …))`     | anti-join: **unlabelled items match** |

Django's `split_exclude` produces the anti-join for multi-valued relations, so
"Label is none of X" means _has no matching label row_ rather than _has some
other label_. Work items with no labels at all satisfy it. That is the right
reading of "is none of", but it will surprise anyone expecting the m2m to
behave like a scalar column.

## What changed

Enabled for every work item filter at once, because the operator list is
config-driven: state, state group, label, assignee, cycle, module, project,
priority, created-by, mention, and the date filters.

**Types** — `TFilterNotGroupNode` (single `child`) joins the group union;
`NOT` added to `EXTENDED_LOGICAL_OPERATOR`; display-only `not_exact` / `not_in`
/ `not_range` plus the two maps that convert between positive and negated.
`TAllAvailableOperatorsForDisplay` widens to `TSupportedOperators | TNegatedOperators`.

**Tree ops** (`@plane/utils`) — `createNotGroupNode`, `isNotGroupNode`,
`isNegatedNode`, and an `onNotGroup` branch in `processGroupNode`,
`transformGroup` and `createGroupComparable`. `shouldUnwrapGroup` now honours
its `preserveNotGroups` argument: a NOT group always has exactly one child, so
the old unconditional unwrap would have silently dropped the negation.

**Store** — `filter-helpers.ts` wraps on add and wraps/unwraps on operator
change; `config.ts` emits the negated twin as a second dropdown option when the
operator config sets `allowNegative`; the work item adapter serialises NOT
groups both directions.

**Web** — `useFiltersOperatorConfigs` returns `allowNegative: true`.

No API change. No migration. The wire format was already supported and
validated server-side; only the client could not produce it.

## Merge-conflict surface

Higher than the other fork features, and worth knowing before a merge from
`preview`.

The `extended.ts` files are upstream's designated extension points, so
conflicts there are expected and mechanical. The riskier edits are in **shared**
files that upstream also touches: `expression.ts`, `types/shared.ts`,
`transformation/shared.ts`, `validators/shared.ts`, `comparison.ts`,
`config.ts`, `work-item-filters/adapter.ts`.

The failure mode to watch for is a merge that drops the NOT handling from one
of those and leaves the rest — negation would then silently degrade to its
positive form, which is **worse than an error**, because a saved view would
quietly return the wrong work items. The tests below are the guard: the
adapter round-trip and `shouldUnwrapGroup` cases fail loudly if that happens.

## Tests

| Suite                                                   | Cases | What it can catch                          |
| ------------------------------------------------------- | ----- | ------------------------------------------ |
| `utils/tests/rich-filters-negation.test.ts`             | 15    | tree ops — wrap, unwrap, traverse, compare |
| `shared-state/tests/work-item-filters-negation.test.ts` | 13    | store + adapter round-trip to the wire     |
| `shared-state/tests/filter-config-negation.test.ts`     | 5     | the dropdown the user actually sees        |
| `api/tests/unit/utils/test_issue_filter_negation.py`    | 5     | the backend accepts `not` and negates `Q`  |

The third suite matters more than its size suggests. `allowNegative` travels
from a hook, through a spread into a factory, through another spread into a
field config, and is finally read by `_getAdditionalOperatorOptions`. Nothing
in the type system pins that chain down end to end, so it is asserted against
the real `getStateFilterConfig` rather than a hand-built config.

`test_negated_lookup_key_is_rejected` pins the design decision itself: it
asserts that `state_id__not_in` raises, which is _why_ negation is structural.

`packages/shared-state` declared a `test` script but had no `vitest`
dependency — the script could never have run. Added.

## Not done

- **No OR groups.** `EXTENDED_LOGICAL_OPERATOR` gains only `NOT`. The UI has
  no way to build an OR, and the backend's `or` node stays unreachable.
- **No nested negation.** The UI wraps exactly one condition at a time; a NOT
  around an AND group is representable in the tree and on the wire, but nothing
  produces one.
- **`negOperatorLabel` is unused.** The per-config override is plumbed through
  `getLabelForOperator` but no filter sets it; every filter takes the default
  wording ("is not" / "is none of" / "is not between").
