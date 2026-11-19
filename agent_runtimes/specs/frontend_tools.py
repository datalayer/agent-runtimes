# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Frontend Tool Catalog.

Predefined frontend tool sets that can be attached to agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import FrontendToolSpec

# ============================================================================
# Frontend Tool Definitions
# ============================================================================

ARENA_INVADERS_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="arena-invaders",
    version="0.0.1",
    name="Space Invaders arena",
    description="Two cannons, one wave — read the arena, move your cannon under an invader, fire, and be told where the wave is as it marches; a hit scores its row, the wave cleared or a cannon hit ends it.",
    tags=["frontend", "arena", "battle", "game"],
    enabled=True,
    toolset=["arena_read", "arena_invaders_move", "arena_invaders_fire", "arena_watch"],
    streams=["arena_watch"],
    icon="@primer/octicons-react:rocket",
    emoji="👾",
)

ARENA_PONG_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="arena-pong",
    version="0.0.1",
    name="Pong arena",
    description="Two paddles, one ball, first to eleven — read the arena, move your paddle, serve, and be told where the ball is as it moves.",
    tags=["frontend", "arena", "battle", "game"],
    enabled=True,
    toolset=["arena_read", "arena_pong_move", "arena_pong_serve", "arena_watch"],
    streams=["arena_watch"],
    icon="@primer/octicons-react:play",
    emoji="🏓",
)

CELLS_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="cells",
    version="0.0.1",
    name="Cells",
    description="Read and write the spreadsheet on the person's screen, and chart it — the grid drawn by Datalayer Cells.",
    tags=["frontend", "cells", "spreadsheets"],
    enabled=True,
    toolset=[
        "cells_read_range",
        "cells_write_range",
        "cells_insert_chart",
        "cells_list_charts",
        "cells_select_range",
    ],
    icon="@primer/octicons-react:table",
    emoji="🧮",
)

DECKS_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="decks",
    version="0.0.1",
    name="Decks",
    description="Read, write and drive presentations kept as data — a deck, its slides, and the one on screen.",
    tags=["frontend", "decks", "presentations"],
    enabled=True,
    toolset=[
        "decks_list_decks",
        "decks_get_deck",
        "decks_create_deck",
        "decks_update_deck",
        "decks_update_slide",
        "decks_insert_slide",
        "decks_delete_slide",
        "decks_list_slides",
        "decks_get_slide",
        "decks_add_slide",
        "decks_delete_deck",
        "decks_list",
        "decks_open",
        "decks_go_to_slide",
        "decks_next_slide",
        "decks_previous_slide",
        "decks_present",
        "decks_print",
    ],
    icon="@primer/octicons-react:project",
    emoji="🃏",
)

JUPYTER_NOTEBOOK_EDIT_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="jupyter-notebook-edit",
    version="0.0.1",
    name="Jupyter Notebook (edit)",
    description="Read and edit a notebook, and run cells — but never delete from it.",
    tags=["frontend", "notebook", "edit"],
    enabled=True,
    toolset=[
        "readCell",
        "readAllCells",
        "insertCell",
        "updateCell",
        "runCell",
        "executeCode",
    ],
    icon="@datalayer/icons-react:jupyter",
    emoji="📓",
)

JUPYTER_NOTEBOOK_PROPOSE_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="jupyter-notebook-propose",
    version="0.0.1",
    name="Jupyter Notebook (propose)",
    description="Read a notebook and propose changes for a person to accept, never applying them.",
    tags=["frontend", "notebook", "propose"],
    enabled=True,
    toolset=["readCell", "readAllCells", "proposeCellUpdate", "runCell"],
    icon="@datalayer/icons-react:jupyter",
    emoji="📓",
)

JUPYTER_NOTEBOOK_READ_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="jupyter-notebook-read",
    version="0.0.1",
    name="Jupyter Notebook (read only)",
    description="Read a notebook without changing it — cells, outputs and errors.",
    tags=["frontend", "notebook", "read"],
    enabled=True,
    toolset=["readCell", "readAllCells"],
    icon="@datalayer/icons-react:jupyter",
    emoji="📓",
)

JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="jupyter-notebook",
    version="0.0.1",
    name="Jupyter Notebook",
    description="Frontend tools for interacting with Jupyter notebooks.",
    tags=["frontend", "notebook", "jupyter-server"],
    enabled=True,
    toolset="all",
    icon="@datalayer/icons-react:jupyter",
    emoji="📓",
)

LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="lexical-document",
    version="0.0.1",
    name="Lexical Document",
    description="Frontend tools for interacting with Lexical documents: reading and writing blocks, running Jupyter cells in the page, and drawing diagrams into the document with Excalidraw.",
    tags=["frontend", "document", "lexical", "drawing", "diagram"],
    enabled=True,
    toolset="all",
    icon="@primer/octicons-react:file",
    emoji="📄",
)

NOTICES_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="notices",
    version="0.0.1",
    name="Notices",
    description="Slide a short notice in from an edge of the chat — info, success, warning or error, a title and a line — for a few seconds or until closed; run in the page.",
    tags=["frontend", "page", "notices"],
    enabled=True,
    toolset=["show_notice"],
    icon="@primer/octicons-react:bell",
    emoji="🔔",
)

PAGE_DECK_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-deck",
    version="0.0.1",
    name="Deck in the page",
    description="Build a slide deck in the conversation — create it, lay its slides out in one call, add, replace, move and delete slides with speaker notes and pictures, set its look, read it back — shown to the person as it is built.",
    tags=["frontend", "decks", "presentations", "page"],
    enabled=True,
    toolset=[
        "deck_create",
        "deck_set_title",
        "deck_add_slide",
        "deck_add_slides",
        "deck_update_slide",
        "deck_move_slide",
        "deck_delete_slide",
        "deck_set_theme",
        "deck_read",
    ],
    icon="@primer/octicons-react:project",
    emoji="🎞️",
)

PAGE_SHEET_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-sheet",
    version="0.0.1",
    name="Sheet in the page",
    description="Fill a spreadsheet in the conversation — a sheet with named columns, rows and ranges, formulas, number and currency formats, a frozen header, tabs, a chart — shown to the person as it is built, editable and exported as CSV.",
    tags=["frontend", "cells", "spreadsheets", "page"],
    enabled=True,
    toolset=[
        "sheet_create",
        "sheet_write_range",
        "sheet_read_range",
        "sheet_format_range",
        "sheet_freeze",
        "sheet_add_tab",
        "sheet_show_tab",
        "sheet_insert_chart",
    ],
    icon="@primer/octicons-react:table",
    emoji="📑",
)

SIDE_PANELS_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="side-panels",
    version="0.0.1",
    name="Side panels",
    description="Open and close the chat's left and right panels, where the UI placed there shows — run in the page, changing nothing else.",
    tags=["frontend", "page", "panels"],
    enabled=True,
    toolset=["open_side_panel", "close_side_panel"],
    icon="@primer/octicons-react:sidebar-expand",
    emoji="🗂️",
)

# ============================================================================
# Frontend Tool Catalog
# ============================================================================

FRONTEND_TOOL_CATALOG: Dict[str, FrontendToolSpec] = {
    "arena-invaders": ARENA_INVADERS_FRONTEND_TOOL_SPEC_0_0_1,
    "arena-pong": ARENA_PONG_FRONTEND_TOOL_SPEC_0_0_1,
    "cells": CELLS_FRONTEND_TOOL_SPEC_0_0_1,
    "decks": DECKS_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-edit": JUPYTER_NOTEBOOK_EDIT_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-propose": JUPYTER_NOTEBOOK_PROPOSE_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-read": JUPYTER_NOTEBOOK_READ_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook": JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1,
    "lexical-document": LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1,
    "notices": NOTICES_FRONTEND_TOOL_SPEC_0_0_1,
    "page-deck": PAGE_DECK_FRONTEND_TOOL_SPEC_0_0_1,
    "page-sheet": PAGE_SHEET_FRONTEND_TOOL_SPEC_0_0_1,
    "side-panels": SIDE_PANELS_FRONTEND_TOOL_SPEC_0_0_1,
}


def get_frontend_tool_spec(tool_id: str) -> FrontendToolSpec | None:
    """Get a frontend tool specification by ID (accepts both bare and versioned refs)."""
    spec = FRONTEND_TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(":")
    if base and "." in ver:
        return FRONTEND_TOOL_CATALOG.get(base)
    return None


def list_frontend_tool_specs() -> List[FrontendToolSpec]:
    """List all frontend tool specifications."""
    return list(FRONTEND_TOOL_CATALOG.values())
