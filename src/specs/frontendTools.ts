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

export const JUPYTER_NOTEBOOK_FRONTEND_TOOL_SPEC_0_0_1: FrontendToolSpec = {
  id: 'jupyter-notebook',
  version: '0.0.1',
  name: 'Jupyter Notebook',
  description: 'Frontend tools for interacting with Jupyter notebooks.',
  tags: ['frontend', 'notebook', 'jupyter'],
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
