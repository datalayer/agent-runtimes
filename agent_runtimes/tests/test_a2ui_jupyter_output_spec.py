# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Generated agentspec contract for the A2UI Jupyter Output chat."""

from agent_runtimes.specs.agents import get_agent_spec


def test_a2ui_jupyter_output_chat_spec_drives_the_frontend_demo_tool() -> None:
    spec = get_agent_spec("example-a2ui-jupyter-output")

    assert spec is not None
    assert spec.protocol == "vercel-ai"
    assert spec.sandbox_variant == "jupyter-server"
    assert len(spec.suggestions) == 6

    prompt = spec.system_prompt or ""

    # The tool and every kind it accepts are named in the prompt, because
    # choosing between them is the agent's job.
    assert "run_jupyter_output_demo" in prompt
    for kind in (
        "stream",
        "figure",
        "table",
        "error",
        "ipywidgets",
        "interactive",
    ):
        assert f"`{kind}`" in prompt, kind

    # And named in none of the suggestions, because reading them is the
    # reader's. These used to say 'Call run_jupyter_output_demo with kind
    # "ipywidgets"' — a person reciting a function signature to a machine that
    # already knows it — and this asserts they cannot drift back.
    for suggestion in spec.suggestions:
        assert "run_jupyter_output_demo" not in suggestion.text
        assert "kind" not in suggestion.text.lower()

    # They point at the thing being demonstrated instead.
    assert sum(
        "code sandbox" in suggestion.text for suggestion in spec.suggestions
    ) >= 4
