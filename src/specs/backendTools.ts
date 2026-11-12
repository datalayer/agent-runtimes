/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Backend Tool Catalog
 *
 * Predefined runtime tools that can be attached to agents.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { BackendToolSpec } from '../types';

// ============================================================================
// Backend Tool Definitions
// ============================================================================

export const AWS_COMPUTE_OPTIMIZER_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'aws-compute-optimizer',
  version: '0.0.1',
  name: 'AWS Compute Optimizer',
  description:
    "Read AWS Compute Optimizer's findings for EC2 instances, Auto Scaling groups, EBS volumes, Lambda functions, ECS services on Fargate, RDS databases or idle resources in a region — over- and under-provisioned, with the utilization they were judged on and the savings of each option — with the read role; answered as evidence.",
  tags: ['aws', 'cost', 'steward'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.aws_account',
    method: 'aws_compute_optimizer',
  },
  icon: '@primer/octicons-react:cpu',
  emoji: '📏',
};

export const AWS_COST_EXPLORER_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'aws-cost-explorer',
  version: '0.0.1',
  name: 'AWS Cost Explorer',
  description:
    "Read the account's spend from AWS Cost Explorer — by service, account, region, usage type or tag — its Savings Plans and Reserved Instance coverage and utilization, AWS's Savings Plans purchase recommendation and Cost Anomaly Detection's anomalies, with the read role; answered as evidence.",
  tags: ['aws', 'cost', 'steward'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.aws_account',
    method: 'aws_cost_explorer',
  },
  icon: '@primer/octicons-react:credit-card',
  emoji: '📊',
};

export const AWS_COST_OPTIMIZATION_HUB_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec =
  {
    id: 'aws-cost-optimization-hub',
    version: '0.0.1',
    name: 'AWS Cost Optimization Hub',
    description:
      "Read AWS Cost Optimization Hub's cost recommendations for the account — rightsize, stop, delete, Savings Plans and Reserved Instances, Graviton — each with AWS's estimated monthly saving, highest first, with the read role; answered as evidence (source, call, read time, items).",
    tags: ['aws', 'cost', 'steward'],
    enabled: true,
    approval: 'auto',
    timeout: undefined,
    requiresApproval: false,
    runtime: {
      language: 'python',
      package: 'agent_runtimes.tools.aws_account',
      method: 'aws_cost_optimization_hub',
    },
    icon: '@primer/octicons-react:graph',
    emoji: '💰',
  };

export const CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:list-unordered',
  emoji: '📋',
};

export const CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:clock',
  emoji: '🕒',
};

export const DECIDE_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'decide',
  version: '0.0.1',
  name: 'Decide',
  description:
    "Ask the agent's decision model typed questions about a text — noul (does a statement hold, with its probability), choice (one of named options) or score (a step on a rubric) — and get the typed answers back, through datalayer-ai-inference. An agent has it when its spec names decisions.",
  tags: ['runtime', 'decisions', 'jev'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.decisions',
    method: 'decide',
  },
  icon: '@primer/octicons-react:law',
  emoji: '⚖️',
};

export const DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:book',
  emoji: '🍳',
};

export const EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:list-unordered',
  emoji: '📋',
};

export const EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:clock',
  emoji: '🕒',
};

export const EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:book',
  emoji: '🍳',
};

export const EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:pencil',
  emoji: '🖋️',
};

export const EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec =
  {
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
    icon: '@primer/octicons-react:tasklist',
    emoji: '🙋',
  };

export const EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:sun',
  emoji: '🌤️',
};

export const EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec =
  {
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
    icon: '@primer/octicons-react:browser',
    emoji: '🎛️',
  };

export const EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec =
  {
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
    icon: '@primer/octicons-react:checklist',
    emoji: '✅',
  };

export const GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:pencil',
  emoji: '🖋️',
};

export const GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:tasklist',
  emoji: '🙋',
};

export const GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:sun',
  emoji: '🌤️',
};

export const GITHUB_REPOSITORIES_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'github-repositories',
  version: '0.0.1',
  name: 'GitHub Repositories',
  description:
    "List the GitHub repositories of the person the agent works for, with the person's own GitHub grant; the first time, the person is asked to connect GitHub in the chat.",
  tags: ['github', 'identity'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.github',
    method: 'github_repositories',
  },
  icon: '@primer/octicons-react:mark-github',
  emoji: '🐙',
};

