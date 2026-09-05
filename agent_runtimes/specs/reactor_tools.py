# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Reactor Tool Catalog.

Reactor plugins' commands and backends, as tool bundles agents can take.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import ReactorToolSpec

# ============================================================================
# Reactor Tool Definitions
# ============================================================================

DECKS_REACTOR_TOOL_SPEC_0_0_1 = ReactorToolSpec.model_validate(
    {
        "id": "decks",
        "version": "0.0.1",
        "name": "Decks",
        "description": "Presentations described as data: list, open and steer decks in the page, and read or write the decks the server keeps.",
        "tags": ["reactor", "decks", "presentations"],
        "enabled": True,
        "plugin": "@datalayer/decks",
        "frontend": [
            {
                "name": "decks_list",
                "command": "decks.list",
                "description": "Close the open deck and show the list of decks.",
                "parameters": None,
                "approval": "auto",
            },
            {
                "name": "decks_open",
                "command": "decks.open",
                "description": "Open a deck by its id — `collection/slug`, or `slug` for a deck without a collection — optionally at a slide.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "The deck id, as listed by decks_list_decks.",
                        },
                        "slide": {
                            "type": "integer",
                            "description": "1-based slide to open at. The first when omitted.",
                        },
                    },
                    "required": ["id"],
                },
                "approval": "auto",
            },
            {
                "name": "decks_go_to_slide",
                "command": "decks.goToSlide",
                "description": "Move the open deck to a slide.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slide": {
                            "type": "integer",
                            "description": "1-based slide number.",
                        }
                    },
                    "required": ["slide"],
                },
                "approval": "auto",
            },
            {
                "name": "decks_next_slide",
                "command": "decks.nextSlide",
                "description": "Advance the open deck by one slide.",
                "parameters": None,
                "approval": "auto",
            },
            {
                "name": "decks_previous_slide",
                "command": "decks.previousSlide",
                "description": "Go back one slide in the open deck.",
                "parameters": None,
                "approval": "auto",
            },
            {
                "name": "decks_present",
                "command": "decks.present",
                "description": "Put the open deck in fullscreen, or leave fullscreen.",
                "parameters": None,
                "approval": "auto",
            },
            {
                "name": "decks_print",
                "command": "decks.print",
                "description": "Open the print view of the open deck in a new tab, for Save as PDF.",
                "parameters": None,
                "approval": "auto",
            },
        ],
        "backend": {
            "base_url": "http://127.0.0.1:8797",
            "base_url_envvar": "DATALAYER_DECKS_URL",
            "tools": [
                {
                    "name": "decks_list_decks",
                    "method": "GET",
                    "path": "/decks",
                    "description": "Every deck the server holds, with its id, collection, slug and spec.",
                    "parameters": None,
                    "approval": "auto",
                },
                {
                    "name": "decks_get_deck",
                    "method": "GET",
                    "path": "/decks/{id}",
                    "description": "One deck's full spec by id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "The deck id, `collection/slug` or `slug`.",
                            }
                        },
                        "required": ["id"],
                    },
                    "approval": "auto",
                },
                {
                    "name": "decks_create_deck",
                    "method": "POST",
                    "path": "/decks",
                    "description": "Create a deck from a spec. The spec is `{deck: {title, subtitle?, template?}, slides: [...]}`; each slide has a `type` (title, section, bullets, two-columns, code, statement, metrics, chart, timeline, comparison, image) and the fields that type needs.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "collection": {
                                "type": "string",
                                "description": "Optional family the deck belongs to.",
                            },
                            "slug": {
                                "type": "string",
                                "description": "URL-safe name; becomes the address.",
                            },
                            "spec": {
                                "type": "object",
                                "description": "The deck specification.",
                            },
                        },
                        "required": ["slug", "spec"],
                    },
                    "approval": "auto",
                },
                {
                    "name": "decks_update_deck",
                    "method": "PUT",
                    "path": "/decks/{id}",
                    "description": "Replace a deck. The whole record is sent again; keep the slug to keep the address.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "The deck to replace, `collection/slug` or `slug`.",
                            },
                            "collection": {"type": "string"},
                            "slug": {"type": "string"},
                            "spec": {
                                "type": "object",
                                "description": "The whole new specification.",
                            },
                        },
                        "required": ["id", "slug", "spec"],
                    },
                    "approval": "auto",
                },
                {
                    "name": "decks_delete_deck",
                    "method": "DELETE",
                    "path": "/decks/{id}",
                    "description": "Delete a deck. Irreversible; ask first.",
                    "parameters": {
                        "type": "object",
                        "properties": {"id": {"type": "string"}},
                        "required": ["id"],
                    },
                    "approval": "manual",
                },
            ],
        },
        "icon": "project",
        "emoji": "📊",
    }
)

# ============================================================================
# Reactor Tool Catalog
# ============================================================================

REACTOR_TOOL_CATALOG: Dict[str, ReactorToolSpec] = {
    "decks": DECKS_REACTOR_TOOL_SPEC_0_0_1,
}


def get_reactor_tool_spec(tool_id: str) -> ReactorToolSpec | None:
    """Get a reactor tool specification by ID (accepts both bare and versioned refs)."""
    spec = REACTOR_TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(":")
    if base and "." in ver:
        return REACTOR_TOOL_CATALOG.get(base)
    return None


def list_reactor_tool_specs() -> List[ReactorToolSpec]:
    """List all reactor tool specifications."""
    return list(REACTOR_TOOL_CATALOG.values())
