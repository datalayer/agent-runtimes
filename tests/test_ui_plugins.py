# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""UI plugins: a catalogue of their own, and what an agent spec names."""

from agent_runtimes.specs.ui_plugins import (
    UI_PLUGIN_CATALOGUE,
    get_ui_plugin,
    list_ui_plugins,
)
from agent_runtimes.types import Agentspec


def test_the_catalogue_lists_every_plugin_and_whether_it_is_enabled() -> None:
    assert {"a2ui", "mcp-apps", "mcp-ui"} <= set(UI_PLUGIN_CATALOGUE)
    for plugin in list_ui_plugins():
        assert plugin.name and plugin.docs_url.startswith("https://")
    assert get_ui_plugin("a2ui").enabled is True
    assert get_ui_plugin("nope") is None


def test_an_agent_spec_names_a_plugin_and_the_older_key_is_still_read() -> None:
    base = {"id": "x", "name": "X", "description": "x"}
    assert Agentspec.model_validate({**base, "uiPlugin": "a2ui"}).ui_plugin == "a2ui"
    # A spec stored before agentspecs 0.0.11 called it a UI extension.
    assert Agentspec.model_validate({**base, "uiExtension": "a2ui"}).ui_plugin == "a2ui"
    assert (
        Agentspec.model_validate({**base, "ui_extension": "a2ui"}).ui_plugin == "a2ui"
    )
    dumped = Agentspec.model_validate({**base, "ui_plugin": "a2ui"}).model_dump(
        by_alias=True
    )
    assert dumped["uiPlugin"] == "a2ui" and "uiExtension" not in dumped
