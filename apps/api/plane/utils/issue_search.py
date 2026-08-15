# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.utils.search import (
    ISSUE_SEARCH_FIELDS,
    ISSUE_SEQUENCE_FIELDS,
    add_search_rank,
    build_hybrid_search_query,
)

# Queries longer than this are treated as prose and not mined for sequence ids
SEQUENCE_QUERY_MAX_LENGTH = 20


def search_issues(query, queryset):
    """Filter to work items matching ``query``, best match first.

    Matching is the union of the stored full-text vector and the substring
    predicate, so this returns a superset of what substring matching alone
    found. Ordering is ``ts_rank_cd`` over the vector; rows that matched only
    on a substring score 0.0 and sort last, but are still returned.

    The annotation is applied before ``.distinct()`` on purpose: ordering by an
    annotated expression puts that expression in the ``SELECT DISTINCT`` list,
    which is only valid if it is annotated first.
    """
    return add_search_rank(
        queryset.filter(
            build_hybrid_search_query(
                query,
                fields=ISSUE_SEARCH_FIELDS,
                sequence_fields=ISSUE_SEQUENCE_FIELDS,
                sequence_query_max_length=SEQUENCE_QUERY_MAX_LENGTH,
            )
        ),
        query,
    ).distinct()