export const LIST_RECOMMENDATIONS_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'list-recommendations',
  version: '0.0.1',
  name: 'List Recommendations',
  description:
    'List the recommendations recorded in this session, highest estimated saving first, by kind (cost or fix) and state, with the sum of their estimated monthly savings.',
  tags: ['recommendations', 'steward'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.recommendations',
    method: 'list_recommendations',
  },
  icon: '@primer/octicons-react:list-ordered',
  emoji: '📋',
};

export const RECOMMENDATIONS_REPORT_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'recommendations-report',
  version: '0.0.1',
  name: 'Recommendations Report',
  description:
    "Report the deployment's recommendations of the last days — how many were approved, dismissed and are still open, the estimated monthly savings of each and the largest open ones — read from its record, write it as a document in the Space the application may write, and send it through the application's notification channels with the document's link.",
  tags: ['recommendations', 'steward'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.recommendations',
    method: 'recommendations_report',
  },
  icon: '@primer/octicons-react:graph',
  emoji: '📈',
};

export const RECORD_RECOMMENDATION_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
  id: 'record-recommendation',
  version: '0.0.1',
  name: 'Record Recommendation',
  description:
    "Record one recommendation — a cost saving or a technical fix — with the evidence it rests on (each read's source, call, time and values), its estimate and how it was computed, its confidence and its fix as a reviewable change with its rollback; refused when any of them is missing.",
  tags: ['recommendations', 'steward'],
  enabled: true,
  approval: 'auto',
  timeout: undefined,
  requiresApproval: false,
  runtime: {
    language: 'python',
    package: 'agent_runtimes.tools.recommendations',
    method: 'record_recommendation',
  },
  icon: '@primer/octicons-react:light-bulb',
  emoji: '💡',
};

export const RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:comment',
  emoji: '💬',
};

export const RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:mail',
  emoji: '📧',
};

export const RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:shield',
  emoji: '🛡️',
};

export const UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1: BackendToolSpec = {
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
  icon: '@primer/octicons-react:checklist',
  emoji: '✅',
};

// ============================================================================
// Backend Tool Catalog
// ============================================================================

export const BACKEND_TOOL_CATALOG: Record<string, BackendToolSpec> = {
  'aws-compute-optimizer': AWS_COMPUTE_OPTIMIZER_BACKEND_TOOL_SPEC_0_0_1,
  'aws-cost-explorer': AWS_COST_EXPLORER_BACKEND_TOOL_SPEC_0_0_1,
  'aws-cost-optimization-hub':
    AWS_COST_OPTIMIZATION_HUB_BACKEND_TOOL_SPEC_0_0_1,
  'create-plan': CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
  'current-time': CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
  decide: DECIDE_BACKEND_TOOL_SPEC_0_0_1,
  'display-recipe': DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
  'example-create-plan': EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
  'example-current-time': EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
  'example-display-recipe': EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
  'example-generate-haiku': EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
  'example-generate-task-steps':
    EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
  'example-get-weather': EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
  'example-render-a2ui-surface':
    EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1,
  'example-update-plan-step': EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
  'generate-haiku': GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
  'generate-task-steps': GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
  'get-weather': GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
  'github-repositories': GITHUB_REPOSITORIES_BACKEND_TOOL_SPEC_0_0_1,
  'list-recommendations': LIST_RECOMMENDATIONS_BACKEND_TOOL_SPEC_0_0_1,
  'recommendations-report': RECOMMENDATIONS_REPORT_BACKEND_TOOL_SPEC_0_0_1,
  'record-recommendation': RECORD_RECOMMENDATION_BACKEND_TOOL_SPEC_0_0_1,
  'runtime-echo': RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1,
  'runtime-send-mail': RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1,
  'runtime-sensitive-echo': RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1,
  'update-plan-step': UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
};

export function getBackendToolSpecs(): BackendToolSpec[] {
  return Object.values(BACKEND_TOOL_CATALOG);
}

function resolveBackendToolId(toolId: string): string {
  if (toolId in BACKEND_TOOL_CATALOG) return toolId;
  const idx = toolId.lastIndexOf(':');
  if (idx > 0) {
    const base = toolId.slice(0, idx);
    if (base in BACKEND_TOOL_CATALOG) return base;
  }
  return toolId;
}

export function getBackendToolSpec(
  toolId: string,
): BackendToolSpec | undefined {
  return BACKEND_TOOL_CATALOG[resolveBackendToolId(toolId)];
}
