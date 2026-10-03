# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The catalog of visual components, as generated (LOOP C-13)."""

import jsonschema
import pytest

from agent_runtimes.specs.components import COMPONENT_CATALOGUE, get_component


@pytest.mark.parametrize("component_id", sorted(COMPONENT_CATALOGUE))
def test_each_example_is_a_valid_configuration(component_id: str) -> None:
    component = COMPONENT_CATALOGUE[component_id]
    jsonschema.Draft202012Validator.check_schema(component.properties)
    jsonschema.validate(component.example, component.properties)


def test_a_component_not_in_the_catalog_is_none() -> None:
    assert get_component("marquee") is None
