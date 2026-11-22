# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
UI Catalog.

The UI plugins: the Reactor plugins an interface is made of (R8).

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Union

from agent_runtimes.types import (
    ComponentBindingsSpec,
    ComponentSpec,
    UiBackendImplementationSpec,
    UiContributionsSpec,
    UiImplementationSpec,
    UISpec,
)

# ============================================================================
# UI Definitions
# ============================================================================

A2UI_SURFACE_UI_0_0_1 = UISpec(
    id="a2ui-surface",
    version="0.0.1",
    name="Surfaces in the conversation",
    description="Forms, tables and cards the agent draws in the conversation; what you fill in goes back to it.",
    emoji="🪟",
    octicon="browser",
    plugin="@datalayer/agent-plugin-a2ui-surface",
    folder="a2ui-surface",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/a2ui-surface",
        export="A2uiSurfacePlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="a2ui/v0.9",
    components=[
        ComponentSpec(
            id="Text",
            name="Text",
            description="Words on the page: a heading, a paragraph, the answer — plain or Markdown.",
            category="text",
            emoji="🔤",
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["text"],
                "properties": {
                    "text": {
                        "type": "string",
                        "title": "Words",
                        "description": "What it says, plain or in simple Markdown.",
                    },
                    "variant": {
                        "type": "string",
                        "title": "Style",
                        "description": "A heading of a level, a caption, or body text.",
                        "enum": ["h1", "h2", "h3", "h4", "h5", "caption", "body"],
                        "default": "body",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["url"],
                "properties": {
                    "url": {
                        "type": "string",
                        "title": "Address",
                        "description": "Where the picture is.",
                    },
                    "description": {
                        "type": "string",
                        "title": "Description",
                        "description": "What it shows, for those who cannot see it.",
                    },
                    "fit": {
                        "type": "string",
                        "title": "Fit",
                        "description": "How it is resized to its place.",
                        "enum": ["contain", "cover", "fill", "none", "scaleDown"],
                        "default": "fill",
                    },
                    "variant": {
                        "type": "string",
                        "title": "Size",
                        "description": "An icon, an avatar, a feature or a header.",
                        "enum": [
                            "icon",
                            "avatar",
                            "smallFeature",
                            "mediumFeature",
                            "largeFeature",
                            "header",
                        ],
                        "default": "mediumFeature",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["name"],
                "properties": {
                    "name": {
                        "type": "string",
                        "title": "Icon",
                        "description": "Which drawing, by its name.",
                        "enum": [
                            "accountCircle",
                            "add",
                            "arrowBack",
                            "arrowForward",
                            "attachFile",
                            "calendarToday",
                            "call",
                            "camera",
                            "check",
                            "close",
                            "delete",
                            "download",
                            "edit",
                            "event",
                            "error",
                            "fastForward",
                            "favorite",
                            "favoriteOff",
                            "folder",
                            "help",
                            "home",
                            "info",
                            "locationOn",
                            "lock",
                            "lockOpen",
                            "mail",
                            "menu",
                            "moreVert",
                            "moreHoriz",
                            "notificationsOff",
                            "notifications",
                            "pause",
                            "payment",
                            "person",
                            "phone",
                            "photo",
                            "play",
                            "print",
                            "refresh",
                            "rewind",
                            "search",
                            "send",
                            "settings",
                            "share",
                            "shoppingCart",
                            "skipNext",
                            "skipPrevious",
                            "star",
                            "starHalf",
                            "starOff",
                            "stop",
                            "upload",
                            "visibility",
                            "visibilityOff",
                            "volumeDown",
                            "volumeMute",
                            "volumeOff",
                            "volumeUp",
                            "warning",
                        ],
                    }
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["url"],
                "properties": {
                    "url": {
                        "type": "string",
                        "title": "Address",
                        "description": "Where the film is.",
                    }
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["url"],
                "properties": {
                    "url": {
                        "type": "string",
                        "title": "Address",
                        "description": "Where the sound is.",
                    },
                    "description": {
                        "type": "string",
                        "title": "Description",
                        "description": "What it is: a title or a summary.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["children"],
                "properties": {
                    "children": {
                        "type": "array",
                        "title": "Blocks",
                        "description": "The blocks inside it, by id, left to right.",
                        "items": {"type": "string"},
                    },
                    "justify": {
                        "type": "string",
                        "title": "Spacing",
                        "description": "How the blocks share the width.",
                        "enum": [
                            "center",
                            "end",
                            "spaceAround",
                            "spaceBetween",
                            "spaceEvenly",
                            "start",
                            "stretch",
                        ],
                        "default": "start",
                    },
                    "align": {
                        "type": "string",
                        "title": "Alignment",
                        "description": "How the blocks line up top to bottom.",
                        "enum": ["start", "center", "end", "stretch"],
                        "default": "stretch",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["children"],
                "properties": {
                    "children": {
                        "type": "array",
                        "title": "Blocks",
                        "description": "The blocks inside it, by id, top to bottom.",
                        "items": {"type": "string"},
                    },
                    "justify": {
                        "type": "string",
                        "title": "Spacing",
                        "description": "How the blocks share the height.",
                        "enum": [
                            "start",
                            "center",
                            "end",
                            "spaceBetween",
                            "spaceAround",
                            "spaceEvenly",
                            "stretch",
                        ],
                        "default": "start",
                    },
                    "align": {
                        "type": "string",
                        "title": "Alignment",
                        "description": "How the blocks line up left to right.",
                        "enum": ["center", "end", "start", "stretch"],
                        "default": "stretch",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["children"],
                "properties": {
                    "children": {
                        "type": "array",
                        "title": "Blocks",
                        "description": "The blocks inside it, by id, or the template repeated over a list.",
                        "items": {"type": "string"},
                    },
                    "direction": {
                        "type": "string",
                        "title": "Direction",
                        "description": "One under the other, or side by side.",
                        "enum": ["vertical", "horizontal"],
                        "default": "vertical",
                    },
                    "align": {
                        "type": "string",
                        "title": "Alignment",
                        "description": "How the items line up across.",
                        "enum": ["start", "center", "end", "stretch"],
                        "default": "stretch",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["child"],
                "properties": {
                    "child": {
                        "type": "string",
                        "title": "Block",
                        "description": "The one block inside it, by id; a Row or Column for several.",
                    }
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["tabs"],
                "properties": {
                    "tabs": {
                        "type": "array",
                        "title": "Tabs",
                        "description": "Each tab's title and the block it shows, by id.",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["title", "child"],
                            "properties": {
                                "title": {"type": "string"},
                                "child": {"type": "string"},
                            },
                        },
                    }
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "properties": {
                    "axis": {
                        "type": "string",
                        "title": "Direction",
                        "description": "Across or up and down.",
                        "enum": ["horizontal", "vertical"],
                        "default": "horizontal",
                    }
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["trigger", "content"],
                "properties": {
                    "trigger": {
                        "type": "string",
                        "title": "Opened by",
                        "description": "The block that opens it, by id: a button.",
                    },
                    "content": {
                        "type": "string",
                        "title": "Shows",
                        "description": "The block shown inside it, by id.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["child", "action"],
                "properties": {
                    "child": {
                        "type": "string",
                        "title": "Label",
                        "description": "The block on it, by id: a Text for its words.",
                    },
                    "variant": {
                        "type": "string",
                        "title": "Style",
                        "description": "Primary for the one main action, borderless for a link.",
                        "enum": ["default", "primary", "borderless"],
                        "default": "default",
                    },
                    "action": {
                        "type": "object",
                        "title": "Does",
                        "description": "What pressing it sends, by name, with what it reads.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["label"],
                "properties": {
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads beside it.",
                    },
                    "value": {
                        "type": "string",
                        "title": "Value",
                        "description": "What is typed in it.",
                    },
                    "variant": {
                        "type": "string",
                        "title": "Kind",
                        "description": "A short or long text, a number, or hidden as typed.",
                        "enum": ["longText", "number", "shortText", "obscured"],
                        "default": "shortText",
                    },
                    "validationRegexp": {
                        "type": "string",
                        "title": "Pattern",
                        "description": "A regular expression what is typed must match.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["label", "value"],
                "properties": {
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads beside it.",
                    },
                    "value": {
                        "type": "boolean",
                        "title": "Value",
                        "description": "Whether it is ticked.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["options", "value"],
                "properties": {
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads above the options.",
                    },
                    "variant": {
                        "type": "string",
                        "title": "Choice",
                        "description": "One of the options, or several.",
                        "enum": ["multipleSelection", "mutuallyExclusive"],
                        "default": "mutuallyExclusive",
                    },
                    "options": {
                        "type": "array",
                        "title": "Options",
                        "description": "What may be chosen: the words read and the value sent.",
                        "items": {
                            "type": "object",
                            "required": ["label", "value"],
                            "properties": {
                                "label": {"type": "string"},
                                "value": {"type": "string"},
                            },
                        },
                    },
                    "value": {
                        "type": "array",
                        "title": "Value",
                        "description": "The values chosen.",
                        "items": {"type": "string"},
                    },
                    "displayStyle": {
                        "type": "string",
                        "title": "Shown as",
                        "description": "Checkboxes or chips.",
                        "enum": ["checkbox", "chips"],
                        "default": "checkbox",
                    },
                    "filterable": {
                        "type": "boolean",
                        "title": "Searchable",
                        "description": "A search field above the options.",
                        "default": False,
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["value", "max"],
                "properties": {
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads beside it.",
                    },
                    "min": {
                        "type": "number",
                        "title": "Least",
                        "description": "The smallest value.",
                        "default": 0,
                    },
                    "max": {
                        "type": "number",
                        "title": "Most",
                        "description": "The largest value.",
                    },
                    "value": {
                        "type": "number",
                        "title": "Value",
                        "description": "The value chosen.",
                    },
                },
            },
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
            version="0.9.0",
            standard=True,
            properties={
                "type": "object",
                "required": ["value"],
                "properties": {
                    "value": {
                        "type": "string",
                        "title": "Value",
                        "description": "The date or time chosen, in ISO 8601.",
                    },
                    "enableDate": {
                        "type": "boolean",
                        "title": "Date",
                        "description": "A date may be chosen.",
                        "default": False,
                    },
                    "enableTime": {
                        "type": "boolean",
                        "title": "Time",
                        "description": "A time may be chosen.",
                        "default": False,
                    },
                    "min": {
                        "type": "string",
                        "title": "Earliest",
                        "description": "The earliest that may be chosen, in ISO 8601.",
                    },
                    "max": {
                        "type": "string",
                        "title": "Latest",
                        "description": "The latest that may be chosen, in ISO 8601.",
                    },
                    "label": {
                        "type": "string",
                        "title": "Label",
                        "description": "What the person reads beside it.",
                    },
                },
            },
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
            version="1.0.0",
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
            version="1.0.0",
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
            version="1.0.0",
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
            version="1.0.0",
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
            version="1.0.0",
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
            version="1.1.0",
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
                    "ui": {
                        "type": "object",
                        "title": "How its fields are drawn",
                        "description": "By field name, the ui: options @datalayer/primer-rjsf reads (a uiSchema): ui:widget one of select, radio, range, updown, switch, checkbox, text, textarea, date, checkboxes, tags; each field's own widget when unsaid.",
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
        ComponentSpec(
            id="Download",
            name="File to download",
            description="A file the application gives, to save: a report, a sheet, an export — by its link, or the file itself as a data: URL.",
            category="data",
            emoji="📄",
            version="1.0.0",
            standard=False,
            properties={
                "type": "object",
                "required": ["name", "url"],
                "properties": {
                    "name": {
                        "type": "string",
                        "title": "File name",
                        "description": "What the file is saved as, with its extension.",
                        "minLength": 1,
                    },
                    "url": {
                        "type": "string",
                        "title": "Link",
                        "description": "Where the file is: an http(s) link, or the file itself as a data: URL.",
                        "pattern": "^(https?://|data:)",
                    },
                    "media_type": {
                        "type": "string",
                        "title": "Kind",
                        "description": "Its media type (text/csv, application/pdf…), said beside its name.",
                    },
                    "size": {
                        "type": "integer",
                        "title": "Size (bytes)",
                        "description": "How large it is, said beside its name.",
                        "minimum": 0,
                    },
                    "description": {
                        "type": "string",
                        "title": "Description",
                        "description": "A line under its name.",
                    },
                },
            },
            bindings=ComponentBindingsSpec(shows=[], sends=[]),
            events=["download"],
            example={
                "name": "totals.csv",
                "url": "data:text/csv;base64,bW9udGgsdG90YWwKSmFuLDEyMDAK",
                "media_type": "text/csv",
                "size": 21,
                "description": "The month's totals.",
            },
        ),
    ],
)

A2UI_VIEW_UI_0_0_1 = UISpec(
    id="a2ui-view",
    version="0.0.1",
    name="Surface view",
    description="The last result of the code, shown as a page you can use rather than as raw output.",
    emoji="🖼",
    octicon="browser",
    plugin="@datalayer/agent-plugin-a2ui",
    folder="a2ui",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/a2ui",
        export="A2uiPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.command", "agent.viewType"],
        commands=["a2ui"],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

AGENTSPECS_UI_0_0_1 = UISpec(
    id="agentspecs",
    version="0.0.1",
    name="Agent picker",
    description="Choose which agent answers in this conversation.",
    emoji="🤖",
    octicon="people",
    plugin="@datalayer/agent-plugin-agentspecs",
    folder="agentspecs",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/agentspecs",
        export="AgentspecsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.header"],
        points=["agent.command"],
        commands=["agents"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

ANALYSIS_HEADER_UI_0_0_1 = UISpec(
    id="analysis-header",
    version="0.0.1",
    name="Analysis header",
    description="The Functional Analyst's title bar: what is being analysed, whether its diagrams parse, and a button that asks for it on the canvas.",
    emoji="📐",
    octicon="workflow",
    plugin="@datalayer/agent-plugin-analysis-header",
    folder="analysis-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/analysis-header",
        export="analysisHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_analysis_header",
        "when": "Call it once you know what is being analysed (a few words as the label of subject), and after each diagram you write to say whether the diagrams parse. Never show a diagram as valid that Mermaid refused.",
        "items": [
            {
                "id": "subject",
                "kind": "indicator",
                "display": "label",
                "label": "Subject",
                "description": 'What is being analysed, such as "Checkout flow".',
                "octicon": "workflow",
            },
            {
                "id": "check",
                "kind": "indicator",
                "display": "status",
                "label": "Diagrams",
                "description": 'Whether the diagrams parse, said from what Mermaid answered, such as "2 diagrams valid" (tone "success") or "Diagram refused" (tone "danger").',
                "octicon": "check-circle",
            },
            {
                "id": "canvas",
                "kind": "action",
                "label": "Draw on the canvas",
                "description": "Asks for the subject as a drawing on the Excalidraw canvas.",
                "octicon": "paintbrush",
                "message": "Draw this on the canvas, each part a labelled shape and the arrows bound to them.",
            },
        ],
    },
    supersedes=[],
    catalog="",
    components=[],
)

APP_ACTIVITY_UI_0_0_1 = UISpec(
    id="app-activity",
    version="0.0.1",
    name="Activity",
    description="What your application did, is doing, and is about to do, beside its page.",
    emoji="🕘",
    octicon="pulse",
    plugin="@datalayer/agent-plugin-app-activity",
    folder="app-activity",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-activity",
        export="defineAppActivityPlugin",
        kind="factory",
    ),
    per="application",
    contributions=UiContributionsSpec(
        slots=["agent.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

APP_COMPONENTS_UI_0_0_1 = UISpec(
    id="app-components",
    version="0.0.1",
    name="Your own components",
    description="The components your application's developer wrote, on its page and in its answers.",
    emoji="🧩",
    octicon="apps",
    plugin="@datalayer/agent-plugin-app-components",
    folder="app-components",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-components",
        export="defineAppComponentsPlugin",
        kind="factory",
    ),
    per="application",
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.a2ui.component", "agent.canvas.block"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

APP_COMPUTER_UI_0_0_1 = UISpec(
    id="app-computer",
    version="0.0.1",
    name="Computer",
    description="The computer your application works on: what ran there, its files, and taking it over.",
    emoji="🖥️",
    octicon="device-desktop",
    plugin="@datalayer/agent-plugin-app-computer",
    folder="app-computer",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-computer",
        export="defineAppComputerPlugin",
        kind="factory",
    ),
    per="application",
    contributions=UiContributionsSpec(
        slots=["agent.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

APP_ELEMENTS_UI_0_0_1 = UISpec(
    id="app-elements",
    version="0.0.1",
    name="Side panel and pages",
    description="What your application opens beside the conversation: a side panel, a page of its own, a question for you.",
    emoji="🗂️",
    octicon="sidebar-expand",
    plugin="@datalayer/agent-plugin-app-elements",
    folder="app-elements",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-elements",
        export="AppElementsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["root"],
        points=["reactor.ui.renderer"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

APP_PAGE_UI_0_0_1 = UISpec(
    id="app-page",
    version="0.0.1",
    name="Application page",
    description="Your application's page, drawn beside its conversation.",
    emoji="📈",
    octicon="browser",
    plugin="@datalayer/agent-plugin-app-page",
    folder="app-page",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-page",
        export="defineAppPagePlugin",
        kind="factory",
    ),
    per="application",
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.surface"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui", "mcp-apps"],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

APP_RULES_UI_0_0_1 = UISpec(
    id="app-rules",
    version="0.0.1",
    name="Rules and approvals",
    description="When your application acts alone, when it asks you, and the approvals waiting for your yes.",
    emoji="🛡️",
    octicon="shield-check",
    plugin="@datalayer/agent-plugin-app-rules",
    folder="app-rules",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/app-rules",
        export="defineAppRulesPlugin",
        kind="factory",
    ),
    per="application",
    contributions=UiContributionsSpec(
        slots=["agent.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

AWS_HEADER_UI_0_0_1 = UISpec(
    id="aws-header",
    version="0.0.1",
    name="AWS header",
    description="The Steward's title bar: the monthly savings it found, a drop-down for the region it looks at, and how much of the compute Savings Plans cover.",
    emoji="💸",
    octicon="graph",
    plugin="@datalayer/agent-plugin-aws-header",
    folder="aws-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/aws-header",
        export="awsHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_aws_header",
        "when": 'Call it once you have read them: the savings found so far (the number of recommendations as the value, their estimated monthly sum as the label, such as "$2,701/month"), and the Savings Plans coverage of compute in percent. Nothing is changed in the account.',
        "items": [
            {
                "id": "savings",
                "kind": "indicator",
                "display": "counter",
                "label": "Savings found",
                "description": "The recommendations found in this session (the value) and their estimated monthly sum (the label). Estimates only, nothing is changed in the account.",
                "octicon": "graph",
            },
            {
                "id": "region",
                "kind": "choice",
                "label": "Region",
                "description": "The AWS region the readings are narrowed to.",
                "octicon": "globe",
                "default": "all",
                "says": "Chosen in the chat's header: look at the region {label} only, and say so in the answer.",
                "options": [
                    {"id": "all", "label": "All regions", "says": ""},
                    {"id": "us-east-1", "label": "us-east-1"},
                    {"id": "us-west-2", "label": "us-west-2"},
                    {"id": "eu-west-1", "label": "eu-west-1"},
                    {"id": "eu-central-1", "label": "eu-central-1"},
                ],
            },
            {
                "id": "coverage",
                "kind": "indicator",
                "display": "meter",
                "unit": "%",
                "max": 100,
                "label": "Savings Plans coverage",
                "description": 'How much of the compute spend Savings Plans cover, in percent, as Cost Explorer says it. Tone "attention" under 50, "success" from 70.',
                "octicon": "meter",
            },
        ],
    },
    supersedes=["aws-savings-badge"],
    catalog="",
    components=[],
)

AWS_SAVINGS_BADGE_UI_0_0_1 = UISpec(
    id="aws-savings-badge",
    version="0.0.1",
    name="Savings found",
    description="This session's estimated monthly savings and the AWS account they were found in, in the chat's title bar, read from the recommendations recorded (record_recommendation, list_recommendations).",
    emoji="💸",
    octicon="graph",
    plugin="@datalayer/agent-plugin-aws-savings-badge",
    folder="aws-savings-badge",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/aws-savings-badge",
        export="awsSavingsBadgePlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

AWS_SAVINGS_UI_0_0_1 = UISpec(
    id="aws-savings",
    version="0.0.1",
    name="AWS savings",
    description="The recommended savings, largest first, each with its evidence, its state and its estimated monthly saving, and their sum (list_recommendations).",
    emoji="💸",
    octicon="list-ordered",
    plugin="@datalayer/agent-plugin-aws-savings",
    folder="aws-savings",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/aws-savings",
        export="AwsSavingsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

BANK_RECONCILIATION_UI_0_0_1 = UISpec(
    id="bank-reconciliation",
    version="0.0.1",
    name="Bank reconciliation",
    description="Bank lines beside the invoices they would settle, with the difference and how sure the agent is; you tick the matches you approve and send them back (show_reconciliation).",
    emoji="🧾",
    octicon="git-compare",
    plugin="@datalayer/agent-plugin-bank-reconciliation",
    folder="bank-reconciliation",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/bank-reconciliation",
        export="BankReconciliationPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

BASKET_TOTAL_UI_0_0_1 = UISpec(
    id="basket-total",
    version="0.0.1",
    name="Basket total",
    description="The basket the agent is putting together, in the chat's title bar: how many items and its total, read from the last basket it showed (show_basket).",
    emoji="🛒",
    octicon="package",
    plugin="@datalayer/agent-plugin-basket-total",
    folder="basket-total",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/basket-total",
        export="basketTotalPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

BLUESKY_POST_PREVIEW_UI_0_0_1 = UISpec(
    id="bluesky-post-preview",
    version="0.0.1",
    name="Bluesky post preview",
    description="A post or reply on Bluesky as it will stand there, with its length against the 300 characters Bluesky takes and its images, above its approval (post_to_bluesky, reply_on_bluesky).",
    emoji="🦋",
    octicon="megaphone",
    plugin="@datalayer/agent-plugin-bluesky-post-preview",
    folder="bluesky-post-preview",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/bluesky-post-preview",
        export="BlueskyPostPreviewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

BOOKS_HEADER_UI_0_0_1 = UISpec(
    id="books-header",
    version="0.0.1",
    name="Books header",
    description="The Accountant's title bar: a drop-down for the period it reads, how many payments are still to match, and the invoices still open.",
    emoji="🧮",
    octicon="book",
    plugin="@datalayer/agent-plugin-books-header",
    folder="books-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/books-header",
        export="booksHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_books_header",
        "when": "Call it each time you have counted them in the books: the payments not matched yet, and the open invoices with their total due as the label. Every figure comes from the books.",
        "items": [
            {
                "id": "period",
                "kind": "choice",
                "label": "Period",
                "description": "The accounting period the answers are about.",
                "octicon": "calendar",
                "default": "last-month",
                "says": "Chosen in the chat's header: the period to read is {label}, counted from today's date in the books, unless the person names another.",
                "options": [
                    {"id": "last-month", "label": "Last month"},
                    {"id": "this-month", "label": "This month"},
                    {"id": "this-quarter", "label": "This quarter"},
                    {"id": "year-to-date", "label": "Year to date"},
                ],
            },
            {
                "id": "unmatched",
                "kind": "indicator",
                "display": "counter",
                "label": "Payments to match",
                "description": 'How many payments received are not matched to an invoice yet. Tone "attention" while some remain, "success" at none.',
                "octicon": "git-compare",
            },
            {
                "id": "open_invoices",
                "kind": "indicator",
                "display": "counter",
                "label": "Open invoices",
                "description": 'How many customer invoices are still open; the label carries the total due, such as "open · 14,585.50 EUR".',
                "octicon": "file",
            },
        ],
    },
    supersedes=[],
    catalog="",
    components=[],
)

BROWSER_SESSION_UI_0_0_1 = UISpec(
    id="browser-session",
    version="0.0.1",
    name="Browser sessions",
    description="Sign in to LinkedIn in your runtime's own browser, from the chat, so that its MCP server reads and acts through your session (the user, 15 November 2026).",
    emoji="🌐",
    octicon="browser",
    plugin="@datalayer/agent-plugin-browser-session",
    folder="browser-session",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/browser-session",
        export="BrowserSessionPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CANVAS_BLOCKS_UI_0_0_1 = UISpec(
    id="canvas-blocks",
    version="0.0.1",
    name="Blocks",
    description="The blocks you place on your application's page in the visual editor, one set for each part that draws them.",
    emoji="🧱",
    octicon="apps",
    plugin="@datalayer/agent-plugin-ui",
    folder="canvas-blocks",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/canvas-blocks",
        export="CANVAS_BLOCK_PLUGINS",
        kind="plugins",
    ),
    per="ui",
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.canvas.block"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CANVAS_PARTS_UI_0_0_1 = UISpec(
    id="canvas-parts",
    version="0.0.1",
    name="Parts",
    description="What you drop on your agent in the visual editor: connections, skills, models, rules, tests and events.",
    emoji="🧰",
    octicon="package",
    plugin="@datalayer/agent-plugin-parts",
    folder="canvas-parts",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/canvas-parts",
        export="CANVAS_PART_PLUGINS",
        kind="plugins",
    ),
    per="source",
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.canvas.part"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CHAT_EXTRAS_UI_0_0_1 = UISpec(
    id="chat-extras",
    version="0.0.1",
    name="Banner and status",
    description="A live banner over the conversation and a status line under it, set by the page around it.",
    emoji="📣",
    octicon="megaphone",
    plugin="@datalayer/agent-plugin-chat-extras",
    folder="chat-extras",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/chat-extras",
        export="createChatExtrasPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CHAT_HEADER_UI_0_0_1 = UISpec(
    id="chat-header",
    version="0.0.1",
    name="Chat title bar",
    description="The conversation's title bar: who answers, what it runs on, and its actions.",
    emoji="🏷️",
    octicon="rows",
    plugin="@datalayer/agent-plugin-chat-header",
    folder="chat-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/chat-header",
        export="ChatHeaderPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.header"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CHAT_VIEW_UI_0_0_1 = UISpec(
    id="chat-view",
    version="0.0.1",
    name="Chat button",
    description="Back to the conversation alone, from under the composer.",
    emoji="💬",
    octicon="comment-discussion",
    plugin="@datalayer/agent-plugin-chat-view",
    folder="chat-view",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/chat-view",
        export="ChatViewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

CHAT_UI_0_0_1 = UISpec(
    id="chat",
    version="0.0.1",
    name="Chat",
    description="The conversation: what you ask, what it answers, and the work it opens beside it.",
    emoji="💬",
    octicon="comment-discussion",
    plugin="@datalayer/agent-plugin-chat",
    folder="chat",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/chat",
        export="ChatPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=[
            "agent.chat.turn",
            "agent.command",
            "agent.document.toolbar.item",
            "agent.notebook.toolbar.item",
            "agent.session.action",
            "agent.viewType",
        ],
        commands=["chat"],
    ),
    contribution_points=[
        "agent.available",
        "agent.chat.composer",
        "agent.chat.extras",
        "agent.chat.header",
        "agent.chat.suggestion",
        "agent.chat.turn",
        "agent.frontendTool",
    ],
    settings={
        "type": "object",
        "properties": {
            "placeholder": {
                "type": "string",
                "title": "Composer hint",
                "description": "Shown in the composer while it is empty; the agent's own when unsaid.",
                "default": "",
            },
            "defaultSurface": {
                "type": "string",
                "title": "Opens beside it",
                "description": "What opens beside the conversation: notebook, document, a page, or none.",
                "default": "notebook",
            },
            "showSurfaceSelector": {
                "type": "boolean",
                "title": "Offers the switcher",
                "description": "The strip that switches what is open beside the conversation.",
                "default": True,
            },
            "hideHeader": {
                "type": "boolean",
                "title": "Hides its title bar",
                "description": "The conversation without its own title bar.",
                "default": False,
            },
            "headerButtons": {
                "type": "object",
                "title": "Title bar buttons",
                "description": "Whether the title bar offers a new chat and clearing this one.",
                "properties": {
                    "newChat": {
                        "type": "boolean",
                        "title": "New chat",
                        "description": "Start another conversation.",
                    },
                    "clear": {
                        "type": "boolean",
                        "title": "Clear",
                        "description": "Clear this conversation.",
                    },
                },
                "default": {"newChat": False, "clear": False},
            },
            "hidePrompt": {
                "type": "boolean",
                "title": "Hides the composer",
                "description": "The conversation read without being written to.",
                "default": False,
            },
            "promptPlacement": {
                "type": "string",
                "title": "Composer place",
                "description": "Where the composer sits.",
                "enum": ["top", "bottom", "bottom-chat", "floating"],
                "default": "bottom",
            },
            "autoFocusPrompt": {
                "type": "boolean",
                "title": "Composer takes the caret",
                "description": "The composer is ready to type in when the page opens.",
                "default": True,
            },
            "suggestionLabels": {
                "type": "boolean",
                "title": "Openers by the composer",
                "description": "The openers shown as labels by the composer, not only in its menu.",
                "default": True,
            },
            "fullScreenTopOffset": {
                "type": ["number", "string"],
                "title": "Room kept at the top",
                "description": "What full screen leaves at the top for the page's own header.",
                "default": 0,
            },
        },
    },
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

COMMANDS_UI_0_0_1 = UISpec(
    id="commands",
    version="0.0.1",
    name="Command palette",
    description="Every command at hand, with Ctrl-K.",
    emoji="⌘",
    octicon="command-palette",
    plugin="@datalayer/agent-plugin-commands",
    folder="commands",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/commands",
        export="AgentCommandsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.status"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

COMPOSER_PORTAL_UI_0_0_1 = UISpec(
    id="composer-portal",
    version="0.0.1",
    name="Composer",
    description="A button in the chat's toolbar that opens the application's Composer full screen: its Canvas, its spec and its Python, read only. Every application's chat has it, listed in its `ui` or not, unless its spec leaves it out (`interface.composer_portal_disabled: true`). Needs no connection: an anonymous visitor has it.",
    emoji="🧱",
    octicon="pencil",
    plugin="@datalayer/agent-plugin-composer-portal",
    folder="composer-portal",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/composer-portal",
        export="composerPortalPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["toolbar", "header"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

DOCUMENT_TOOLBAR_UI_0_0_1 = UISpec(
    id="document-toolbar",
    version="0.0.1",
    name="Document toolbar",
    description="Shows what the document's code blocks run on.",
    emoji="🔵",
    octicon="circle",
    plugin="@datalayer/agent-plugin-document-toolbar",
    folder="document-toolbar",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/document-toolbar",
        export="DocumentToolbarPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.document.toolbar"],
        commands=[],
    ),
    contribution_points=["agent.document.toolbar.item"],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

DOCUMENT_VIEW_UI_0_0_1 = UISpec(
    id="document-view",
    version="0.0.1",
    name="Document button",
    description="The document beside the conversation, from under the composer.",
    emoji="📄",
    octicon="file",
    plugin="@datalayer/agent-plugin-document-view",
    folder="document-view",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/document-view",
        export="DocumentViewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

DOCUMENT_UI_0_0_1 = UISpec(
    id="document",
    version="0.0.1",
    name="Document",
    description="A document beside the conversation, written with the agent.",
    emoji="📄",
    octicon="file",
    plugin="@datalayer/agent-plugin-document",
    folder="document",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/document",
        export="DocumentPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.surface", "agent.command"],
        commands=["document"],
    ),
    contribution_points=["agent.document.opening", "agent.document.toolbar"],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

EARTH_AREA_UI_0_0_1 = UISpec(
    id="earth-area",
    version="0.0.1",
    name="Area and dates",
    description="The area and the dates Terra searched, in the chat's title bar, read from its last scene search (search_earth_datagranules, show_scenes).",
    emoji="🗺️",
    octicon="location",
    plugin="@datalayer/agent-plugin-earth-area",
    folder="earth-area",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/earth-area",
        export="earthAreaPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

EARTH_HEADER_UI_0_0_1 = UISpec(
    id="earth-header",
    version="0.0.1",
    name="Earth header",
    description="Terra's title bar: a drop-down for the sensor it searches, and the cloud cover of the scene it is reading.",
    emoji="🛰️",
    octicon="globe",
    plugin="@datalayer/agent-plugin-earth-header",
    folder="earth-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/earth-header",
        export="earthHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_earth_header",
        "when": 'Call it each time you settle on a scene to read: its cloud cover in percent as the value, and the scene as the label (sensor and date, such as "Sentinel-2 · 8 May").',
        "items": [
            {
                "id": "sensor",
                "kind": "choice",
                "label": "Sensor",
                "description": "The satellite sensor the scenes are searched from.",
                "octicon": "broadcast",
                "default": "any",
                "says": "Chosen in the chat's header: use {label} scenes only, and say when it holds none for what is asked.",
                "options": [
                    {"id": "any", "label": "Any sensor", "says": ""},
                    {"id": "sentinel-2", "label": "Sentinel-2"},
                    {"id": "landsat", "label": "Landsat"},
                ],
            },
            {
                "id": "cloud",
                "kind": "indicator",
                "display": "meter",
                "unit": "%",
                "max": 100,
                "label": "Cloud cover",
                "description": 'The cloud cover of the scene being read, in percent; its label names the scene. Tone "success" under 10, "attention" from 30, "danger" from 60, where a scene misleads.',
                "octicon": "cloud",
            },
        ],
    },
    supersedes=[],
    catalog="",
    components=[],
)

EARTH_INDEX_UI_0_0_1 = UISpec(
    id="earth-index",
    version="0.0.1",
    name="Index and change",
    description="An index computed from the pixels (NDVI, NDWI, NBR) over an area on each date, the change between the dates, its map and what limits the reading (show_index_result).",
    emoji="🌿",
    octicon="graph",
    plugin="@datalayer/agent-plugin-earth-index",
    folder="earth-index",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/earth-index",
        export="EarthIndexPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

EARTH_SCENES_UI_0_0_1 = UISpec(
    id="earth-scenes",
    version="0.0.1",
    name="Satellite scenes",
    description="The satellite scenes found, by date, each with its collection, sensor and cloud cover as the catalogue gave them (show_scenes).",
    emoji="🛰️",
    octicon="globe",
    plugin="@datalayer/agent-plugin-earth-scenes",
    folder="earth-scenes",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/earth-scenes",
        export="EarthScenesPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

INPUT_PROMPT_UI_0_0_1 = UISpec(
    id="input-prompt",
    version="0.0.1",
    name="Composer",
    description="Where you write to the agent, under or over the conversation.",
    emoji="✏️",
    octicon="pencil",
    plugin="@datalayer/agent-plugin-input-prompt",
    folder="input-prompt",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/input-prompt",
        export="InputPromptPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.composer"],
        commands=[],
    ),
    contribution_points=["agent.prompt.panel"],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

LINKEDIN_LINK_UI_0_0_1 = UISpec(
    id="linkedin-link",
    version="0.0.1",
    name="Link LinkedIn",
    description="Link LinkedIn in Settings, in the chat's title bar, while your LinkedIn is not linked through Datalayer or its 60-day grant lapsed; brought by the datalayer-social LinkedIn tools, never for an anonymous visitor.",
    emoji="🔗",
    octicon="link",
    plugin="@datalayer/agent-plugin-linkedin-link",
    folder="linkedin-link",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/linkedin-link",
        export="linkedInLinkPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatBanner"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["banner", "header"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

LINKEDIN_POST_PREVIEW_UI_0_0_1 = UISpec(
    id="linkedin-post-preview",
    version="0.0.1",
    name="LinkedIn post preview",
    description="A post or comment on LinkedIn as it will stand there, with its length and its image, above its approval (post_to_linkedin, comment_on_linkedin).",
    emoji="💼",
    octicon="megaphone",
    plugin="@datalayer/agent-plugin-linkedin-post-preview",
    folder="linkedin-post-preview",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/linkedin-post-preview",
        export="LinkedInPostPreviewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

MODELS_UI_0_0_1 = UISpec(
    id="models",
    version="0.0.1",
    name="Models",
    description="Which model answers, and the models you may choose from.",
    emoji="🧠",
    octicon="cpu",
    plugin="@datalayer/agent-plugin-models",
    folder="models",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/models",
        export="ModelsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.command"],
        commands=["models"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

NOTEBOOK_HEADER_UI_0_0_1 = UISpec(
    id="notebook-header",
    version="0.0.1",
    name="Notebook header",
    description="The Jupyter Data Analyst's title bar: the dataset it works on, what has run, and a button that asks for a profile of the data.",
    emoji="📓",
    octicon="table",
    plugin="@datalayer/agent-plugin-notebook-header",
    folder="notebook-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/notebook-header",
        export="notebookHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_notebook_header",
        "when": "Call it once you know the dataset (its name and size as the label of dataset), and after each answer to say what ran: the cells run, or that nothing ran. Never show a run that did not happen.",
        "items": [
            {
                "id": "dataset",
                "kind": "indicator",
                "display": "label",
                "label": "Dataset",
                "description": 'The dataset being worked on, such as "orders.csv · 2,493 rows".',
                "octicon": "table",
            },
            {
                "id": "run",
                "kind": "indicator",
                "display": "status",
                "label": "Run",
                "description": 'What ran, said honestly, such as "3 cells run" (tone "success"), "Cell failed" (tone "danger") or "Nothing ran here" (tone "neutral") where there is no kernel.',
                "octicon": "play",
            },
            {
                "id": "profile",
                "kind": "action",
                "label": "Profile data",
                "description": "Asks for a profile of every column.",
                "octicon": "search",
                "message": "Profile every column — types, missing values, and ranges that look wrong.",
            },
        ],
    },
    supersedes=[],
    catalog="",
    components=[],
)

NOTEBOOK_TOOLBAR_UI_0_0_1 = UISpec(
    id="notebook-toolbar",
    version="0.0.1",
    name="Notebook toolbar",
    description="Shows what the notebook is running on.",
    emoji="🟢",
    octicon="circle",
    plugin="@datalayer/agent-plugin-notebook-toolbar",
    folder="notebook-toolbar",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/notebook-toolbar",
        export="NotebookToolbarPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.notebook.toolbar"],
        commands=[],
    ),
    contribution_points=["agent.notebook.toolbar.item"],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

NOTEBOOK_VIEW_UI_0_0_1 = UISpec(
    id="notebook-view",
    version="0.0.1",
    name="Notebook button",
    description="The notebook beside the conversation, from under the composer.",
    emoji="📓",
    octicon="rows",
    plugin="@datalayer/agent-plugin-notebook-view",
    folder="notebook-view",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/notebook-view",
        export="NotebookViewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

NOTEBOOK_UI_0_0_1 = UISpec(
    id="notebook",
    version="0.0.1",
    name="Notebook",
    description="A notebook beside the conversation, its code run as you go.",
    emoji="📓",
    octicon="rows",
    plugin="@datalayer/agent-plugin-notebook",
    folder="notebook",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/notebook",
        export="NotebookPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.surface", "agent.command"],
        commands=["notebook"],
    ),
    contribution_points=["agent.notebook.opening", "agent.notebook.toolbar"],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

NOTICES_UI_0_0_1 = UISpec(
    id="notices",
    version="0.0.1",
    name="Notices",
    description="A short notice the agent slides in from an edge of the chat for a few seconds: info, success, warning or error, a title and a line, said to come from the agent.",
    emoji="🔔",
    octicon="bell",
    plugin="@datalayer/agent-plugin-notices",
    folder="notices",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/notices",
        export="NoticesPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.viewOverlay"],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

ODOO_CONTEXT_UI_0_0_1 = UISpec(
    id="odoo-context",
    version="0.0.1",
    name="Odoo company and period",
    description="The Odoo company the agent works in and the period it reads, in the chat's title bar, from what Odoo answered (odoo_get_context) and the balances it showed.",
    emoji="🏢",
    octicon="briefcase",
    plugin="@datalayer/agent-plugin-odoo-context",
    folder="odoo-context",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/odoo-context",
        export="odooContextPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAGE_DECK_UI_0_0_1 = UISpec(
    id="page-deck",
    version="0.0.1",
    name="Deck in the page",
    description="A deck the agent builds in the conversation, slide by slide, with tools run in the page: shown as it is built, its notes under it, presented full screen.",
    emoji="🎞️",
    octicon="project",
    plugin="@datalayer/agent-plugin-page-deck",
    folder="page-deck",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/page-deck",
        export="PageDeckPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message", "right", "left"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAGE_EXCALIDRAW_UI_0_0_1 = UISpec(
    id="page-excalidraw",
    version="0.0.1",
    name="Excalidraw in the page",
    description="Drawings the agent makes in the conversation on an Excalidraw canvas, with tools run in the page: shown as they are drawn, editable by the person, its shapes bound so they move together.",
    emoji="🖌️",
    octicon="paintbrush",
    plugin="@datalayer/agent-plugin-page-excalidraw",
    folder="page-excalidraw",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/page-excalidraw",
        export="PageExcalidrawPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message", "right", "left"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAGE_LAYOUT_UI_0_0_1 = UISpec(
    id="page-layout",
    version="0.0.1",
    name="Page layout",
    description="The work on a centred sheet like a document, the composer above it and the conversation in a panel beside it; or the conversation and the work side by side.",
    emoji="📄",
    octicon="file",
    plugin="@datalayer/agent-plugin-page-layout",
    folder="page-layout",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/page-layout",
        export="AgentPageLayoutPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.header"],
        points=["agent.chat.layout", "agent.prompt.panel"],
        commands=[],
    ),
    contribution_points=[],
    settings={
        "type": "object",
        "properties": {
            "arrangement": {
                "type": "string",
                "title": "Arrangement",
                "description": "The work on a sheet with the conversation in a panel, or both side by side.",
                "enum": ["page", "split"],
                "default": "page",
            },
            "turnPanel": {
                "type": "string",
                "title": "Current turn",
                "description": "Where the current turn hangs on the composer.",
                "enum": ["below", "above", "none"],
                "default": "below",
            },
            "turnPanelFooter": {
                "type": "string",
                "title": "Under the reply",
                "description": "What is drawn under the reply: everything, its actions, or nothing.",
                "enum": ["full", "actions", "none"],
                "default": "full",
            },
            "prompt": {
                "type": "string",
                "title": "Composer",
                "description": "Docked above the sheet, or floating over it.",
                "enum": ["docked", "floating"],
                "default": "docked",
            },
            "promptAnchor": {
                "type": "string",
                "title": "Floating composer starts",
                "description": "The edge a floating composer starts at.",
                "enum": ["top", "bottom"],
                "default": "top",
            },
            "pageSize": {
                "type": "object",
                "title": "Sheet",
                "description": "The sheet: free at its reading width when unsaid, or a paper (letter, a4) whose width it takes, with a width or a height of its own over either.",
                "properties": {
                    "format": {
                        "type": "string",
                        "title": "Paper",
                        "description": "The paper the sheet is.",
                        "enum": ["free", "letter", "a4"],
                    },
                    "width": {
                        "type": "number",
                        "title": "Width",
                        "description": "The sheet's width in pixels; over a paper, it replaces the paper's.",
                    },
                    "height": {
                        "type": "number",
                        "title": "Height",
                        "description": "The sheet's least height in pixels; what is past it grows the sheet.",
                    },
                },
            },
        },
    },
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAGE_MERMAID_UI_0_0_1 = UISpec(
    id="page-mermaid",
    version="0.0.1",
    name="Mermaid in the page",
    description="Mermaid diagrams the agent writes in the conversation, with tools run in the page: each source checked by Mermaid's parser before it is shown, drawn in the page's colours, its source a click away.",
    emoji="🧜",
    octicon="workflow",
    plugin="@datalayer/agent-plugin-page-mermaid",
    folder="page-mermaid",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/page-mermaid",
        export="PageMermaidPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message", "right", "left"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAGE_SHEET_UI_0_0_1 = UISpec(
    id="page-sheet",
    version="0.0.1",
    name="Sheet in the page",
    description="A spreadsheet the agent fills in the conversation, with tools run in the page: shown as it is built, editable by the person, its formulas computed by Datalayer Cells, exported as CSV.",
    emoji="📑",
    octicon="table",
    plugin="@datalayer/agent-plugin-page-sheet",
    folder="page-sheet",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/page-sheet",
        export="PageSheetPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message", "right", "left"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAP_PURCHASE_UI_0_0_1 = UISpec(
    id="pap-purchase",
    version="0.0.1",
    name="Approve a purchase",
    description="A company's operation you approve, in the chat: the company, its summary and every term, the exact revision and until when it holds, above the chat's own approval (pap_confirm).",
    emoji="💳",
    octicon="credit-card",
    plugin="@datalayer/agent-plugin-pap-purchase",
    folder="pap-purchase",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/pap-purchase",
        export="PapPurchasePlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PAP_SIGN_IN_UI_0_0_1 = UISpec(
    id="pap-sign-in",
    version="0.0.1",
    name="Sign in at a company",
    description="Where your agent asks you to sign in at a company: its page, the code, and until when.",
    emoji="🔑",
    octicon="sign-in",
    plugin="@datalayer/agent-plugin-pap-sign-in",
    folder="pap-sign-in",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/pap-sign-in",
        export="PapSignInPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["mcp-ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PLUGIN_MANAGER_UI_0_0_1 = UISpec(
    id="plugin-manager",
    version="0.0.1",
    name="Plugins",
    description="A plug button in the chat's footer, in its row under the prompt (`agent.promptStatus`, usable while the prompt is closed), that opens the plugins manager in a dialog over the page: every plugin of the application's platform, filtered by name, each with a switch to turn it off and back on while the application runs. Every application has it, listed in its `ui` or not, unless its spec leaves it out (`interface.plugin_manager_disabled: true`). Needs no connection: an anonymous visitor has it.",
    emoji="🔌",
    octicon="plug",
    plugin="@datalayer/agent-plugin-plugin-manager",
    folder="plugin-manager",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/plugin-manager",
        export="pluginManagerPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptStatus"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["footer", "header"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PRODUCT_CARDS_UI_0_0_1 = UISpec(
    id="product-cards",
    version="0.0.1",
    name="Product cards",
    description="Products as cards — photo, title, price, rating and stock, a grid for a list — and a quote or a test order with each product's photo and the total (list_products, find_products, get_product, quote_basket, place_test_order).",
    emoji="🛍️",
    octicon="apps",
    plugin="@datalayer/agent-plugin-product-cards",
    folder="product-cards",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/product-cards",
        export="ProductCardsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PRODUCT_COMPARISON_UI_0_0_1 = UISpec(
    id="product-comparison",
    version="0.0.1",
    name="Product comparison",
    description="The products the agent compared, side by side — price, variant, availability, rating, seller and photo — and the one it would pick with why (show_comparison).",
    emoji="📊",
    octicon="table",
    plugin="@datalayer/agent-plugin-product-comparison",
    folder="product-comparison",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/product-comparison",
        export="ProductComparisonPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

PROMPT_UI_0_0_1 = UISpec(
    id="prompt",
    version="0.0.1",
    name="Floating composer",
    description="The composer in a card you move over the page, and the commands that bring it back or start over.",
    emoji="🪶",
    octicon="paper-airplane",
    plugin="@datalayer/agent-plugin-prompt",
    folder="prompt",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/prompt",
        export="PromptPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=["agent.command"],
        commands=["new", "prompt"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SHOP_HEADER_UI_0_0_1 = UISpec(
    id="shop-header",
    version="0.0.1",
    name="Shopping header",
    description="The Shopper's title bar: the basket it is putting together (items and total), a budget drop-down, and whether a purchase waits for the person's approval.",
    emoji="🛍️",
    octicon="package",
    plugin="@datalayer/agent-plugin-shop-header",
    folder="shop-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/shop-header",
        export="shopHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_shop_header",
        "when": "Call it each time the basket changes (how many items, and the total as its label), when an order is proposed and waits for the person's approval, and again once it is confirmed or dropped.",
        "items": [
            {
                "id": "basket",
                "kind": "indicator",
                "display": "counter",
                "label": "Basket",
                "description": 'How many items the basket holds, and its total as the label (such as "$84.00"). Nothing is bought by showing it.',
                "octicon": "package",
            },
            {
                "id": "budget",
                "kind": "choice",
                "label": "Budget",
                "description": "The most the person wants to spend on the basket.",
                "octicon": "credit-card",
                "default": "none",
                "says": "The person's budget for the whole basket, chosen in the chat's header: {label}. Keep the basket within it, and say so when something does not fit.",
                "options": [
                    {"id": "none", "label": "No limit", "says": ""},
                    {"id": "50", "label": "Under $50"},
                    {"id": "100", "label": "Under $100"},
                    {"id": "250", "label": "Under $250"},
                ],
            },
            {
                "id": "approval",
                "kind": "indicator",
                "display": "status",
                "label": "Approval",
                "description": 'Whether a purchase waits for the person\'s approval. Show it with the tone "attention" while one waits, and take it off (visible false) once it is confirmed or dropped.',
                "octicon": "shield-check",
            },
        ],
    },
    supersedes=["basket-total"],
    catalog="",
    components=[],
)

SHOPPING_BASKET_UI_0_0_1 = UISpec(
    id="shopping-basket",
    version="0.0.1",
    name="Shopping basket",
    description="The basket the agent put together: each item with its photo, its seller and price, the shipping and the total summed by the tool; nothing is bought from it (show_basket).",
    emoji="🛒",
    octicon="package",
    plugin="@datalayer/agent-plugin-shopping-basket",
    folder="shopping-basket",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/shopping-basket",
        export="ShoppingBasketPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SIDE_PANELS_UI_0_0_1 = UISpec(
    id="side-panels",
    version="0.0.1",
    name="Side panels",
    description="The agent opens and closes the chat's left and right panels, where its UI placed there shows: the deck it builds, the sheet it fills, its title bar's controls.",
    emoji="🗂️",
    octicon="sidebar-expand",
    plugin="@datalayer/agent-plugin-side-panels",
    folder="side-panels",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/side-panels",
        export="SidePanelsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.extras", "reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SOCIAL_ACCOUNTS_UI_0_0_1 = UISpec(
    id="social-accounts",
    version="0.0.1",
    name="Linked social accounts",
    description="Which of X, Bluesky and LinkedIn you linked, as whom, and whether each posts, reads or needs connecting again: drawn where the Marketer reads your accounts (social_accounts).",
    emoji="🪪",
    octicon="person",
    plugin="@datalayer/agent-plugin-social-accounts",
    folder="social-accounts",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/social-accounts",
        export="socialAccountsPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SOCIAL_HEADER_UI_0_0_1 = UISpec(
    id="social-header",
    version="0.0.1",
    name="Social header",
    description="The Marketer's title bar: a drop-down for the network it drafts for, and how many drafts wait for the person's approval.",
    emoji="📣",
    octicon="megaphone",
    plugin="@datalayer/agent-plugin-social-header",
    folder="social-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/social-header",
        export="socialHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_social_header",
        "when": "Call it each time the number of drafts waiting for the person's approval changes: after you show a draft, and after one is approved, posted or dropped.",
        "items": [
            {
                "id": "network",
                "kind": "choice",
                "label": "Network",
                "description": "The network the next drafts are written for.",
                "octicon": "broadcast",
                "default": "all",
                "says": "Chosen in the chat's header: draft for {label}, in that network's own voice and length, unless the person names another.",
                "options": [
                    {"id": "all", "label": "All networks", "says": ""},
                    {"id": "x", "label": "X"},
                    {"id": "bluesky", "label": "Bluesky"},
                    {"id": "linkedin", "label": "LinkedIn"},
                    {"id": "discord", "label": "Discord"},
                ],
            },
            {
                "id": "drafts",
                "kind": "indicator",
                "display": "counter",
                "label": "Drafts to approve",
                "description": 'How many drafts wait for the person\'s approval; nothing is posted before it. Tone "attention" while some wait, and visible false at none.',
                "octicon": "pencil",
            },
        ],
    },
    supersedes=[],
    catalog="",
    components=[],
)

SPREADSHEET_VIEW_UI_0_0_1 = UISpec(
    id="spreadsheet-view",
    version="0.0.1",
    name="Spreadsheet button",
    description="The spreadsheet beside the conversation, from under the composer.",
    emoji="🧮",
    octicon="table",
    plugin="@datalayer/agent-plugin-spreadsheet-view",
    folder="spreadsheet-view",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/spreadsheet-view",
        export="SpreadsheetViewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SPREADSHEET_UI_0_0_1 = UISpec(
    id="spreadsheet",
    version="0.0.1",
    name="Spreadsheet",
    description="A workbook beside the conversation, drawn by Datalayer Cells.",
    emoji="🧮",
    octicon="table",
    plugin="@datalayer/agent-plugin-spreadsheet",
    folder="spreadsheet",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/spreadsheet",
        export="SpreadsheetPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["agent.chat.surface", "agent.command"],
        commands=["spreadsheet"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

STRIPE_CHECKOUT_UI_0_0_1 = UISpec(
    id="stripe-checkout",
    version="0.0.1",
    name="Stripe checkout",
    description="A Stripe Checkout Session the agent created, as an A2UI card: its line items, total and currency, test mode said; Checkout opens Stripe's own page, where the person pays — no card data is ever typed in the chat — and the session's status (paid, open or expired) shows when they are back. A live session is refused.",
    emoji="💳",
    octicon="credit-card",
    plugin="@datalayer/agent-plugin-stripe-checkout",
    folder="stripe-checkout",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/stripe-checkout",
        export="StripeCheckoutPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

SUBAGENT_ACTIVITY_UI_0_0_1 = UISpec(
    id="subagent-activity",
    version="0.0.1",
    name="Delegated work",
    description="The face of an agent yours handed work to, pulsing while it works.",
    emoji="👥",
    octicon="people",
    plugin="@datalayer/agent-plugin-subagent-activity",
    folder="subagent-activity",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/subagent-activity",
        export="SubagentActivityPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.inpromptMenu"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIAL_BALANCE_UI_0_0_1 = UISpec(
    id="trial-balance",
    version="0.0.1",
    name="Trial balance",
    description="Each account's debit, credit and balance for a period, with the totals and whether they agree (show_trial_balance).",
    emoji="⚖️",
    octicon="law",
    plugin="@datalayer/agent-plugin-trial-balance",
    folder="trial-balance",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trial-balance",
        export="TrialBalancePlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIP_BUDGET_UI_0_0_1 = UISpec(
    id="trip-budget",
    version="0.0.1",
    name="Trip budget",
    description="What the trip costs, line by line, quotes apart from estimates, the total and what is left of your budget (show_trip_budget).",
    emoji="💰",
    octicon="credit-card",
    plugin="@datalayer/agent-plugin-trip-budget",
    folder="trip-budget",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-budget",
        export="TripBudgetPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIP_HEADER_UI_0_0_1 = UISpec(
    id="trip-header",
    version="0.0.1",
    name="Trip header",
    description="The Traveller's title bar: the trip being planned (where and when), a drop-down for how many travel, and how many options are ready to compare.",
    emoji="🧭",
    octicon="paper-airplane",
    plugin="@datalayer/agent-plugin-trip-header",
    folder="trip-header",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-header",
        export="tripHeaderPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=["agent.chat.extras", "agent.runProps"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "right", "left"],
    header={
        "tool": "set_trip_header",
        "when": "Call it once the trip is known (where and when, as the label of trip), and each time you have options ready to compare (their number). Nothing is booked by showing it.",
        "items": [
            {
                "id": "trip",
                "kind": "indicator",
                "display": "label",
                "label": "Trip",
                "description": 'The trip being planned, in a few words, such as "Lisbon · 12–15 Mar". Nothing is booked.',
                "octicon": "paper-airplane",
            },
            {
                "id": "travellers",
                "kind": "choice",
                "label": "Travellers",
                "description": "How many people travel.",
                "octicon": "people",
                "default": "2",
                "says": "Chosen in the chat's header: the trip is for {label}. Price flights, stays and totals for that many.",
                "options": [
                    {"id": "1", "label": "1 traveller"},
                    {"id": "2", "label": "2 travellers"},
                    {"id": "3", "label": "3 travellers"},
                    {"id": "4", "label": "4 travellers"},
                ],
            },
            {
                "id": "options",
                "kind": "indicator",
                "display": "counter",
                "label": "Options ready",
                "description": 'How many flight and stay options are ready for the person to compare; its label says of what, such as "options ready".',
                "octicon": "list-unordered",
            },
        ],
    },
    supersedes=["trip-summary"],
    catalog="",
    components=[],
)

TRIP_ITINERARY_UI_0_0_1 = UISpec(
    id="trip-itinerary",
    version="0.0.1",
    name="Trip itinerary",
    description="The trip day by day: each stop with its time and place, and the place on a map (show_itinerary).",
    emoji="🗺️",
    octicon="calendar",
    plugin="@datalayer/agent-plugin-trip-itinerary",
    folder="trip-itinerary",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-itinerary",
        export="TripItineraryPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIP_MAP_UI_0_0_1 = UISpec(
    id="trip-map",
    version="0.0.1",
    name="Trip map",
    description="The places of each trip option on a map — numbered by day, one option at a time — over Overture Maps' open basemap, with its attribution (show_trip_map). The map library loads only when the card is drawn.",
    emoji="🗺️",
    octicon="location",
    plugin="@datalayer/agent-plugin-trip-map",
    folder="trip-map",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-map",
        export="TripMapPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIP_OPTIONS_UI_0_0_1 = UISpec(
    id="trip-options",
    version="0.0.1",
    name="Trip options",
    description="Up to three trips side by side, each with its dates, price and highlights; you choose one and the choice goes back to the agent (show_trip_options).",
    emoji="🧳",
    octicon="briefcase",
    plugin="@datalayer/agent-plugin-trip-options",
    folder="trip-options",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-options",
        export="TripOptionsPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

TRIP_SUMMARY_UI_0_0_1 = UISpec(
    id="trip-summary",
    version="0.0.1",
    name="Trip being planned",
    description="The trip being planned, in the chat's title bar: where and when, and its budget so far, read from the trip the agent showed (show_itinerary, show_trip_options, show_trip_budget).",
    emoji="🧭",
    octicon="paper-airplane",
    plugin="@datalayer/agent-plugin-trip-summary",
    folder="trip-summary",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/trip-summary",
        export="tripSummaryPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

VAT_SUMMARY_UI_0_0_1 = UISpec(
    id="vat-summary",
    version="0.0.1",
    name="VAT summary",
    description="The VAT return's boxes for a period, what is due and deductible, and the net to pay or to be refunded; nothing is filed from it (show_vat_summary).",
    emoji="💶",
    octicon="checklist",
    plugin="@datalayer/agent-plugin-vat-summary",
    folder="vat-summary",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/vat-summary",
        export="VatSummaryPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

WINDOW_FRAME_UI_0_0_1 = UISpec(
    id="window-frame",
    version="0.0.1",
    name="Window",
    description="Draws the editor as a window, with room in its title bar for controls and actions.",
    emoji="🪟",
    octicon="browser",
    plugin="@datalayer/agent-plugin-window-frame",
    folder="window-frame",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/window-frame",
        export="WindowFramePlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.header", "agent.window.controls"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=[],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

X_BUDGET_UI_0_0_1 = UISpec(
    id="x-budget",
    version="0.0.1",
    name="X budget",
    description="What is left of your X budget today, in the chat's title bar, read from the agent's X budget guardrail (x-api-budget); never for an anonymous visitor.",
    emoji="💲",
    octicon="meter",
    plugin="@datalayer/agent-plugin-x-budget",
    folder="x-budget",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/x-budget",
        export="xBudgetPlugin",
        kind="factory",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=["agent.chatHeader"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
    placements=["header", "footer"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)

X_POST_PREVIEW_UI_0_0_1 = UISpec(
    id="x-post-preview",
    version="0.0.1",
    name="X post preview",
    description="A post or reply on X as it will stand there, with its length against the 280 characters X takes and its images, above its approval (post_to_x, reply_on_x).",
    emoji="𝕏",
    octicon="megaphone",
    plugin="@datalayer/agent-plugin-x-post-preview",
    folder="x-post-preview",
    implementation=UiImplementationSpec(
        package="@datalayer/agent-runtimes",
        module="lib/apps/plugins/x-post-preview",
        export="XPostPreviewPlugin",
        kind="plugin",
    ),
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
    placements=["message"],
    header=None,
    supersedes=[],
    catalog="",
    components=[],
)


# ============================================================================
# UI Catalog
# ============================================================================

UI_CATALOGUE: Dict[str, UISpec] = {
    "a2ui-surface": A2UI_SURFACE_UI_0_0_1,
    "a2ui-view": A2UI_VIEW_UI_0_0_1,
    "agentspecs": AGENTSPECS_UI_0_0_1,
    "analysis-header": ANALYSIS_HEADER_UI_0_0_1,
    "app-activity": APP_ACTIVITY_UI_0_0_1,
    "app-components": APP_COMPONENTS_UI_0_0_1,
    "app-computer": APP_COMPUTER_UI_0_0_1,
    "app-elements": APP_ELEMENTS_UI_0_0_1,
    "app-page": APP_PAGE_UI_0_0_1,
    "app-rules": APP_RULES_UI_0_0_1,
    "aws-header": AWS_HEADER_UI_0_0_1,
    "aws-savings-badge": AWS_SAVINGS_BADGE_UI_0_0_1,
    "aws-savings": AWS_SAVINGS_UI_0_0_1,
    "bank-reconciliation": BANK_RECONCILIATION_UI_0_0_1,
    "basket-total": BASKET_TOTAL_UI_0_0_1,
    "bluesky-post-preview": BLUESKY_POST_PREVIEW_UI_0_0_1,
    "books-header": BOOKS_HEADER_UI_0_0_1,
    "browser-session": BROWSER_SESSION_UI_0_0_1,
    "canvas-blocks": CANVAS_BLOCKS_UI_0_0_1,
    "canvas-parts": CANVAS_PARTS_UI_0_0_1,
    "chat-extras": CHAT_EXTRAS_UI_0_0_1,
    "chat-header": CHAT_HEADER_UI_0_0_1,
    "chat-view": CHAT_VIEW_UI_0_0_1,
    "chat": CHAT_UI_0_0_1,
    "commands": COMMANDS_UI_0_0_1,
    "composer-portal": COMPOSER_PORTAL_UI_0_0_1,
    "document-toolbar": DOCUMENT_TOOLBAR_UI_0_0_1,
    "document-view": DOCUMENT_VIEW_UI_0_0_1,
    "document": DOCUMENT_UI_0_0_1,
    "earth-area": EARTH_AREA_UI_0_0_1,
    "earth-header": EARTH_HEADER_UI_0_0_1,
    "earth-index": EARTH_INDEX_UI_0_0_1,
    "earth-scenes": EARTH_SCENES_UI_0_0_1,
    "input-prompt": INPUT_PROMPT_UI_0_0_1,
    "linkedin-link": LINKEDIN_LINK_UI_0_0_1,
    "linkedin-post-preview": LINKEDIN_POST_PREVIEW_UI_0_0_1,
    "models": MODELS_UI_0_0_1,
    "notebook-header": NOTEBOOK_HEADER_UI_0_0_1,
    "notebook-toolbar": NOTEBOOK_TOOLBAR_UI_0_0_1,
    "notebook-view": NOTEBOOK_VIEW_UI_0_0_1,
    "notebook": NOTEBOOK_UI_0_0_1,
    "notices": NOTICES_UI_0_0_1,
    "odoo-context": ODOO_CONTEXT_UI_0_0_1,
    "page-deck": PAGE_DECK_UI_0_0_1,
    "page-excalidraw": PAGE_EXCALIDRAW_UI_0_0_1,
    "page-layout": PAGE_LAYOUT_UI_0_0_1,
    "page-mermaid": PAGE_MERMAID_UI_0_0_1,
    "page-sheet": PAGE_SHEET_UI_0_0_1,
    "pap-purchase": PAP_PURCHASE_UI_0_0_1,
    "pap-sign-in": PAP_SIGN_IN_UI_0_0_1,
    "plugin-manager": PLUGIN_MANAGER_UI_0_0_1,
    "product-cards": PRODUCT_CARDS_UI_0_0_1,
    "product-comparison": PRODUCT_COMPARISON_UI_0_0_1,
    "prompt": PROMPT_UI_0_0_1,
    "shop-header": SHOP_HEADER_UI_0_0_1,
    "shopping-basket": SHOPPING_BASKET_UI_0_0_1,
    "side-panels": SIDE_PANELS_UI_0_0_1,
    "social-accounts": SOCIAL_ACCOUNTS_UI_0_0_1,
    "social-header": SOCIAL_HEADER_UI_0_0_1,
    "spreadsheet-view": SPREADSHEET_VIEW_UI_0_0_1,
    "spreadsheet": SPREADSHEET_UI_0_0_1,
    "stripe-checkout": STRIPE_CHECKOUT_UI_0_0_1,
    "subagent-activity": SUBAGENT_ACTIVITY_UI_0_0_1,
    "trial-balance": TRIAL_BALANCE_UI_0_0_1,
    "trip-budget": TRIP_BUDGET_UI_0_0_1,
    "trip-header": TRIP_HEADER_UI_0_0_1,
    "trip-itinerary": TRIP_ITINERARY_UI_0_0_1,
    "trip-map": TRIP_MAP_UI_0_0_1,
    "trip-options": TRIP_OPTIONS_UI_0_0_1,
    "trip-summary": TRIP_SUMMARY_UI_0_0_1,
    "vat-summary": VAT_SUMMARY_UI_0_0_1,
    "window-frame": WINDOW_FRAME_UI_0_0_1,
    "x-budget": X_BUDGET_UI_0_0_1,
    "x-post-preview": X_POST_PREVIEW_UI_0_0_1,
}


def get_ui(plugin_id: str) -> UISpec | None:
    """The UI plugin an agent's or an application's `ui` names, or None."""
    return UI_CATALOGUE.get(plugin_id)


def list_ui() -> list[UISpec]:
    return list(UI_CATALOGUE.values())


#: The visual components the UI plugins render, by the name a
#: surface gives them.
COMPONENT_CATALOGUE: Dict[str, ComponentSpec] = {
    component.id: component
    for plugin in UI_CATALOGUE.values()
    for component in plugin.components
}


def get_component(name: str) -> ComponentSpec | None:
    """The component a layout names, or None."""
    return COMPONENT_CATALOGUE.get(name)


def list_components() -> list[ComponentSpec]:
    return list(COMPONENT_CATALOGUE.values())


# ============================================================================
# The components as typed calls
# ============================================================================

#: A property bound to what the application publishes or takes: ``{"path": "/runs"}``.
Bound = Mapping[str, str]


class SurfaceComponents:
    """Every component of the catalog as a typed call: ``app.ui.table("runs", columns=[...])``.

    Each places the node the Canvas and the YAML write, through
    `Application.component`, which checks it against the same JSON Schema; an
    IDE completes its properties, and a type checker refuses a wrong value
    before the application runs. A property may be bound instead
    (``{"path": ...}``); a property left as ``None`` is not written.
    """

    def __init__(self, place: Callable[..., Dict[str, Any]]) -> None:
        self._place = place

    def text(
        self,
        id: str,
        *,
        text: Union[str, Bound],
        variant: Optional[
            Union[Literal["h1", "h2", "h3", "h4", "h5", "caption", "body"], Bound]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Text, version 0.9.0: Words on the page: a heading, a paragraph, the answer — plain or Markdown.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        text : str or Bound
            Words: What it says, plain or in simple Markdown.
        variant : Literal["h1", "h2", "h3", "h4", "h5", "caption", "body"] or Bound
            Style: A heading of a level, a caption, or body text.
        """
        given = {
            "text": text,
            "variant": variant,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Text",
            **{name: value for name, value in given.items() if value is not None},
        )

    def image(
        self,
        id: str,
        *,
        url: Union[str, Bound],
        description: Optional[Union[str, Bound]] = None,
        fit: Optional[
            Union[Literal["contain", "cover", "fill", "none", "scaleDown"], Bound]
        ] = None,
        variant: Optional[
            Union[
                Literal[
                    "icon",
                    "avatar",
                    "smallFeature",
                    "mediumFeature",
                    "largeFeature",
                    "header",
                ],
                Bound,
            ]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Image, version 0.9.0: A picture: a chart rendered elsewhere, a logo, a photo.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        url : str or Bound
            Address: Where the picture is.
        description : str or Bound
            Description: What it shows, for those who cannot see it.
        fit : Literal["contain", "cover", "fill", "none", "scaleDown"] or Bound
            Fit: How it is resized to its place.
        variant : Literal["icon", "avatar", "smallFeature", "mediumFeature", "largeFeature", "header"] or Bound
            Size: An icon, an avatar, a feature or a header.
        """
        given = {
            "url": url,
            "description": description,
            "fit": fit,
            "variant": variant,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Image",
            **{name: value for name, value in given.items() if value is not None},
        )

    def icon(
        self,
        id: str,
        *,
        name: Union[
            Literal[
                "accountCircle",
                "add",
                "arrowBack",
                "arrowForward",
                "attachFile",
                "calendarToday",
                "call",
                "camera",
                "check",
                "close",
                "delete",
                "download",
                "edit",
                "event",
                "error",
                "fastForward",
                "favorite",
                "favoriteOff",
                "folder",
                "help",
                "home",
                "info",
                "locationOn",
                "lock",
                "lockOpen",
                "mail",
                "menu",
                "moreVert",
                "moreHoriz",
                "notificationsOff",
                "notifications",
                "pause",
                "payment",
                "person",
                "phone",
                "photo",
                "play",
                "print",
                "refresh",
                "rewind",
                "search",
                "send",
                "settings",
                "share",
                "shoppingCart",
                "skipNext",
                "skipPrevious",
                "star",
                "starHalf",
                "starOff",
                "stop",
                "upload",
                "visibility",
                "visibilityOff",
                "volumeDown",
                "volumeMute",
                "volumeOff",
                "volumeUp",
                "warning",
            ],
            Bound,
        ],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Icon, version 0.9.0: A small drawing that says what something is: a check, a warning, a link.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        name : Literal["accountCircle", "add", "arrowBack", "arrowForward", "attachFile", "calendarToday", "call", "camera", "check", "close", "delete", "download", "edit", "event", "error", "fastForward", "favorite", "favoriteOff", "folder", "help", "home", "info", "locationOn", "lock", "lockOpen", "mail", "menu", "moreVert", "moreHoriz", "notificationsOff", "notifications", "pause", "payment", "person", "phone", "photo", "play", "print", "refresh", "rewind", "search", "send", "settings", "share", "shoppingCart", "skipNext", "skipPrevious", "star", "starHalf", "starOff", "stop", "upload", "visibility", "visibilityOff", "volumeDown", "volumeMute", "volumeOff", "volumeUp", "warning"] or Bound
            Icon: Which drawing, by its name.
        """
        given = {
            "name": name,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Icon",
            **{name: value for name, value in given.items() if value is not None},
        )

    def video(
        self,
        id: str,
        *,
        url: Union[str, Bound],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Video, version 0.9.0: A film played in place.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        url : str or Bound
            Address: Where the film is.
        """
        given = {
            "url": url,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Video",
            **{name: value for name, value in given.items() if value is not None},
        )

    def audio_player(
        self,
        id: str,
        *,
        url: Union[str, Bound],
        description: Optional[Union[str, Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Audio, version 0.9.0: A sound played in place: a recording, a summary read aloud.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        url : str or Bound
            Address: Where the sound is.
        description : str or Bound
            Description: What it is: a title or a summary.
        """
        given = {
            "url": url,
            "description": description,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "AudioPlayer",
            **{name: value for name, value in given.items() if value is not None},
        )

    def row(
        self,
        id: str,
        *,
        children: Union[List[str], Bound],
        justify: Optional[
            Union[
                Literal[
                    "center",
                    "end",
                    "spaceAround",
                    "spaceBetween",
                    "spaceEvenly",
                    "start",
                    "stretch",
                ],
                Bound,
            ]
        ] = None,
        align: Optional[
            Union[Literal["start", "center", "end", "stretch"], Bound]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Row, version 0.9.0: Children side by side, left to right.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        children : List[str] or Bound
            Blocks: The blocks inside it, by id, left to right.
        justify : Literal["center", "end", "spaceAround", "spaceBetween", "spaceEvenly", "start", "stretch"] or Bound
            Spacing: How the blocks share the width.
        align : Literal["start", "center", "end", "stretch"] or Bound
            Alignment: How the blocks line up top to bottom.
        """
        given = {
            "children": children,
            "justify": justify,
            "align": align,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Row",
            **{name: value for name, value in given.items() if value is not None},
        )

    def column(
        self,
        id: str,
        *,
        children: Union[List[str], Bound],
        justify: Optional[
            Union[
                Literal[
                    "start",
                    "center",
                    "end",
                    "spaceBetween",
                    "spaceAround",
                    "spaceEvenly",
                    "stretch",
                ],
                Bound,
            ]
        ] = None,
        align: Optional[
            Union[Literal["center", "end", "start", "stretch"], Bound]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Column, version 0.9.0: Children one under the other.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        children : List[str] or Bound
            Blocks: The blocks inside it, by id, top to bottom.
        justify : Literal["start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly", "stretch"] or Bound
            Spacing: How the blocks share the height.
        align : Literal["center", "end", "start", "stretch"] or Bound
            Alignment: How the blocks line up left to right.
        """
        given = {
            "children": children,
            "justify": justify,
            "align": align,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Column",
            **{name: value for name, value in given.items() if value is not None},
        )

    def list(
        self,
        id: str,
        *,
        children: Union[List[str], Bound],
        direction: Optional[Union[Literal["vertical", "horizontal"], Bound]] = None,
        align: Optional[
            Union[Literal["start", "center", "end", "stretch"], Bound]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """List, version 0.9.0: Items one after the other, each drawn by the same children: results, alternatives, steps.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        children : List[str] or Bound
            Blocks: The blocks inside it, by id, or the template repeated over a list.
        direction : Literal["vertical", "horizontal"] or Bound
            Direction: One under the other, or side by side.
        align : Literal["start", "center", "end", "stretch"] or Bound
            Alignment: How the items line up across.
        """
        given = {
            "children": children,
            "direction": direction,
            "align": align,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "List",
            **{name: value for name, value in given.items() if value is not None},
        )

    def card(
        self,
        id: str,
        *,
        child: Union[str, Bound],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Card, version 0.9.0: A framed group: what belongs together, set apart.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        child : str or Bound
            Block: The one block inside it, by id; a Row or Column for several.
        """
        given = {
            "child": child,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Card",
            **{name: value for name, value in given.items() if value is not None},
        )

    def tabs(
        self,
        id: str,
        *,
        tabs: Union[List[Dict[str, Any]], Bound],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Tabs, version 0.9.0: Several views of one place, one shown at a time.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        tabs : List[Dict[str, Any]] or Bound
            Tabs: Each tab's title and the block it shows, by id.
        """
        given = {
            "tabs": tabs,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Tabs",
            **{name: value for name, value in given.items() if value is not None},
        )

    def divider(
        self,
        id: str,
        *,
        axis: Optional[Union[Literal["horizontal", "vertical"], Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Divider, version 0.9.0: A line between what comes before and after.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        axis : Literal["horizontal", "vertical"] or Bound
            Direction: Across or up and down.
        """
        given = {
            "axis": axis,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Divider",
            **{name: value for name, value in given.items() if value is not None},
        )

    def modal(
        self,
        id: str,
        *,
        trigger: Union[str, Bound],
        content: Union[str, Bound],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Modal, version 0.9.0: A window over the page, opened by a trigger: details, a confirmation.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        trigger : str or Bound
            Opened by: The block that opens it, by id: a button.
        content : str or Bound
            Shows: The block shown inside it, by id.
        """
        given = {
            "trigger": trigger,
            "content": content,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Modal",
            **{name: value for name, value in given.items() if value is not None},
        )

    def button(
        self,
        id: str,
        *,
        child: Union[str, Bound],
        action: Union[Dict[str, Any], Bound],
        variant: Optional[
            Union[Literal["default", "primary", "borderless"], Bound]
        ] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Button, version 0.9.0: An action the person takes: send, run, approve. One filled button per screen.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        child : str or Bound
            Label: The block on it, by id: a Text for its words.
        action : Dict[str, Any] or Bound
            Does: What pressing it sends, by name, with what it reads.
        variant : Literal["default", "primary", "borderless"] or Bound
            Style: Primary for the one main action, borderless for a link.
        """
        given = {
            "child": child,
            "action": action,
            "variant": variant,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Button",
            **{name: value for name, value in given.items() if value is not None},
        )

    def text_field(
        self,
        id: str,
        *,
        label: Union[str, Bound],
        value: Optional[Union[str, Bound]] = None,
        variant: Optional[
            Union[Literal["longText", "number", "shortText", "obscured"], Bound]
        ] = None,
        validationRegexp: Optional[Union[str, Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Input, version 0.9.0: A field the person types in: a word, a sentence, a number, a date.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        label : str or Bound
            Label: What the person reads beside it.
        value : str or Bound
            Value: What is typed in it.
        variant : Literal["longText", "number", "shortText", "obscured"] or Bound
            Kind: A short or long text, a number, or hidden as typed.
        validationRegexp : str or Bound
            Pattern: A regular expression what is typed must match.
        """
        given = {
            "label": label,
            "value": value,
            "variant": variant,
            "validationRegexp": validationRegexp,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "TextField",
            **{name: value for name, value in given.items() if value is not None},
        )

    def check_box(
        self,
        id: str,
        *,
        label: Union[str, Bound],
        value: Union[bool, Bound],
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Checkbox, version 0.9.0: Yes or no: an option on or off, a consent given.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        label : str or Bound
            Label: What the person reads beside it.
        value : bool or Bound
            Value: Whether it is ticked.
        """
        given = {
            "label": label,
            "value": value,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "CheckBox",
            **{name: value for name, value in given.items() if value is not None},
        )

    def choice_picker(
        self,
        id: str,
        *,
        options: Union[List[Dict[str, Any]], Bound],
        value: Union[List[str], Bound],
        label: Optional[Union[str, Bound]] = None,
        variant: Optional[
            Union[Literal["multipleSelection", "mutuallyExclusive"], Bound]
        ] = None,
        displayStyle: Optional[Union[Literal["checkbox", "chips"], Bound]] = None,
        filterable: Optional[Union[bool, Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Select, version 0.9.0: One choice, or several, among options the builder lists or the data gives.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        options : List[Dict[str, Any]] or Bound
            Options: What may be chosen: the words read and the value sent.
        value : List[str] or Bound
            Value: The values chosen.
        label : str or Bound
            Label: What the person reads above the options.
        variant : Literal["multipleSelection", "mutuallyExclusive"] or Bound
            Choice: One of the options, or several.
        displayStyle : Literal["checkbox", "chips"] or Bound
            Shown as: Checkboxes or chips.
        filterable : bool or Bound
            Searchable: A search field above the options.
        """
        given = {
            "options": options,
            "value": value,
            "label": label,
            "variant": variant,
            "displayStyle": displayStyle,
            "filterable": filterable,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "ChoicePicker",
            **{name: value for name, value in given.items() if value is not None},
        )

    def slider(
        self,
        id: str,
        *,
        max: Union[float, Bound],
        value: Union[float, Bound],
        label: Optional[Union[str, Bound]] = None,
        min: Optional[Union[float, Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Slider, version 0.9.0: A number chosen along a range: a weight, a budget, a threshold.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        max : float or Bound
            Most: The largest value.
        value : float or Bound
            Value: The value chosen.
        label : str or Bound
            Label: What the person reads beside it.
        min : float or Bound
            Least: The smallest value.
        """
        given = {
            "max": max,
            "value": value,
            "label": label,
            "min": min,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Slider",
            **{name: value for name, value in given.items() if value is not None},
        )

    def date_time_input(
        self,
        id: str,
        *,
        value: Union[str, Bound],
        enableDate: Optional[Union[bool, Bound]] = None,
        enableTime: Optional[Union[bool, Bound]] = None,
        min: Optional[Union[str, Bound]] = None,
        max: Optional[Union[str, Bound]] = None,
        label: Optional[Union[str, Bound]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Date and time, version 0.9.0: A date, a time, or both, chosen from a calendar.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        value : str or Bound
            Value: The date or time chosen, in ISO 8601.
        enableDate : bool or Bound
            Date: A date may be chosen.
        enableTime : bool or Bound
            Time: A time may be chosen.
        min : str or Bound
            Earliest: The earliest that may be chosen, in ISO 8601.
        max : str or Bound
            Latest: The latest that may be chosen, in ISO 8601.
        label : str or Bound
            Label: What the person reads beside it.
        """
        given = {
            "value": value,
            "enableDate": enableDate,
            "enableTime": enableTime,
            "min": min,
            "max": max,
            "label": label,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "DateTimeInput",
            **{name: value for name, value in given.items() if value is not None},
        )

    def table(
        self,
        id: str,
        *,
        columns: Union[List[str], Bound],
        title: Optional[Union[str, Bound]] = None,
        page_size: Optional[Union[int, Bound]] = None,
        selectable: Optional[Union[bool, Bound]] = None,
        rows: Optional[Bound] = None,
        selected: Optional[Bound] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Table, version 1.0.0: Rows the application found or keeps, with the columns the builder chooses.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        columns : List[str] or Bound
            Columns: The columns, in order.
        title : str or Bound
            Title: What the table is, above it.
        page_size : int or Bound
            Rows per page: How many rows show at once.
        selectable : bool or Bound
            Selectable: A row may be chosen, and its choice sent.
        rows : Bound
            What it shows.
        selected : Bound
            Where what a person does is written.
        """
        given = {
            "columns": columns,
            "title": title,
            "page_size": page_size,
            "selectable": selectable,
            "rows": rows,
            "selected": selected,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Table",
            **{name: value for name, value in given.items() if value is not None},
        )

    def chart(
        self,
        id: str,
        *,
        kind: Union[Literal["bar", "line", "scatter", "area"], Bound],
        x: Union[str, Bound],
        y: Union[str, Bound],
        title: Optional[Union[str, Bound]] = None,
        series: Optional[Union[str, Bound]] = None,
        points: Optional[Bound] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Chart, version 1.0.0: Numbers drawn: a bar, a line, a scatter of what the application measured.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        kind : Literal["bar", "line", "scatter", "area"] or Bound
            Kind: How the numbers are drawn.
        x : str or Bound
            Across: The field along the bottom.
        y : str or Bound
            Up: The field measured.
        title : str or Bound
            Title: What the chart shows, above it.
        series : str or Bound
            Series: A field whose values are drawn apart.
        points : Bound
            What it shows.
        """
        given = {
            "kind": kind,
            "x": x,
            "y": y,
            "title": title,
            "series": series,
            "points": points,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Chart",
            **{name: value for name, value in given.items() if value is not None},
        )

    def file_upload(
        self,
        id: str,
        *,
        label: Union[str, Bound],
        accept: Optional[Union[List[str], Bound]] = None,
        multiple: Optional[Union[bool, Bound]] = None,
        max_mb: Optional[Union[int, Bound]] = None,
        files: Optional[Bound] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """File upload, version 1.0.0: A file the person gives the application: a document to read, a sheet to check.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        label : str or Bound
            Label: What the person reads beside it.
        accept : List[str] or Bound
            Accepts: The kinds of file it takes, by extension.
        multiple : bool or Bound
            Several: More than one file at once.
        max_mb : int or Bound
            Largest (MB): The largest file it takes.
        files : Bound
            Where what a person does is written.
        """
        given = {
            "label": label,
            "accept": accept,
            "multiple": multiple,
            "max_mb": max_mb,
            "files": files,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "FileUpload",
            **{name: value for name, value in given.items() if value is not None},
        )

    def chat(
        self,
        id: str,
        *,
        welcome: Optional[Union[str, Bound]] = None,
        placeholder: Optional[Union[str, Bound]] = None,
        starters: Optional[Union[List[str], Bound]] = None,
        show_tools: Optional[Union[bool, Bound]] = None,
        messages: Optional[Bound] = None,
        message: Optional[Bound] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Chat, version 1.0.0: The conversation with the application: its welcome, its starters, the composer.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        welcome : str or Bound
            Welcome: What it says before anyone writes.
        placeholder : str or Bound
            Composer hint: Shown in the composer while it is empty.
        starters : List[str] or Bound
            Starters: Questions offered before the first message.
        show_tools : bool or Bound
            Shows its tools: The tool calls are shown as they happen.
        messages : Bound
            What it shows.
        message : Bound
            Where what a person does is written.
        """
        given = {
            "welcome": welcome,
            "placeholder": placeholder,
            "starters": starters,
            "show_tools": show_tools,
            "messages": messages,
            "message": message,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Chat",
            **{name: value for name, value in given.items() if value is not None},
        )

    def evidence(
        self,
        id: str,
        *,
        title: Optional[Union[str, Bound]] = None,
        show_passages: Optional[Union[bool, Bound]] = None,
        max_items: Optional[Union[int, Bound]] = None,
        sources: Optional[Bound] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Evidence, version 1.0.0: What an answer rests on: the sources opened, the passages cited, each with its link.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        title : str or Bound
            Title: Above the sources.
        show_passages : bool or Bound
            Shows passages: Each source with the passage cited from it.
        max_items : int or Bound
            Most shown: How many sources show before *more*.
        sources : Bound
            What it shows.
        """
        given = {
            "title": title,
            "show_passages": show_passages,
            "max_items": max_items,
            "sources": sources,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Evidence",
            **{name: value for name, value in given.items() if value is not None},
        )

    def form(
        self,
        id: str,
        *,
        schema: Union[Dict[str, Any], Bound],
        title: Optional[Union[str, Bound]] = None,
        ui: Optional[Union[Dict[str, Any], Bound]] = None,
        submit_label: Optional[Union[str, Bound]] = None,
        values: Optional[Bound] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Form, version 1.1.0: Several fields asked at once, from a JSON Schema, checked as they are filled and again when they arrive (drawn with @datalayer/primer-rjsf).

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        schema : Dict[str, Any] or Bound
            Fields: The JSON Schema of what is asked: its fields, their types, what is required.
        title : str or Bound
            Title: What the form is for, above it.
        ui : Dict[str, Any] or Bound
            How its fields are drawn: By field name, the ui: options @datalayer/primer-rjsf reads (a uiSchema): ui:widget one of select, radio, range, updown, switch, checkbox, text, textarea, date, checkboxes, tags; each field's own widget when unsaid.
        submit_label : str or Bound
            Send button: The words on its button.
        values : Bound
            What it shows.
        """
        given = {
            "schema": schema,
            "title": title,
            "ui": ui,
            "submit_label": submit_label,
            "values": values,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Form",
            **{name: value for name, value in given.items() if value is not None},
        )

    def download(
        self,
        id: str,
        *,
        name: Union[str, Bound],
        url: Union[str, Bound],
        media_type: Optional[Union[str, Bound]] = None,
        size: Optional[Union[int, Bound]] = None,
        description: Optional[Union[str, Bound]] = None,
        action: Optional[Dict[str, Any]] = None,
        visible_when: Optional[Bound] = None,
        weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        """File to download, version 1.0.0: A file the application gives, to save: a report, a sheet, an export — by its link, or the file itself as a data: URL.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        name : str or Bound
            File name: What the file is saved as, with its extension.
        url : str or Bound
            Link: Where the file is: an http(s) link, or the file itself as a data: URL.
        media_type : str or Bound
            Kind: Its media type (text/csv, application/pdf…), said beside its name.
        size : int or Bound
            Size (bytes): How large it is, said beside its name.
        description : str or Bound
            Description: A line under its name.
        """
        given = {
            "name": name,
            "url": url,
            "media_type": media_type,
            "size": size,
            "description": description,
            "action": action,
            "visible_when": visible_when,
            "weight": weight,
        }
        return self._place(
            id,
            "Download",
            **{name: value for name, value in given.items() if value is not None},
        )
