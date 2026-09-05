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

export const CREATE_PLAN_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'create-plan',
  version: '0.0.1',
  name: 'Create Plan',
  description:
    'Create a plan with multiple steps and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'create_plan',
  },
  icon: 'list-unordered',
  emoji: '📋',
};

export const CURRENT_TIME_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'current-time',
  version: '0.0.1',
  name: 'Current Time',
  description: 'Return the current time in ISO format for a given timezone.',
  tags: ['example', 'ag-ui', 'time'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'current_time',
  },
  icon: 'clock',
  emoji: '🕒',
};

export const DECKS_CREATE_DECK_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-create-deck',
  version: '0.0.1',
  name: 'Create a deck',
  description:
    'Create a deck from a complete specification under a short slug, optionally in a collection.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_create_deck',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_DELETE_DECK_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-delete-deck',
  version: '0.0.1',
  name: 'Delete a deck',
  description: 'Delete a deck by id. Irreversible: asks a person first.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'manual',
  timeout: undefined,
  requiresApproval: true,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_delete_deck',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_DELETE_SLIDE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-delete-slide',
  version: '0.0.1',
  name: 'Delete a slide',
  description: 'Remove one slide of a deck, by its 1-based number.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_delete_slide',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_GET_DECK_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-get-deck',
  version: '0.0.1',
  name: 'Get a deck',
  description:
    'One deck by id: its full specification and an outline of its slides (number, type, title).',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_get_deck',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_INSERT_SLIDE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-insert-slide',
  version: '0.0.1',
  name: 'Insert a slide',
  description:
    'Insert a slide into a deck before the given 1-based position, or at the end.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_insert_slide',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_LIST_DECKS_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-list-decks',
  version: '0.0.1',
  name: 'List decks',
  description:
    'Every deck the decks server holds: id, collection, slug, title, subtitle and slide count.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_list_decks',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_UPDATE_DECK_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-update-deck',
  version: '0.0.1',
  name: 'Replace a deck',
  description:
    "Replace a deck's whole record — collection, slug and specification — by id.",
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_update_deck',
  },
  icon: 'project',
  emoji: '📊',
};

export const DECKS_UPDATE_SLIDE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'decks-update-slide',
  version: '0.0.1',
  name: 'Replace one slide',
  description:
    'Replace one slide of a deck, by its 1-based number, leaving the rest as they are.',
  tags: ['decks', 'backend'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decks',
    method: 'decks_update_slide',
  },
  icon: 'project',
  emoji: '📊',
};

export const DISPLAY_RECIPE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'display-recipe',
  version: '0.0.1',
  name: 'Display Recipe',
  description:
    'Update the shared recipe state and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'shared-state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'display_recipe',
  },
  icon: 'book',
  emoji: '🍳',
};

export const EXAMPLE_CREATE_PLAN_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-create-plan',
  version: '0.0.1',
  name: 'Create Plan',
  description:
    'Create a plan with multiple steps and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'create_plan',
  },
  icon: 'list-unordered',
  emoji: '📋',
};

export const EXAMPLE_CURRENT_TIME_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-current-time',
  version: '0.0.1',
  name: 'Current Time',
  description: 'Return the current time in ISO format for a given timezone.',
  tags: ['example', 'ag-ui', 'time'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'current_time',
  },
  icon: 'clock',
  emoji: '🕒',
};

export const EXAMPLE_DISPLAY_RECIPE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-display-recipe',
  version: '0.0.1',
  name: 'Display Recipe',
  description:
    'Update the shared recipe state and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'shared-state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'display_recipe',
  },
  icon: 'book',
  emoji: '🍳',
};

export const EXAMPLE_GENERATE_HAIKU_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-generate-haiku',
  version: '0.0.1',
  name: 'Generate Haiku',
  description:
    'Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.',
  tags: ['example', 'ag-ui', 'generative-ui'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'generate_haiku',
  },
  icon: 'pencil',
  emoji: '🖋️',
};

export const EXAMPLE_GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-generate-task-steps',
  version: '0.0.1',
  name: 'Generate Task Steps',
  description:
    'Generate task steps for human review and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'human-in-the-loop'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'generate_task_steps',
  },
  icon: 'tasklist',
  emoji: '🧑‍⚖️',
};

export const EXAMPLE_GET_WEATHER_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-get-weather',
  version: '0.0.1',
  name: 'Get Weather',
  description:
    'Fetch current weather for a location from the Open-Meteo API for frontend rendering.',
  tags: ['example', 'ag-ui', 'weather'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'get_weather',
  },
  icon: 'sun',
  emoji: '🌤️',
};

