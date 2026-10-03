# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The visual components, hosted by the UI plugins (LOOP C-13)."""

import jsonschema

from agent_runtimes.specs.ui_plugins import (
    COMPONENT_CATALOGUE,
    get_component,
    get_ui_plugin,
)


def test_the_component_catalog_is_the_ui_plugins_own() -> None:
    a2ui = get_ui_plugin("a2ui")
    assert a2ui is not None and a2ui.catalog == "a2ui/v0.9"
    assert set(COMPONENT_CATALOGUE) == {component.id for component in a2ui.components}


def test_datalayers_own_carry_a_schema_their_example_meets() -> None:
    for component in COMPONENT_CATALOGUE.values():
        if component.standard:
            assert component.properties is None, component.id
            continue
        assert component.properties is not None and component.example is not None, (
            component.id
        )
        jsonschema.Draft202012Validator.check_schema(component.properties)
        jsonschema.validate(component.example, component.properties)


def test_a_component_no_plugin_renders_is_none() -> None:
    assert get_component("Marquee") is None
    assert get_component("Table") is not None
