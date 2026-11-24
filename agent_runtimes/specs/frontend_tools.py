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
    toolset=["arenaRead", "arenaInvadersMove", "arenaInvadersFire", "arenaWatch"],
    streams=["arenaWatch"],
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
    toolset=["arenaRead", "arenaPongMove", "arenaPongServe", "arenaWatch"],
    streams=["arenaWatch"],
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
        "cellsReadRange",
        "cellsWriteRange",
        "cellsInsertChart",
        "cellsListCharts",
        "cellsSelectRange",
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
        "decksListDecks",
        "decksGetDeck",
        "decksCreateDeck",
        "decksUpdateDeck",
        "decksUpdateSlide",
        "decksInsertSlide",
        "decksDeleteSlide",
        "decksListSlides",
        "decksGetSlide",
        "decksAddSlide",
        "decksDeleteDeck",
        "decksList",
        "decksOpen",
        "decksGoToSlide",
        "decksNextSlide",
        "decksPreviousSlide",
        "decksPresent",
        "decksPrint",
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
        "notebookReadCell",
        "notebookReadAllCells",
        "notebookInsertCell",
        "notebookUpdateCell",
        "notebookRunCell",
        "notebookExecuteCode",
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
    toolset=[
        "notebookReadCell",
        "notebookReadAllCells",
        "notebookProposeCellUpdate",
        "notebookRunCell",
    ],
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
    toolset=["notebookReadCell", "notebookReadAllCells"],
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
    toolset=["noticeShow"],
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
        "deckCreate",
        "deckSetTitle",
        "deckAddSlide",
        "deckAddSlides",
        "deckUpdateSlide",
        "deckMoveSlide",
        "deckDeleteSlide",
        "deckSetTheme",
        "deckRead",
    ],
    icon="@primer/octicons-react:project",
    emoji="🎞️",
)

PAGE_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-document",
    version="0.0.1",
    name="Document in the page",
    description="Read and edit the blocks of the Lexical document in the conversation's Document tab, using stable block identifiers for later updates and deletion.",
    tags=["frontend", "document", "lexical", "page"],
    enabled=True,
    toolset="all",
    icon="@primer/octicons-react:file",
    emoji="📄",
)

PAGE_EXCALIDRAW_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-excalidraw",
    version="0.0.1",
    name="Excalidraw in the page",
    description="Draw diagrams on an Excalidraw canvas in the conversation — insert a drawing, read it, add, change, connect and delete its shapes, set its canvas, turn Mermaid into shapes — shown to the person as it is drawn, editable.",
    tags=["frontend", "excalidraw", "diagrams", "page"],
    enabled=True,
    toolset=[
        "excalidrawInsertNode",
        "excalidrawFromMermaid",
        "excalidrawListDrawings",
        "excalidrawReadScene",
        "excalidrawAddElements",
        "excalidrawUpdateElements",
        "excalidrawConnectElements",
        "excalidrawDeleteElements",
        "excalidrawSetAppState",
        "excalidrawResize",
        "excalidrawClearScene",
    ],
    icon="@primer/octicons-react:paintbrush",
    emoji="🖌️",
)

PAGE_MERMAID_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-mermaid",
    version="0.0.1",
    name="Mermaid in the page",
    description="Write Mermaid diagrams in the conversation — create or replace a diagram's source, read it back, check a source with Mermaid's parser, render to SVG, list the diagram types — each drawn for the person as it is written.",
    tags=["frontend", "mermaid", "diagrams", "page"],
    enabled=True,
    toolset=[
        "mermaidSetDiagram",
        "mermaidReadDiagram",
        "mermaidListDiagrams",
        "mermaidValidate",
        "mermaidRenderSvg",
        "mermaidListDiagramTypes",
    ],
    icon="@primer/octicons-react:workflow",
    emoji="🧜",
)

PAGE_REACT_FLOW_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-react-flow",
    version="0.0.1",
    name="React Flow in the page",
    description="Build and edit a node-and-link diagram in the page with stable shape IDs shared with the person — list the current canvas, insert and move shapes, and link them.",
    tags=["frontend", "react-flow", "diagrams", "page"],
    enabled=True,
    toolset=[
        "reactFlowListShapes",
        "reactFlowInsertShape",
        "reactFlowLinkShapes",
        "reactFlowMoveShape",
    ],
    icon="@primer/octicons-react:workflow",
    emoji="🔀",
)

PAGE_SHEET_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="page-sheet",
    version="0.0.1",
    name="Sheet in the page",
    description="Fill a spreadsheet in the conversation — a sheet with named columns, rows and ranges, formulas, number and currency formats, a frozen header, tabs, a chart — shown to the person as it is built, editable and exported as CSV.",
    tags=["frontend", "cells", "spreadsheets", "page"],
    enabled=True,
    toolset=[
        "sheetCreate",
        "sheetWriteRange",
        "sheetReadRange",
        "sheetFormatRange",
        "sheetFreeze",
        "sheetAddTab",
        "sheetShowTab",
        "sheetInsertChart",
    ],
    icon="@primer/octicons-react:table",
    emoji="📑",
)

PUBLIC_LIBRARY_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="public-library",
    version="0.0.1",
    name="Public Library",
    description="Search and browse Datalayer's public Library, and publish an existing item owned by the signed-in person after the page asks them to confirm.",
    tags=["frontend", "library", "search", "publish"],
    enabled=True,
    toolset=["publicLibrarySearch", "publicLibraryList", "publicLibraryPublishItem"],
    icon="@primer/octicons-react:book",
    emoji="📚",
)

SIDE_PANELS_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="side-panels",
    version="0.0.1",
    name="Side panels",
    description="Open and close the chat's left and right panels, selecting a named component tab when several UIs are placed there — run in the page, changing nothing else.",
    tags=["frontend", "page", "panels"],
    enabled=True,
    toolset=["sidePanelOpen", "sidePanelClose"],
    icon="@primer/octicons-react:sidebar-expand",
    emoji="🗂️",
)

SPACES_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="spaces",
    version="0.0.1",
    name="Datalayer Spaces",
    description="List the person's Datalayer Spaces and their documents and notebooks, open an item in a tab of the Spaces side panel and save it back to its space — run in the page with the person's own sign-in.",
    tags=["frontend", "page", "spaces", "document", "notebook"],
    enabled=True,
    toolset=[
        "spacesList",
        "spacesListItems",
        "spacesListItemsOfType",
        "spacesOpenItem",
        "spacesSaveItem",
    ],
    icon="@primer/octicons-react:repo",
    emoji="🗃️",
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
    "page-document": PAGE_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1,
    "page-excalidraw": PAGE_EXCALIDRAW_FRONTEND_TOOL_SPEC_0_0_1,
    "page-mermaid": PAGE_MERMAID_FRONTEND_TOOL_SPEC_0_0_1,
    "page-react-flow": PAGE_REACT_FLOW_FRONTEND_TOOL_SPEC_0_0_1,
    "page-sheet": PAGE_SHEET_FRONTEND_TOOL_SPEC_0_0_1,
    "public-library": PUBLIC_LIBRARY_FRONTEND_TOOL_SPEC_0_0_1,
    "side-panels": SIDE_PANELS_FRONTEND_TOOL_SPEC_0_0_1,
    "spaces": SPACES_FRONTEND_TOOL_SPEC_0_0_1,
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