export const EXAMPLE_RENDER_A2UI_SURFACE_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-render-a2ui-surface',
  version: '0.0.1',
  name: 'Render A2UI Surface',
  description:
    'Turn a declarative field spec into a validated A2UI v0.9 surface rendered live by the frontend as an interactive form/card.',
  tags: ['example', 'ag-ui', 'a2ui', 'generative-ui'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.a2ui',
    method: 'render_a2ui_surface',
  },
  icon: 'browser',
  emoji: '🎛️',
};

export const EXAMPLE_UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'example-update-plan-step',
  version: '0.0.1',
  name: 'Update Plan Step',
  description:
    'Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).',
  tags: ['example', 'ag-ui', 'state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'update_plan_step',
  },
  icon: 'checklist',
  emoji: '✅',
};

export const GENERATE_HAIKU_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'generate-haiku',
  version: '0.0.1',
  name: 'Generate Haiku',
  description:
    'Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.',
  tags: ['example', 'ag-ui', 'generative-ui'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'generate_haiku',
  },
  icon: 'pencil',
  emoji: '🖋️',
};

export const GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'generate-task-steps',
  version: '0.0.1',
  name: 'Generate Task Steps',
  description:
    'Generate task steps for human review and emit an AG-UI state snapshot.',
  tags: ['example', 'ag-ui', 'human-in-the-loop'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'generate_task_steps',
  },
  icon: 'tasklist',
  emoji: '🧑‍⚖️',
};

export const GET_WEATHER_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'get-weather',
  version: '0.0.1',
  name: 'Get Weather',
  description:
    'Fetch current weather for a location from the Open-Meteo API for frontend rendering.',
  tags: ['example', 'ag-ui', 'weather'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'get_weather',
  },
  icon: 'sun',
  emoji: '🌤️',
};

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

export const UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1: ToolSpec = {
  id: 'update-plan-step',
  version: '0.0.1',
  name: 'Update Plan Step',
  description:
    'Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).',
  tags: ['example', 'ag-ui', 'state'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.examples.tools.ag_ui',
    method: 'update_plan_step',
  },
  icon: 'checklist',
  emoji: '✅',
};

// ============================================================================
// Tool Catalog
// ============================================================================

export const TOOL_CATALOG: Record<string, ToolSpec> = {
  'create-plan': CREATE_PLAN_TOOL_SPEC_0_0_1,
  'current-time': CURRENT_TIME_TOOL_SPEC_0_0_1,
  'decks-create-deck': DECKS_CREATE_DECK_TOOL_SPEC_0_0_1,
  'decks-delete-deck': DECKS_DELETE_DECK_TOOL_SPEC_0_0_1,
  'decks-delete-slide': DECKS_DELETE_SLIDE_TOOL_SPEC_0_0_1,
  'decks-get-deck': DECKS_GET_DECK_TOOL_SPEC_0_0_1,
  'decks-insert-slide': DECKS_INSERT_SLIDE_TOOL_SPEC_0_0_1,
  'decks-list-decks': DECKS_LIST_DECKS_TOOL_SPEC_0_0_1,
  'decks-update-deck': DECKS_UPDATE_DECK_TOOL_SPEC_0_0_1,
  'decks-update-slide': DECKS_UPDATE_SLIDE_TOOL_SPEC_0_0_1,
  'display-recipe': DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
  'example-create-plan': EXAMPLE_CREATE_PLAN_TOOL_SPEC_0_0_1,
  'example-current-time': EXAMPLE_CURRENT_TIME_TOOL_SPEC_0_0_1,
  'example-display-recipe': EXAMPLE_DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
  'example-generate-haiku': EXAMPLE_GENERATE_HAIKU_TOOL_SPEC_0_0_1,
  'example-generate-task-steps': EXAMPLE_GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1,
  'example-get-weather': EXAMPLE_GET_WEATHER_TOOL_SPEC_0_0_1,
  'example-render-a2ui-surface': EXAMPLE_RENDER_A2UI_SURFACE_TOOL_SPEC_0_0_1,
  'example-update-plan-step': EXAMPLE_UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1,
  'generate-haiku': GENERATE_HAIKU_TOOL_SPEC_0_0_1,
  'generate-task-steps': GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1,
  'get-weather': GET_WEATHER_TOOL_SPEC_0_0_1,
  'runtime-echo': RUNTIME_ECHO_TOOL_SPEC_0_0_1,
  'runtime-send-mail': RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1,
  'runtime-sensitive-echo': RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1,
  'update-plan-step': UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1,
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
