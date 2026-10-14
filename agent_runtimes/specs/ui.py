# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
UI Catalog.

The UI plugins: the Reactor plugins an interface is made of (AGENTIC_UI R8).

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Union

from agent_runtimes.types import (
    ComponentBindingsSpec,
    ComponentSpec,
    UiContributionsSpec,
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
    plugin="@datalayer/loop-plugin-a2ui-surface",
    folder="a2ui-surface",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.chatHeader"],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
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
    plugin="@datalayer/loop-plugin-a2ui",
    folder="a2ui",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.command", "loop.viewType"],
        commands=["a2ui"],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
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
    plugin="@datalayer/loop-plugin-agentspecs",
    folder="agentspecs",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.header"],
        points=["loop.command"],
        commands=["agents"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-app-activity",
    folder="app-activity",
    per="application",
    contributions=UiContributionsSpec(
        slots=["loop.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-app-components",
    folder="app-components",
    per="application",
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.a2ui.component", "loop.canvas.block"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
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
    plugin="@datalayer/loop-plugin-app-computer",
    folder="app-computer",
    per="application",
    contributions=UiContributionsSpec(
        slots=["loop.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-app-elements",
    folder="app-elements",
    per=None,
    contributions=UiContributionsSpec(
        slots=["root"],
        points=["reactor.ui.renderer"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui"],
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
    plugin="@datalayer/loop-plugin-app-page",
    folder="app-page",
    per="application",
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.surface"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["a2ui", "mcp-apps"],
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
    plugin="@datalayer/loop-plugin-app-rules",
    folder="app-rules",
    per="application",
    contributions=UiContributionsSpec(
        slots=["loop.sidebar"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-ui",
    folder="canvas-blocks",
    per="ui",
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.canvas.block"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-parts",
    folder="canvas-parts",
    per="source",
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.canvas.part"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-chat-extras",
    folder="chat-extras",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.extras"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-chat-header",
    folder="chat-header",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.header"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-chat-view",
    folder="chat-view",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-chat",
    folder="chat",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=[
            "loop.chat.turn",
            "loop.command",
            "loop.document.toolbar.item",
            "loop.notebook.toolbar.item",
            "loop.viewType",
        ],
        commands=["chat"],
    ),
    contribution_points=[
        "loop.agent.available",
        "loop.chat.composer",
        "loop.chat.extras",
        "loop.chat.header",
        "loop.chat.suggestion",
        "loop.chat.turn",
        "loop.frontendTool",
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
    plugin="@datalayer/loop-plugin-commands",
    folder="commands",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.status"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-document-toolbar",
    folder="document-toolbar",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.document.toolbar"],
        commands=[],
    ),
    contribution_points=["loop.document.toolbar.item"],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-document-view",
    folder="document-view",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-document",
    folder="document",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.surface", "loop.command"],
        commands=["document"],
    ),
    contribution_points=["loop.document.opening", "loop.document.toolbar"],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-input-prompt",
    folder="input-prompt",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.composer"],
        commands=[],
    ),
    contribution_points=["loop.prompt.panel"],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-models",
    folder="models",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.command"],
        commands=["models"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-notebook-toolbar",
    folder="notebook-toolbar",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.notebook.toolbar"],
        commands=[],
    ),
    contribution_points=["loop.notebook.toolbar.item"],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-notebook-view",
    folder="notebook-view",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.promptAction"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-notebook",
    folder="notebook",
    per=None,
    contributions=UiContributionsSpec(
        slots=[],
        points=["loop.chat.surface", "loop.command"],
        commands=["notebook"],
    ),
    contribution_points=["loop.notebook.opening", "loop.notebook.toolbar"],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-page-layout",
    folder="page-layout",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.header"],
        points=["loop.chat.layout", "loop.prompt.panel"],
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
    plugin="@datalayer/loop-plugin-pap-sign-in",
    folder="pap-sign-in",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.chatHeader"],
        points=["reactor.ui.renderer", "reactor.ui.toolBinding"],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=["mcp-ui"],
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
    plugin="@datalayer/loop-plugin-prompt",
    folder="prompt",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.promptAction"],
        points=["loop.command"],
        commands=["new", "prompt"],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-subagent-activity",
    folder="subagent-activity",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.inpromptMenu"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    plugin="@datalayer/loop-plugin-window-frame",
    folder="window-frame",
    per=None,
    contributions=UiContributionsSpec(
        slots=["loop.header", "loop.window.controls"],
        points=[],
        commands=[],
    ),
    contribution_points=[],
    settings={},
    renderers=[],
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
    "app-activity": APP_ACTIVITY_UI_0_0_1,
    "app-components": APP_COMPONENTS_UI_0_0_1,
    "app-computer": APP_COMPUTER_UI_0_0_1,
    "app-elements": APP_ELEMENTS_UI_0_0_1,
    "app-page": APP_PAGE_UI_0_0_1,
    "app-rules": APP_RULES_UI_0_0_1,
    "canvas-blocks": CANVAS_BLOCKS_UI_0_0_1,
    "canvas-parts": CANVAS_PARTS_UI_0_0_1,
    "chat-extras": CHAT_EXTRAS_UI_0_0_1,
    "chat-header": CHAT_HEADER_UI_0_0_1,
    "chat-view": CHAT_VIEW_UI_0_0_1,
    "chat": CHAT_UI_0_0_1,
    "commands": COMMANDS_UI_0_0_1,
    "document-toolbar": DOCUMENT_TOOLBAR_UI_0_0_1,
    "document-view": DOCUMENT_VIEW_UI_0_0_1,
    "document": DOCUMENT_UI_0_0_1,
    "input-prompt": INPUT_PROMPT_UI_0_0_1,
    "models": MODELS_UI_0_0_1,
    "notebook-toolbar": NOTEBOOK_TOOLBAR_UI_0_0_1,
    "notebook-view": NOTEBOOK_VIEW_UI_0_0_1,
    "notebook": NOTEBOOK_UI_0_0_1,
    "page-layout": PAGE_LAYOUT_UI_0_0_1,
    "pap-sign-in": PAP_SIGN_IN_UI_0_0_1,
    "prompt": PROMPT_UI_0_0_1,
    "subagent-activity": SUBAGENT_ACTIVITY_UI_0_0_1,
    "window-frame": WINDOW_FRAME_UI_0_0_1,
}


def get_ui(plugin_id: str) -> UISpec | None:
    """The UI plugin an agent's or an application's `ui` names, or None."""
    return UI_CATALOGUE.get(plugin_id)


def list_ui() -> list[UISpec]:
    return list(UI_CATALOGUE.values())


#: The visual components the UI plugins render, by the name a
#: surface gives them (LOOP C-13).
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
# The components as typed calls (LOOP C-15)
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
