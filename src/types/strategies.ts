/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How the human participates in (or around) an agent reasoning strategy.
 */
export interface StrategyHuman {
  /** Human interaction pattern: none, initiate, approve, feedback, or tool */
  mode: string;
  /** Whether the strategy pauses for human approval before sensitive actions */
  approvalRequired: boolean;
  /** Actions that require explicit human approval */
  approvalFor: string[];
  /** Description of the human-in-the-loop behaviour */
  description: string;
}

/**
 * When and how an agent reasoning strategy stops iterating.
 */
export interface StrategyTermination {
  /** Maximum iterations before the strategy is stopped */
  maxIterations: number;
  /** Conditions that mark the goal as reached */
  successCriteria: string[];
  /** Conditions that mark the strategy as failed */
  failureCriteria: string[];
  /** What to do when blocked: ask-human, retry, or abort */
  onBlocked: string;
}

/**
 * Specification for an agent reasoning strategy (a control loop).
 *
 * A framework-agnostic description of how an agent progresses from one
 * decision to the next: the control cycle (observe/think/act/evaluate), the
 * objective, constraints, where state lives, human participation, and the
 * termination policy.
 */
export interface StrategySpec {
  /** Unique strategy identifier (e.g., 'data-analysis') */
  id: string;
  /** Version */
  version: string;
  /** Display name for the strategy */
  name: string;
  /** Strategy description */
  description: string;
  /** Default goal/objective the strategy works toward */
  objective: string;
  /** Strategy family */
  strategy: string;
  /** Ordered phase names that make up one iteration */
  phases: string[];
  /** Boundaries the agent must respect */
  constraints: string[];
  /** Termination policy */
  termination?: StrategyTermination;
  /** Human-in-the-loop participation settings */
  human?: StrategyHuman;
  /** Where strategy state lives between iterations */
  stateBackends: string[];
  /** Categorization tags */
  tags: string[];
  /** Icon identifier */
  icon: string;
  /** Emoji representation */
  emoji: string;
}
