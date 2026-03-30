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

JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="jupyter-notebook",
    version="0.0.1",
    name="Jupyter Notebook",
    description="Frontend tools for interacting with Jupyter notebooks.",
    tags=["frontend", "notebook", "jupyter"],
    enabled=True,
    toolset="all",
    icon="notebook",
    emoji="📓",
)

LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1 = FrontendToolSpec(
    id="lexical-document",
    version="0.0.1",
    name="Lexical Document",
    description="Frontend tools for interacting with Lexical documents.",
    tags=["frontend", "document", "lexical"],
    enabled=True,
    toolset="all",
    icon="file",
    emoji="📄",
)

# ============================================================================
# Frontend Tool Catalog
# ============================================================================

FRONTEND_TOOL_CATALOG: Dict[str, FrontendToolSpec] = {
    "jupyter-notebook": JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1,
    "lexical-document": LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1,
}


def get_frontend_tool_spec(tool_id: str) -> FrontendToolSpec | None:
    """Get a frontend tool specification by ID (accepts both bare and versioned refs)."""
    spec = FRONTEND_TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(':')
    if base and '.' in ver:
        return FRONTEND_TOOL_CATALOG.get(base)
    return None


def list_frontend_tool_specs() -> List[FrontendToolSpec]:
    """List all frontend tool specifications."""
    return list(FRONTEND_TOOL_CATALOG.values())
