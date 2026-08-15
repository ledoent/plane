# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Postgres full-text search columns for work items and pages.

Adds a stored, generated ``tsvector`` over the same fields the substring search
already reads, plus the two indexes that make it useful:

* a GIN index on the vector, for stemmed matching and relevance ranking
* a GIN trigram index on ``name``, for partial and misspelt tokens that a
  ``tsquery`` cannot reach ("socket" does not match "socketlabs" under
  full-text, because they stem to different lexemes)

The column is a ``GeneratedField`` rather than a trigger. Postgres recomputes
it on every write, including bulk updates that bypass ``Model.save()`` — which
matters here, because ``description_stripped`` itself is only maintained in
``save()`` and so already has that gap. A generated column cannot drift from
its inputs the way a trigger-free denormalised column can.

The expression is immutable (``to_tsvector`` with an explicit regconfig,
``setweight``, ``coalesce``), which is what Postgres requires of a stored
generated column.

Weighting is deliberate: ``name`` is weight A and ``description_stripped`` is
weight B, so a title hit outranks a body hit for the same term.
"""

import django.contrib.postgres.indexes
import django.contrib.postgres.search
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models
from django.db.models import Value
from django.db.models.functions import Coalesce


def _vector():
    """Weighted tsvector over title (A) and body (B)."""
    return django.contrib.postgres.search.SearchVector(
        Coalesce("name", Value("")), weight="A", config="english"
    ) + django.contrib.postgres.search.SearchVector(
        Coalesce("description_stripped", Value("")), weight="B", config="english"
    )


class Migration(migrations.Migration):
    dependencies = [("db", "0123_issueworklog")]

    operations = [
        # Required for the trigram index below. Idempotent.
        TrigramExtension(),
        migrations.AddField(
            model_name="issue",
            name="search_vector",
            field=models.GeneratedField(
                expression=_vector(),
                output_field=django.contrib.postgres.search.SearchVectorField(null=True),
                db_persist=True,
            ),
        ),
        migrations.AddField(
            model_name="page",
            name="search_vector",
            field=models.GeneratedField(
                expression=_vector(),
                output_field=django.contrib.postgres.search.SearchVectorField(null=True),
                db_persist=True,
            ),
        ),
        migrations.AddIndex(
            model_name="issue",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["search_vector"], name="issue_search_vector_gin"
            ),
        ),
        migrations.AddIndex(
            model_name="page",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["search_vector"], name="page_search_vector_gin"
            ),
        ),
        migrations.AddIndex(
            model_name="issue",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["name"],
                name="issue_name_trgm_gin",
                opclasses=["gin_trgm_ops"],
            ),
        ),
        migrations.AddIndex(
            model_name="page",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["name"],
                name="page_name_trgm_gin",
                opclasses=["gin_trgm_ops"],
            ),
        ),
    ]
