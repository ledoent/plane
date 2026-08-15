# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Full-text ranking behaviour, driven against real rows.

These have to be contract tests rather than unit tests. The whole change lives
in Postgres — a generated ``tsvector`` column, English stemming, and
``ts_rank_cd`` ordering. A test that asserts the shape of the ``Q`` tree would
pass while stemming was silently broken, which is exactly the failure mode the
substring work already ran into.

Three properties are worth defending:

* stemming finds what substring matching cannot
* the union never returns *fewer* rows than substring matching alone
* ranking puts the best row first, which is the half substring search had no
  answer for at all
"""

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember
from plane.utils.issue_search import search_issues

GLOBAL_SEARCH = "/api/workspaces/{slug}/search/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="DuroPC",
        identifier="DUROPC",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def _issue(project, name, body=""):
    return Issue.objects.create(
        name=name,
        project=project,
        workspace=project.workspace,
        description_html=f"<p>{body}</p>" if body else "<p></p>",
    )


@pytest.fixture
def corpus(db, project):
    return {
        # "migrate" in the body; a search for "migrating" must reach it by
        # stemming. This is the case measured on live data as 10 hits under
        # tsquery versus 0 under ILIKE.
        "stemmed": _issue(project, "Order backfill", "We migrate the legacy orders next week"),
        # Title carries the term: must outrank a body-only hit for the same term.
        "title_hit": _issue(project, "Deliverability review", "unrelated body text"),
        "body_hit": _issue(project, "Weekly sync", "notes on deliverability and bounce handling"),
        # Partial token no stemmer reaches — substring is the only way in.
        "partial": _issue(project, "Vendor list", "sending through socketlabs today"),
    }


@pytest.mark.django_db
def test_stemming_finds_inflected_forms(corpus, project):
    """"migrating" must reach a body that says "migrate"."""
    found = search_issues("migrating", Issue.objects.filter(project=project))
    assert corpus["stemmed"].id in {i.id for i in found}


@pytest.mark.django_db
def test_partial_token_still_matches(corpus, project):
    """Full-text must not cost us substring recall.

    "socket" is not a lexeme of "socketlabs", so tsquery alone misses this.
    The hybrid predicate has to keep it.
    """
    found = search_issues("socket", Issue.objects.filter(project=project))
    assert corpus["partial"].id in {i.id for i in found}


@pytest.mark.django_db
def test_title_match_outranks_body_match(corpus, project):
    """Weighting is the point of setweight(A)/setweight(B)."""
    found = list(search_issues("deliverability", Issue.objects.filter(project=project)))
    ids = [i.id for i in found]
    assert corpus["title_hit"].id in ids and corpus["body_hit"].id in ids
    assert ids.index(corpus["title_hit"].id) < ids.index(corpus["body_hit"].id)


@pytest.mark.django_db
def test_results_are_ranked_not_arbitrary(corpus, project):
    """Every returned row carries a rank, and they arrive in descending order."""
    found = list(search_issues("deliverability", Issue.objects.filter(project=project)))
    ranks = [i.search_rank for i in found]
    assert ranks == sorted(ranks, reverse=True)


@pytest.mark.django_db
def test_empty_query_filters_nothing(corpus, project):
    """Contract inherited from build_search_query: no term supplied, no filter."""
    base = Issue.objects.filter(project=project)
    assert search_issues("", base).count() == base.count()


@pytest.mark.django_db
def test_malformed_query_does_not_error(corpus, project):
    """websearch_to_tsquery must degrade, not raise.

    A stray quote or a bare operator is user input, not a bug report. ``raw``
    search_type would raise here and surface as a 500.
    """
    for query in ['"unclosed', "or", "-", "a & b", "'"]:
        assert search_issues(query, Issue.objects.filter(project=project)).count() >= 0


@pytest.mark.django_db
def test_global_search_endpoint_ranks(session_client, workspace, corpus):
    """The wiring, not just the helper: the endpoint returns ranked issues."""
    response = session_client.get(
        GLOBAL_SEARCH.format(slug=workspace.slug),
        {"search": "deliverability", "workspace_search": "true"},
    )
    assert response.status_code == status.HTTP_200_OK
    names = [i["name"] for i in response.json()["results"]["issue"]]
    assert names.index("Deliverability review") < names.index("Weekly sync")


@pytest.mark.django_db
def test_generated_column_tracks_bulk_updates(corpus, project):
    """The reason this is a generated column and not a save() assignment.

    ``description_stripped`` is only written in ``Model.save()``, so a bulk
    update leaves it stale. ``search_vector`` is computed by Postgres from
    whatever is in the row, so a title changed via ``update()`` — which never
    calls ``save()`` — is immediately searchable under its new title.
    """
    issue = corpus["title_hit"]
    Issue.objects.filter(id=issue.id).update(name="Rekonciliation sweep")
    found = search_issues("rekonciliation", Issue.objects.filter(project=project))
    assert issue.id in {i.id for i in found}
