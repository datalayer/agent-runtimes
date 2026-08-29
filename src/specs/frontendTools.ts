/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Frontend Tool Catalog
 *
 * Predefined frontend tool sets that can be attached to agents.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { FrontendToolSpec } from '../types';

// ============================================================================
// Frontend Tool Definitions
// ============================================================================

export const JUPYTER_NOTEBOOK_EDIT_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec =
  {
    id: 'jupyter-notebook-edit',
    version: '0.0.1',
    name: 'Jupyter Notebook (edit)',
    description:
      'Read and edit a notebook, and run cells — but never delete from it.',
    tags: ['frontend', 'notebook', 'edit'],
    enabled: true,
    toolset: [
      'readCell',
      'readAllCells',
      'insertCell',
      'updateCell',
      'runCell',
      'executeCode',
    ],
    icon: 'notebook',
    emoji: '📓',
  };

export const JUPYTER_NOTEBOOK_PROPOSE_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec =
  {
    id: 'jupyter-notebook-propose',
    version: '0.0.1',
    name: 'Jupyter Notebook (propose)',
    description:
      'Read a notebook and propose changes for a person to accept, never applying them.',
    tags: ['frontend', 'notebook', 'propose'],
    enabled: true,
    toolset: ['readCell', 'readAllCells', 'proposeCellUpdate', 'runCell'],
    icon: 'notebook',
    emoji: '📓',
  };

export const JUPYTER_NOTEBOOK_READ_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec =
  {
    id: 'jupyter-notebook-read',
    version: '0.0.1',
    name: 'Jupyter Notebook (read only)',
    description:
      'Read a notebook without changing it — cells, outputs and errors.',
    tags: ['frontend', 'notebook', 'read'],
    enabled: true,
    toolset: ['readCell', 'readAllCells'],
    icon: 'notebook',
    emoji: '📓',
  };

export const JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec = {
  id: 'jupyter-notebook',
  version: '0.0.1',
  name: 'Jupyter Notebook',
  description: 'Frontend tools for interacting with Jupyter notebooks.',
  tags: ['frontend', 'notebook', 'jupyter-server'],
  enabled: true,
  toolset: 'all',
  icon: 'notebook',
  emoji: '📓',
};

export const LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec = {
  id: 'lexical-document',
  version: '0.0.1',
  name: 'Lexical Document',
  description: 'Frontend tools for interacting with Lexical documents.',
  tags: ['frontend', 'document', 'lexical'],
  enabled: true,
  toolset: 'all',
  icon: 'file',
  emoji: '📄',
};

// ============================================================================
// Frontend Tool Catalog
// ============================================================================

export const FRONTEND_TOOL_CATALOG: Record<string, FrontendToolSpec> = {
  'jupyter-notebook-edit': JUPYTER_NOTEBOOK_EDIT_FRONTEND_TOOL_SPEC_0_0_1,
  'jupyter-notebook-propose': JUPYTER_NOTEBOOK_PROPOSE_FRONTEND_TOOL_SPEC_0_0_1,
  'jupyter-notebook-read': JUPYTER_NOTEBOOK_READ_FRONTEND_TOOL_SPEC_0_0_1,
  'jupyter-notebook': JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1,
  'lexical-document': LEXICAL_DOCUMENT_FRONTEND_TOOL_SPEC_0_0_1,
};

export function getFrontendToolSpecs(): FrontendToolSpec[] {
  return Object.values(FRONTEND_TOOL_CATALOG);
}

function resolveFrontendToolId(toolId: string): string {
  if (toolId in FRONTEND_TOOL_CATALOG) return toolId;
  const idx = toolId.lastIndexOf(':');
  if (idx > 0) {
    const base = toolId.slice(0, idx);
    if (base in FRONTEND_TOOL_CATALOG) return base;
  }
  return toolId;
}

export function getFrontendToolSpec(
  toolId: string,
): FrontendToolSpec | undefined {
  return FRONTEND_TOOL_CATALOG[resolveFrontendToolId(toolId)];
}
