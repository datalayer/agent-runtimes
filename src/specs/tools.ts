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

export interface ToolRuntimeSpec {
  language: 'python' | 'typescript';
  package: string;
  method: string;
}

export interface ToolSpec {
  id: string;
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  approval: 'auto' | 'manual';
  runtime: ToolRuntimeSpec;
  icon?: string;
  emoji?: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const RUNTIME_ECHO_TOOL_SPEC: ToolSpec = {
  id: 'runtime-echo',
  name: 'Runtime Echo',
  description: 'Echo text back to the caller for quick runtime verification.',
  tags: ['runtime', 'utility'],
  enabled: true,
  approval: 'auto',
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools',
    method: 'runtime_echo',
  },
  icon: 'comment',
  emoji: '💬',
};

export const RUNTIME_SEND_MAIL_TOOL_SPEC: ToolSpec = {
  id: 'runtime-send-mail',
  name: 'Runtime Send Mail (Fake)',
  description:
    'Fake mail sender for tool approval demos; returns a simulated send receipt.',
  tags: ['runtime', 'approval', 'mail'],
  enabled: true,
  approval: 'manual',
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools',
    method: 'runtime_send_mail',
  },
  icon: 'mail',
  emoji: '📧',
};

export const RUNTIME_SENSITIVE_ECHO_TOOL_SPEC: ToolSpec = {
  id: 'runtime-sensitive-echo',
  name: 'Runtime Sensitive Echo',
  description: 'Echo text with a manual approval checkpoint before execution.',
  tags: ['runtime', 'approval'],
  enabled: true,
  approval: 'manual',
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
  'runtime-echo': RUNTIME_ECHO_TOOL_SPEC,
  'runtime-send-mail': RUNTIME_SEND_MAIL_TOOL_SPEC,
  'runtime-sensitive-echo': RUNTIME_SENSITIVE_ECHO_TOOL_SPEC,
};

export function getToolSpecs(): ToolSpec[] {
  return Object.values(TOOL_CATALOG);
}

export function getToolSpec(toolId: string): ToolSpec | undefined {
  return TOOL_CATALOG[toolId];
}
