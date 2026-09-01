# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Generated agentspec contract for the A2UI Jupyter Output chat."""

from agent_runtimes.specs.agents import get_agent_spec


def test_a2ui_jupyter_output_chat_spec_drives_the_frontend_demo_tool() -> None:
    spec = get_agent_spec("example-a2ui-jupyter-output")

    assert spec is not None
    assert spec.protocol == "vercel-ai"
    assert spec.sandbox_variant == "jupyter-server"
    assert "run_jupyter_output_demo" in (spec.system_prompt or "")
    assert len(spec.suggestions) == 6
    assert any("ipywidgets" in suggestion.text for suggestion in spec.suggestions)
