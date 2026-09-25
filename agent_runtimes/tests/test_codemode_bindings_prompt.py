# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A codemode agent is told its bindings by name, not left to guess them."""

from __future__ import annotations

from types import SimpleNamespace

from agent_runtimes.routes.agents import (
    _binding_signature,
    _build_codemode_bindings_prompt,
    _first_sentence,
)


def _tool(
    name: str, description: str, properties: dict, required: list[str]
) -> SimpleNamespace:
    return SimpleNamespace(
        name=name,
        description=description,
        server_name=name.split("__")[0],
        input_schema={"type": "object", "properties": properties, "required": required},
    )


class _Registry:
    def __init__(self, tools):
        self._tools = tools

    def list_tools(self, include_deferred: bool = False):
        return list(self._tools)


def test_signature_puts_required_first_and_marks_the_rest() -> None:
    tool = _tool(
        "tavily__tavily_search",
        "Search the web.",
        {"search_depth": {}, "query": {}, "max_results": {}},
        ["query"],
    )
    assert _binding_signature(tool) == "query, search_depth?, max_results?"
    many = _tool("s__t", "x", {f"p{i}": {} for i in range(9)}, ["p0"])
    assert _binding_signature(many).endswith(", …")
    assert _binding_signature(SimpleNamespace(input_schema={})) == ""


def test_first_sentence_is_one_line_and_bounded() -> None:
    assert (
        _first_sentence("Search the web.\nUse it for news. Returns URLs.")
        == "Search the web."
    )
    assert _first_sentence("x" * 200).endswith("…")
    assert _first_sentence(None) == ""


def test_prompt_names_the_import_line_and_every_binding() -> None:
    toolset = SimpleNamespace(
        registry=_Registry(
            [
                _tool(
                    "tavily__tavily_search",
                    "Search the web for current information on any topic. Use for news.",
                    {"query": {}, "max_results": {}},
                    ["query"],
                ),
                _tool(
                    "tavily__tavily-extract",
                    "Extract web page content from one or more URLs.",
                    {"urls": {}},
                    ["urls"],
                ),
            ]
        )
    )
    prompt = _build_codemode_bindings_prompt(toolset)
    assert prompt.startswith("## Codemode bindings")
    assert "`from generated.mcp.tavily import tavily_search, tavily_extract`" in prompt
    assert (
        "- `await tavily_search(query, max_results?)` — Search the web for current "
        "information on any topic." in prompt
    )
    assert "- `await tavily_extract(urls)` — Extract web page content" in prompt
    assert "returns the tool's result as text" in prompt


def test_prompt_is_empty_without_a_registry_or_tools() -> None:
    assert _build_codemode_bindings_prompt(None) == ""
    assert _build_codemode_bindings_prompt(SimpleNamespace(registry=None)) == ""
    assert (
        _build_codemode_bindings_prompt(SimpleNamespace(registry=_Registry([]))) == ""
    )
