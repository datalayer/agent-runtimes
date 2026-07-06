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
  'display-recipe': DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
  'example-create-plan': EXAMPLE_CREATE_PLAN_TOOL_SPEC_0_0_1,
  'example-current-time': EXAMPLE_CURRENT_TIME_TOOL_SPEC_0_0_1,
  'example-display-recipe': EXAMPLE_DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
  'example-generate-haiku': EXAMPLE_GENERATE_HAIKU_TOOL_SPEC_0_0_1,
  'example-generate-task-steps': EXAMPLE_GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1,
  'example-get-weather': EXAMPLE_GET_WEATHER_TOOL_SPEC_0_0_1,
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
