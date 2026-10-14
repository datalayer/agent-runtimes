# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The visual components, hosted by the UI specs (LOOP C-13)."""

import jsonschema

from agent_runtimes.specs.ui import (
    COMPONENT_CATALOGUE,
    get_component,
    get_ui,
)


def test_the_component_catalog_is_the_ui_specs_own() -> None:
    a2ui = get_ui("a2ui-surface")
    assert a2ui is not None and a2ui.catalog == "a2ui/v0.9"
    assert set(COMPONENT_CATALOGUE) == {component.id for component in a2ui.components}


def test_every_component_carries_a_version_and_a_schema() -> None:
    """Datalayer's own with an example its schema meets; A2UI's standard ones
    with the catalog's own schema of what a builder sets (C-13)."""
    for component in COMPONENT_CATALOGUE.values():
        assert component.version, component.id
        jsonschema.Draft202012Validator.check_schema(component.properties)
        if component.standard:
            continue
        assert component.example is not None, component.id
        jsonschema.validate(component.example, component.properties)


def test_a_component_no_plugin_renders_is_none() -> None:
    assert get_component("Marquee") is None
    assert get_component("Table") is not None


def test_ui_plugins_name_only_renderers_of_the_catalogue() -> None:
    """The two kinds (AGENTIC_UI R8): each plugin's renderers are UI renderers, none is a UI."""
    from agent_runtimes.specs.ui import UI_CATALOGUE
    from agent_runtimes.specs.ui_renderers import UI_RENDERER_CATALOGUE

    assert set(UI_RENDERER_CATALOGUE) == {"a2ui", "mcp-apps", "mcp-ui"}
    assert not set(UI_CATALOGUE) & set(UI_RENDERER_CATALOGUE)
    for spec in UI_CATALOGUE.values():
        assert set(spec.renderers) <= set(UI_RENDERER_CATALOGUE), spec.id
        assert spec.plugin.startswith("@datalayer/loop-plugin-"), spec.id
