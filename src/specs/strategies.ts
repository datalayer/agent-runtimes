/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Strategy Catalog
 *
 * Predefined agent reasoning strategies (control loops).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { StrategySpec } from '../types';

// ============================================================================
// Strategies Enum
// ============================================================================

export const Strategies = {
  DATA_ANALYSIS: 'data-analysis',
  HUMAN_IN_THE_LOOP: 'human-in-the-loop',
  OODA: 'ooda',
  PLAN_EXECUTE_CRITIC: 'plan-execute-critic',
} as const;

export type StrategyId = (typeof Strategies)[keyof typeof Strategies];

// ============================================================================
// Strategy Definitions
// ============================================================================

export const DATA_ANALYSIS_STRATEGY_0_0_1: StrategySpec = {
  id: 'data-analysis',
  version: '0.0.1',
  name: 'Data Analysis Loop',
  description:
    'A generic iterative loop for data analysis. Each iteration the agent observes the current runtime state, decides the next step, executes code in the notebook, and evaluates the result against the objective. Intermediate state (dataframes, charts, tables) is stored outside the model so each LLM call stays small, focused, and inexpensive.',
  objective:
    'Analyze the provided dataset, identify the most important trends and metrics, produce clear visualizations, and summarize actionable findings.',
  strategy: 'observe-think-act-evaluate',
  phases: ['observe', 'think', 'act', 'evaluate'],
  constraints: [
    'Never modify source data files',
    'Prefer reproducible, incremental code cells',
    'Read only the summary of intermediate results, not full datasets',
  ],
  termination: {
    maxIterations: 15,
    successCriteria: [
      'The objective is met and a final summary has been produced',
      'Key metrics and visualizations are available in the notebook',
    ],
    failureCriteria: ['The dataset cannot be loaded after repeated attempts'],
    onBlocked: 'ask-human',
  },
  human: {
    mode: 'initiate',
    approvalRequired: false,
    approvalFor: [],
    description:
      'The human provides the goal and constraints, then observes. The agent runs the loop autonomously and reports the final result.',
  },
  stateBackends: ['notebook', 'runtime', 'filesystem'],
  tags: ['data-analysis', 'analytics', 'generic', 'iterative'],
  icon: 'graph',
  emoji: '📊',
};

export const HUMAN_IN_THE_LOOP_STRATEGY_0_0_1: StrategySpec = {
  id: 'human-in-the-loop',
  version: '0.0.1',
  name: 'Human-in-the-Loop',
  description:
    'A control loop that runs autonomously but stops for explicit human approval before any sensitive or irreversible action. The human sits outside the loop, defining the goal and constraints, and steps in only when the agent needs a decision it is not permitted to make on its own.',
  objective:
    'Complete the task autonomously while requesting human approval before any sensitive or irreversible action.',
  strategy: 'observe-think-act-evaluate',
  phases: ['observe', 'think', 'act', 'evaluate'],
  constraints: [
    'Never perform an approval-gated action without explicit human sign-off',
    'Surface a clear summary of the pending action when requesting approval',
  ],
  termination: {
    maxIterations: 12,
    successCriteria: ['The task is complete and all approvals were obtained'],
    failureCriteria: [
      'The human rejects a required action and no alternative exists',
    ],
    onBlocked: 'ask-human',
  },
  human: {
    mode: 'approve',
    approvalRequired: true,
    approvalFor: [
      'delete-data',
      'send-email',
      'spend-money',
      'deploy-production',
    ],
    description:
      "The loop pauses and waits for human approval before executing any action listed in approval_for, then resumes with the human's decision.",
  },
  stateBackends: ['notebook', 'runtime', 'filesystem'],
  tags: ['human-in-the-loop', 'approval', 'safety', 'generic'],
  icon: 'person',
  emoji: '🙋',
};

