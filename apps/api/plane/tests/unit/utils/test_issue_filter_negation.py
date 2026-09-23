# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from django.db.models import Q
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import Issue
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet


class _FakeView:
    """Minimal stand-in for the issue viewsets, which all wire up IssueFilterSet."""

    filterset_class = IssueFilterSet


@pytest.mark.unit
class TestIssueFilterNegation:
    """The work item filter UI renders "is not" by wrapping a positive condition in a
    NOT group, which serializes to {"not": {"state_id__in": "..."}}. The alternative —
    a negated lookup key such as state_id__not_in — is rejected by _validate_fields
    because IssueFilterSet only declares the positive filters. These tests pin that
    contract down from the backend side."""

    def setup_method(self):
        self.backend = ComplexFilterBackend()
        self.view = _FakeView()
        self.queryset = Issue.objects.all()
        self.state_id = str(uuid.uuid4())

    def _evaluate(self, filter_data):
        self.backend._validate_structure(filter_data, max_depth=5, current_depth=1)
        self.backend._validate_fields(filter_data, self.view)
        return self.backend._evaluate_node(filter_data, self.view, self.queryset)

    def test_not_wrapper_is_accepted_and_negates_the_inner_condition(self):
        positive = self._evaluate({"state_id__in": self.state_id})
        negated = self._evaluate({"not": {"state_id__in": self.state_id}})

        assert negated == ~positive
        assert negated.negated is True

    def test_negated_lookup_key_is_rejected(self):
        # Guards the design decision: a `state_id__not_in` key would 400, so the
        # frontend must express negation structurally instead.
        with pytest.raises(DRFValidationError):
            self._evaluate({"state_id__not_in": self.state_id})

    def test_not_wrapper_composes_with_and(self):
        other_state_id = str(uuid.uuid4())
        combined = self._evaluate(
            {
                "and": [
                    {"state_id__in": self.state_id},
                    {"not": {"state_id__in": other_state_id}},
                ]
            }
        )

        expected = Q() & self._evaluate({"state_id__in": self.state_id})
        expected &= ~self._evaluate({"state_id__in": other_state_id})
        assert combined == expected

    def test_not_wrapper_negates_a_multi_valued_relation(self):
        label_id = str(uuid.uuid4())
        positive = self._evaluate({"label_id__in": label_id})
        negated = self._evaluate({"not": {"label_id__in": label_id}})

        # Negating the join-based Q is what makes "label is none of X" mean
        # "has no matching label row" rather than "has some other label row".
        assert negated == ~positive

    def test_not_must_wrap_an_object(self):
        with pytest.raises(DRFValidationError):
            self._evaluate({"not": [{"state_id__in": self.state_id}]})
