# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Django imports
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F, Q

# Match whole integers only. The lookaround excludes the components of a
# decimal: a plain \b\d+\b treats the dot in "3.5" as a word boundary and
# yields both 3 and 5, so searching a version string surfaced unrelated issues
# by sequence id. A trailing dot that is not followed by a digit ("issue 22.")
# is still sentence punctuation, and 22 stays matchable. A digit preceded by
# a dot is part of a decimal too — ".5" must not yield 5.
SEQUENCE_PATTERN = re.compile(r"(?<![\d.])\b\d+\b(?!\.\d)")

# Upper bound on tokens taken from one query. Every token costs one predicate
# per searched field, so this caps the size of the SQL a single request can
# build. Well above any real search — a dozen AND-ed words has narrowed the
# result set to almost nothing already.
MAX_SEARCH_TOKENS = 12

# Searchable fields per entity, shared by every search endpoint so that the
# global search, the entity search and the project issue search cannot drift
# apart. Adding a field here widens all of them at once.
#
# `description_stripped` is the plain-text projection of an entity's rich-text
# body, maintained on save, so searching it needs no migration and no new
# index. It is what makes a work item findable by anything its author wrote
# rather than only by the words that fit in a title.
WORKSPACE_SEARCH_FIELDS = ["name"]
PROJECT_SEARCH_FIELDS = ["name", "identifier"]
ISSUE_SEARCH_FIELDS = ["name", "description_stripped", "project__identifier"]
ISSUE_SEQUENCE_FIELDS = ["sequence_id"]
CYCLE_SEARCH_FIELDS = ["name"]
MODULE_SEARCH_FIELDS = ["name"]
PAGE_SEARCH_FIELDS = ["name", "description_stripped"]
VIEW_SEARCH_FIELDS = ["name"]
USER_MENTION_SEARCH_FIELDS = [
    "member__first_name",
    "member__last_name",
    "member__display_name",
]


def build_search_query(query, fields, sequence_fields=(), sequence_query_max_length=None):
    """Build a case-insensitive search predicate over ``fields``.

    Tokens are AND-ed and fields are OR-ed: every whitespace-separated token in
    ``query`` must appear in at least one of ``fields``. Matching the query as a
    single contiguous string instead — which is what a bare ``__icontains``
    does — means "payment gateway review" fails against a record titled
    "Select the payment gateway on Level 3 capability", because the three words
    never appear adjacently. Tokenizing makes word order and interleaving
    irrelevant.

    ``sequence_fields`` are integer columns (an issue's ``sequence_id``) matched
    exactly against a numeric token, and OR-ed onto the whole predicate so that
    typing an issue number jumps straight to it.

    That lookup applies to **single-token queries only**. Someone typing three
    words is searching prose, not looking up an id, and OR-ing the id match into
    a multi-word query drags in every record that happens to carry that number:
    "level 3 rate" returned its one real hit plus every issue numbered 3 in
    every project. Restricting it to one token keeps the id shortcut — which is
    how it is actually used — and drops the noise.

    ``sequence_query_max_length`` additionally skips the lookup for tokens
    longer than the given length, so a long slug is not mined for stray digits.

    Only the first ``MAX_SEARCH_TOKENS`` tokens are used. Each token adds one
    predicate per field, so an unbounded token count would let a single request
    build an arbitrarily large SQL expression — a cost the previous whole-query
    ``icontains`` did not have. Ignoring the tail is safe: tokens are AND-ed, so
    the retained ones have already narrowed the result set at least as much.

    An empty query returns an empty ``Q()``, which filters nothing — callers
    rely on that to mean "no search term supplied".
    """
    if not query:
        return Q()

    tokens = query.split()[:MAX_SEARCH_TOKENS]
    if not tokens:
        return Q()

    text_query = Q()
    for token in tokens:
        token_query = Q()
        for field in fields:
            token_query |= Q(**{f"{field}__icontains": token})
        text_query &= token_query

    sequence_query = Q()
    if (
        sequence_fields
        and len(tokens) == 1
        and (sequence_query_max_length is None or len(query) <= sequence_query_max_length)
    ):
        for sequence_id in SEQUENCE_PATTERN.findall(query):
            for field in sequence_fields:
                sequence_query |= Q(**{field: sequence_id})

    if sequence_query:
        return text_query | sequence_query

    return text_query


# ---------------------------------------------------------------------------
# Full-text ranking
# ---------------------------------------------------------------------------

# Postgres text-search configuration. English stemming is what makes
# "migrating" match a body that says "migrate" — measured on live data, that
# single difference was 10 documents found versus 0.
SEARCH_CONFIG = "english"


def build_search_vector_query(query):
    """Return a ``SearchQuery`` for ``query``, or ``None`` if it is empty.

    Uses ``websearch`` rather than ``plain``: it accepts quoted phrases, ``or``
    and ``-exclusion`` from users who expect web-search syntax, and — unlike
    ``raw`` — never raises on malformed input, so a stray quote degrades to a
    plain match instead of a 500.
    """
    if not query or not query.strip():
        return None
    return SearchQuery(query, config=SEARCH_CONFIG, search_type="websearch")


def add_search_rank(queryset, query, vector_field="search_vector"):
    """Annotate ``queryset`` with ``search_rank`` and order by it.

    Ranking is the half that substring matching cannot provide at all. Before
    this, results came back in whatever order the planner produced, so a query
    matching thirty work items put no useful one first.

    Rows that match only via the substring predicate — partial tokens that no
    stemmer will reach, such as "socket" inside "socketlabs" — score 0.0 from
    ``SearchRank`` and sort last, behind every full-text hit. They are still
    returned; recall is never traded for ranking.

    ``ts_rank_cd`` (cover density) is used rather than ``ts_rank`` because it
    accounts for how close the matched lexemes sit to one another, which is
    what makes a phrase hit outrank a document that merely contains the same
    words in unrelated paragraphs.
    """
    search_query = build_search_vector_query(query)
    if search_query is None:
        return queryset
    return queryset.annotate(
        search_rank=SearchRank(F(vector_field), search_query, cover_density=True)
    ).order_by("-search_rank")


def build_full_text_query(query, vector_field="search_vector"):
    """Return a ``Q`` matching ``query`` against the stored tsvector.

    Returns an empty ``Q()`` for an empty query, matching
    ``build_search_query``'s contract that "no term supplied" filters nothing.
    """
    search_query = build_search_vector_query(query)
    if search_query is None:
        return Q()
    return Q(**{vector_field: search_query})


def build_hybrid_search_query(
    query,
    fields,
    sequence_fields=(),
    sequence_query_max_length=None,
    vector_field="search_vector",
):
    """Union of full-text and substring matching.

    Full-text alone would be a regression, not an upgrade. ``tsquery`` matches
    whole lexemes, so a partial token stops matching: searching "socket" finds
    nothing in a body that says "socketlabs", which the existing ``icontains``
    handles. Substring alone gives no stemming and no ranking.

    OR-ing them keeps every result either approach would have returned, and
    ``add_search_rank`` then orders the union so the stemmed, well-covered hits
    lead. This is deliberately a superset of the previous behaviour: no query
    that returned a row before returns fewer rows now.
    """
    substring = build_search_query(
        query,
        fields=fields,
        sequence_fields=sequence_fields,
        sequence_query_max_length=sequence_query_max_length,
    )
    full_text = build_full_text_query(query, vector_field=vector_field)
    if not full_text:
        return substring
    if not substring:
        return full_text
    return substring | full_text
