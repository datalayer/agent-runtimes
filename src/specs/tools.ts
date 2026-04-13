/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool Catalog
 *
 * Predefined runtime tools that can be attached to agents.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ToolSpec } from '../types';

// ============================================================================
// Tool Definitions
// ============================================================================

export const RUNTIME_ECHO_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'runtime-echo',
  version: '0.0.1',
  name: 'Runtime Echo',
  description: 'Echo text back to the caller for quick runtime verification.',
  tags: ['runtime', 'utility'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools',
    method: 'runtime_echo',
  },
  icon: 'comment',
  emoji: '💬',
};

export const RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'runtime-send-mail',
  version: '0.0.1',
  name: 'Runtime Send Mail (Fake)',
  description:
    'Fake mail sender for tool approval demos; returns a simulated send receipt.',
  tags: ['runtime', 'approval', 'mail'],
  enabled: true,
  approval: 'manual',
  timeout: undefined,
  requiresApproval: true,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools',
    method: 'runtime_send_mail',
  },
  icon: 'mail',
  emoji: '📧',
};

export const RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'runtime-sensitive-echo',
  version: '0.0.1',
  name: 'Runtime Sensitive Echo',
  description: 'Echo text with a manual approval checkpoint before execution.',
  tags: ['runtime', 'approval'],
  enabled: true,
  approval: 'manual',
  timeout: undefined,
  requiresApproval: true,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools',
    method: 'runtime_sensitive_echo',
  },
  icon: 'shield',
  emoji: '🛡️',
};

// ============================================================================
// Tool Catalog
// ============================================================================

export const TOOL_CATALOG: Record<string, ToolSpec> = {
  'runtime-echo': RUNTIME_ECHO_TOOL_SPEC_0_0_1,
  'runtime-send-mail': RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1,
  'runtime-sensitive-echo': RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1,
};

export function getToolSpecs(): ToolSpec[] {
  return Object.values(TOOL_CATALOG);
}

function resolveToolId(toolId: string): string {
  if (toolId in TOOL_CATALOG) return toolId;
  const idx = toolId.lastIndexOf(':');
  if (idx > 0) {
    const base = toolId.slice(0, idx);
    if (base in TOOL_CATALOG) return base;
  }
  return toolId;
}

export function getToolSpec(toolId: string): ToolSpec | undefined {
  return TOOL_CATALOG[resolveToolId(toolId)];
}
