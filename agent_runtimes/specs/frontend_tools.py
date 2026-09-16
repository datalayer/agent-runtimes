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

CMS_ASTRO_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="cms-astro",
    version="0.0.1",
    name="Reactor CMS for Astro",
    description="Authenticated browser tools for crawling public blogs and reading, creating, updating, publishing, opening, and refreshing Reactor CMS website pages.",
    tags=["frontend", "cms", "astro", "reactor", "content-authoring"],
    enabled=True,
    toolset=[
        "cms_crawl_blog",
        "cms_crawl_wordpress",
        "cms_create_site_page",
        "cms_list_site_pages",
        "cms_read_site_page",
        "cms_get_current_site_page",
        "cms_update_site_page",
        "cms_publish_site_page",
        "cms_show_site_page",
        "cms_refresh_site_view",
    ],
    icon="file-added",
    emoji="✍️",
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
    icon="notebook",
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
    icon="notebook",
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
    icon="notebook",
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
    icon="notebook",
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
    icon="file",
    emoji="📄",
)

# ============================================================================
# Frontend Tool Catalog
# ============================================================================

FRONTEND_TOOL_CATALOG: Dict[str, FrontendToolSpec] = {
    "cms-astro": CMS_ASTRO_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-edit": JUPYTER_NOTEBOOK_EDIT_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-propose": JUPYTER_NOTEBOOK_PROPOSE_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook-read": JUPYTER_NOTEBOOK_READ_FRONTEND_TOOL_SPEC_0_0_1,
    "jupyter-notebook": JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1,
    "lexical-document": LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1,
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
