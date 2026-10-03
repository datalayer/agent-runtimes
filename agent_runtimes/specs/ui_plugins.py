# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
UI Plugin Catalog.

How an agent's answer becomes an interface: the protocols a host renders.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import ComponentBindingsSpec, ComponentSpec, UIPluginSpec


# ============================================================================
# UI Plugin Definitions
# ============================================================================

A2UI_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="a2ui",
    version="0.0.1",
    name="A2UI",
    description="An agent describes an interface — a form, a table, a card — as a tree of components from a catalogue the host allows, and the host renders it; what the user does in it comes back to the agent as an action.",
    docs_url="https://a2ui.org/",
    enabled=True,
    catalog="a2ui/v0.9",
    components=[
        ComponentSpec(
            id="Text",
            name="Text",
            description="Words on the page: a heading, a paragraph, the answer — plain or Markdown.",
            category="text",
            emoji="🔤",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Image",
            name="Image",
            description="A picture: a chart rendered elsewhere, a logo, a photo.",
            category="media",
            emoji="🖼️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Icon",
            name="Icon",
            description="A small drawing that says what something is: a check, a warning, a link.",
            category="media",
            emoji="🔣",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Video",
            name="Video",
            description="A film played in place.",
            category="media",
            emoji="🎬",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="AudioPlayer",
            name="Audio",
            description="A sound played in place: a recording, a summary read aloud.",
            category="media",
            emoji="🔊",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Row",
            name="Row",
            description="Children side by side, left to right.",
            category="layout",
            emoji="➡️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Column",
            name="Column",
            description="Children one under the other.",
            category="layout",
            emoji="⬇️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="List",
            name="List",
            description="Items one after the other, each drawn by the same children: results, alternatives, steps.",
            category="layout",
            emoji="📃",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Card",
            name="Card",
            description="A framed group: what belongs together, set apart.",
            category="layout",
            emoji="🗂️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Tabs",
            name="Tabs",
            description="Several views of one place, one shown at a time.",
            category="layout",
            emoji="📑",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Divider",
            name="Divider",
            description="A line between what comes before and after.",
            category="layout",
            emoji="➖",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Modal",
            name="Modal",
            description="A window over the page, opened by a trigger: details, a confirmation.",
            category="layout",
            emoji="🪟",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Button",
            name="Button",
            description="An action the person takes: send, run, approve. One filled button per screen.",
            category="action",
            emoji="🔘",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="TextField",
            name="Input",
            description="A field the person types in: a word, a sentence, a number, a date.",
            category="input",
            emoji="⌨️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="CheckBox",
            name="Checkbox",
            description="Yes or no: an option on or off, a consent given.",
            category="input",
            emoji="☑️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="ChoicePicker",
            name="Select",
            description="One choice, or several, among options the builder lists or the data gives.",
            category="input",
            emoji="🔽",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Slider",
            name="Slider",
            description="A number chosen along a range: a weight, a budget, a threshold.",
            category="input",
            emoji="🎚️",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="DateTimeInput",
            name="Date and time",
            description="A date, a time, or both, chosen from a calendar.",
            category="input",
            emoji="📅",
            standard=True,
            properties=None,
            bindings=None,
            events=[],
            example=None,
        ),
        ComponentSpec(
            id="Table",
            name="Table",
            description="Rows the application found or keeps, with the columns the builder chooses.",
            category="data",
            emoji="📋",
            standard=False,
            properties={
                "type": "object",
                "required": ["columns"],
                "properties": {
                    "title": {
                        "type": "string",
                        "title": "Title",
                        "description": "What the table is, above it.",
                    },
                    "columns": {
                        "type": "array",
                        "title": "Columns",
                        "description": "The columns, in order.",
                        "minItems": 1,
                        "items": {"type": "string"},
                    },
                    "page_size": {
                        "type": "integer",
                        "title": "Rows per page",
                        "description": "How many rows show at once.",
                        "minimum": 1,
                        "maximum": 500,
                        "default": 20,
                    },
                    "selectable": {
                        "type": "boolean",
                        "title": "Selectable",
                        "description": "A row may be chosen, and its choice sent.",
                        "default": False,
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=["rows"], sends=["selected"]),
            events=["select"],
            example={"title": "Runs", "columns": ["model", "pass rate", "cost"]},
        ),
        ComponentSpec(
            id="Chart",
            name="Chart",
            description="Numbers drawn: a bar, a line, a scatter of what the application measured.",
            category="data",
            emoji="📊",
            standard=False,
            properties={
                "type": "object",
                "required": ["kind", "x", "y"],
                "properties": {
                    "title": {
                        "type": "string",
                        "title": "Title",
                        "description": "What the chart shows, above it.",
                    },
                    "kind": {
                        "type": "string",
                        "title": "Kind",
                        "description": "How the numbers are drawn.",
                        "enum": ["bar", "line", "scatter", "area"],
                        "default": "bar",
                    },
                    "x": {
                        "type": "string",
                        "title": "Across",
                        "description": "The field along the bottom.",
                    },
                    "y": {
                        "type": "string",
                        "title": "Up",
                        "description": "The field measured.",
                    },
                    "series": {
                        "type": "string",
                        "title": "Series",
                        "description": "A field whose values are drawn apart.",
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=["points"], sends=[]),
            events=[],
            example={"kind": "bar", "x": "model", "y": "pass rate"},
        ),
        ComponentSpec(
            id="FileUpload",
            name="File upload",
            description="A file the person gives the application: a document to read, a sheet to check.",
            category="input",
            emoji="📎",
            standard=False,
            properties={
                "type": "object",
                "required": ["label"],
                "properties": {
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads beside it.",
                    },
                    "accept": {
                        "type": "array",
                        "title": "Accepts",
                        "description": "The kinds of file it takes, by extension.",
                        "items": {"type": "string", "pattern": "^\\.[a-z0-9]+$"},
                    },
                    "multiple": {
                        "type": "boolean",
                        "title": "Several",
                        "description": "More than one file at once.",
                        "default": False,
                    },
                    "max_mb": {
                        "type": "integer",
                        "title": "Largest (MB)",
                        "description": "The largest file it takes.",
                        "minimum": 1,
                        "maximum": 500,
                        "default": 25,
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=[], sends=["files"]),
            events=["upload"],
            example={"label": "The contract", "accept": [".pdf", ".docx"]},
        ),
        ComponentSpec(
            id="Chat",
            name="Chat",
            description="The conversation with the application: its welcome, its starters, the composer.",
            category="conversation",
            emoji="💬",
            standard=False,
            properties={
                "type": "object",
                "properties": {
                    "welcome": {
                        "type": "string",
                        "title": "Welcome",
                        "description": "What it says before anyone writes.",
                    },
                    "placeholder": {
                        "type": "string",
                        "title": "Composer hint",
                        "description": "Shown in the composer while it is empty.",
                        "default": "Ask anything",
                    },
                    "starters": {
                        "type": "array",
                        "title": "Starters",
                        "description": "Questions offered before the first message.",
                        "maxItems": 6,
                        "items": {"type": "string"},
                    },
                    "show_tools": {
                        "type": "boolean",
                        "title": "Shows its tools",
                        "description": "The tool calls are shown as they happen.",
                        "default": True,
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=["messages"], sends=["message"]),
            events=["send"],
            example={
                "welcome": "Ask me to research anything.",
                "starters": ["What changed in Python 3.13?"],
            },
        ),
        ComponentSpec(
            id="Evidence",
            name="Evidence",
            description="What an answer rests on: the sources opened, the passages cited, each with its link.",
            category="data",
            emoji="🔎",
            standard=False,
            properties={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "title": "Title",
                        "description": "Above the sources.",
                        "default": "Sources",
                    },
                    "show_passages": {
                        "type": "boolean",
                        "title": "Shows passages",
                        "description": "Each source with the passage cited from it.",
                        "default": True,
                    },
                    "max_items": {
                        "type": "integer",
                        "title": "Most shown",
                        "description": "How many sources show before *more*.",
                        "minimum": 1,
                        "maximum": 50,
                        "default": 5,
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=["sources"], sends=[]),
            events=["open"],
            example={"title": "What this rests on"},
        ),
        ComponentSpec(
            id="Form",
            name="Form",
            description="Several fields asked at once, from a JSON Schema, checked as they are filled and again when they arrive (drawn with @datalayer/primer-rjsf).",
            category="input",
            emoji="🧾",
            standard=False,
            properties={
                "type": "object",
                "required": ["schema"],
                "properties": {
                    "title": {
                        "type": "string",
                        "title": "Title",
                        "description": "What the form is for, above it.",
                    },
                    "schema": {
                        "type": "object",
                        "title": "Fields",
                        "description": "The JSON Schema of what is asked: its fields, their types, what is required.",
                    },
                    "submit_label": {
                        "type": "string",
                        "title": "Send button",
                        "description": "The words on its button.",
                        "default": "Send",
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=["values"], sends=["values"]),
            events=["submit"],
            example={
                "title": "The quote",
                "schema": {
                    "type": "object",
                    "required": ["seats"],
                    "properties": {
                        "seats": {"type": "integer", "minimum": 1, "title": "Seats"}
                    },
                },
            },
        ),
    ],
)

MCP_APPS_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="mcp-apps",
    version="0.0.1",
    name="MCP Apps",
    description="An MCP server ships an interactive app with a tool: the host renders it in a sandboxed frame beside the conversation, and the app calls the server's tools through the host.",
    docs_url="https://modelcontextprotocol.io/docs/extensions/apps",
    enabled=False,
    catalog="",
    components=[],
)

MCP_UI_UI_PLUGIN_0_0_1 = UIPluginSpec(
    id="mcp-ui",
    version="0.0.1",
    name="MCP UI",
    description="An MCP tool answers with a UI resource — HTML, a remote page or a component — that the host renders in place of plain text.",
    docs_url="https://mcpui.dev/",
    enabled=False,
    catalog="",
    components=[],
)


# ============================================================================
# UI Plugin Catalog
# ============================================================================

UI_PLUGIN_CATALOGUE: Dict[str, UIPluginSpec] = {
    "a2ui": A2UI_UI_PLUGIN_0_0_1,
    "mcp-apps": MCP_APPS_UI_PLUGIN_0_0_1,
    "mcp-ui": MCP_UI_UI_PLUGIN_0_0_1,
}


def get_ui_plugin(plugin_id: str) -> UIPluginSpec | None:
    """The plugin an agent spec's `ui_plugin` names, or None."""
    return UI_PLUGIN_CATALOGUE.get(plugin_id)


def list_ui_plugins() -> list[UIPluginSpec]:
    return list(UI_PLUGIN_CATALOGUE.values())


#: The visual components the enabled UI plugins render, by the name a
#: surface gives them (LOOP C-13).
COMPONENT_CATALOGUE: Dict[str, ComponentSpec] = {
    component.id: component
    for plugin in UI_PLUGIN_CATALOGUE.values()
    if plugin.enabled
    for component in plugin.components
}


def get_component(name: str) -> ComponentSpec | None:
    """The component a layout names, or None."""
    return COMPONENT_CATALOGUE.get(name)


def list_components() -> list[ComponentSpec]:
    return list(COMPONENT_CATALOGUE.values())