export const OODA_STRATEGY_0_0_1: StrategySpec = {
  id: 'ooda',
  version: '0.0.1',
  name: 'OODA Loop',
  description:
    'A generic Observe → Orient → Decide → Act control loop. The agent observes the current state, orients by interpreting it in the context of the goal, decides on the next action, and acts. The loop is well suited to decision-oriented and monitoring tasks over a changing environment.',
  objective:
    'Continuously assess the environment and take the best next action toward the goal until it is reached or a stop condition is met.',
  strategy: 'ooda',
  phases: ['observe', 'orient', 'decide', 'act'],
  constraints: [
    'Re-observe fresh state at the start of every iteration',
    'Keep each decision small and reversible when possible',
  ],
  termination: {
    maxIterations: 20,
    successCriteria: ['The goal condition is satisfied'],
    failureCriteria: ['A hard stop condition or budget limit is reached'],
    onBlocked: 'retry',
  },
  human: {
    mode: 'none',
    approvalRequired: false,
    approvalFor: [],
    description:
      'Fully autonomous loop with no human interaction during execution.',
  },
  stateBackends: ['runtime', 'filesystem', 'sql'],
  tags: ['ooda', 'decision-loop', 'generic', 'monitoring'],
  icon: 'sync',
  emoji: '🔄',
};

export const PLAN_EXECUTE_CRITIC_STRATEGY_0_0_1: StrategySpec = {
  id: 'plan-execute-critic',
  version: '0.0.1',
  name: 'Plan / Execute / Critic Loop',
  description:
    'A control loop with three roles. The planner decomposes the goal into the next concrete step, the executor performs it in the runtime, and the critic evaluates the outcome for gaps or errors. The loop repeats until the critic is satisfied or the iteration budget is exhausted, driving higher-quality, self-corrected results.',
  objective:
    'Produce a high-quality analysis or report that has been reviewed and corrected for logical errors before it is finalized.',
  strategy: 'plan-execute-critic',
  phases: ['plan', 'execute', 'critic'],
  constraints: [
    'The critic must not rewrite results, only identify issues to fix',
    'Each step must build on validated intermediate results',
    'Stop refining once the critic reports no material issues',
  ],
  termination: {
    maxIterations: 8,
    successCriteria: [
      'The critic reports no material issues with the latest result',
      'A final, corrected output has been published',
    ],
    failureCriteria: [
      'The critic reports the goal is not achievable with available data',
    ],
    onBlocked: 'ask-human',
  },
  human: {
    mode: 'feedback',
    approvalRequired: false,
    approvalFor: [],
    description:
      'The human can inject feedback between iterations to steer the planner and critic without restarting the loop from scratch.',
  },
  stateBackends: ['notebook', 'runtime', 'filesystem'],
  tags: ['analysis', 'data-quality', 'self-correction', 'multi-role'],
  icon: 'checklist',
  emoji: '✅',
};

// ============================================================================
// Strategy Catalog
// ============================================================================

export const STRATEGY_CATALOGUE: Record<string, StrategySpec> = {
  'data-analysis': DATA_ANALYSIS_STRATEGY_0_0_1,
  'human-in-the-loop': HUMAN_IN_THE_LOOP_STRATEGY_0_0_1,
  ooda: OODA_STRATEGY_0_0_1,
  'plan-execute-critic': PLAN_EXECUTE_CRITIC_STRATEGY_0_0_1,
};

export const DEFAULT_STRATEGY: StrategyId = Strategies.DATA_ANALYSIS;

function resolveStrategyId(strategyId: string): string {
  if (strategyId in STRATEGY_CATALOGUE) return strategyId;
  const idx = strategyId.lastIndexOf(':');
  if (idx > 0) {
    const base = strategyId.slice(0, idx);
    if (base in STRATEGY_CATALOGUE) return base;
  }
  return strategyId;
}

/**
 * Get a strategy specification by ID.
 */
export function getStrategy(strategyId: string): StrategySpec | undefined {
  return STRATEGY_CATALOGUE[resolveStrategyId(strategyId)];
}

/**
 * Get the default strategy.
 */
export function getDefaultStrategy(): StrategySpec | undefined {
  return STRATEGY_CATALOGUE[DEFAULT_STRATEGY];
}

/**
 * List all available strategies.
 */
export function listStrategies(): StrategySpec[] {
  return Object.values(STRATEGY_CATALOGUE);
}
