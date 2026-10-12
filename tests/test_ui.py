# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""UI specs: a catalogue of their own, and what an agent spec names (`ui`)."""

from agent_runtimes.specs.ui import (
    UI_CATALOGUE,
    get_ui,
    list_ui,
)
from agent_runtimes.types import Agentspec


def test_the_catalogue_lists_every_plugin_and_whether_it_is_enabled() -> None:
    assert {"a2ui", "mcp-apps", "mcp-ui"} <= set(UI_CATALOGUE)
    for plugin in list_ui():
        assert plugin.name and plugin.docs_url.startswith("https://")
    assert get_ui("a2ui").enabled is True
    assert get_ui("nope") is None


def test_an_agent_spec_names_its_ui_and_an_older_key_is_refused() -> None:
    import pytest
    from pydantic import ValidationError

    base = {"id": "x", "name": "X", "description": "x"}
    assert Agentspec.model_validate({**base, "ui": "a2ui"}).ui == "a2ui"
    assert (
        Agentspec.model_validate({**base, "ui": "a2ui"}).model_dump(by_alias=True)["ui"]
        == "a2ui"
    )
    # `ui_plugin` (and the UI extension before it) is `ui` (AGENT_PROTOCOLS PS-03): never read.
    for old in ("ui_plugin", "uiPlugin", "ui_extension", "uiExtension"):
        with pytest.raises(ValidationError, match="says `ui`"):
            Agentspec.model_validate({**base, old: "a2ui"})
