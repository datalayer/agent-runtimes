/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How the human participates in (or around) an agent execution loop.
 */
export interface LoopHuman {
  /** Human interaction pattern: none, initiate, approve, feedback, or tool */
  mode: string;
  /** Whether the loop pauses for human approval before sensitive actions */
  approvalRequired: boolean;
  /** Actions that require explicit human approval */
  approvalFor: string[];
  /** Description of the human-in-the-loop behaviour */
  description: string;
}

/**
 * When and how an agent execution loop stops iterating.
 */
export interface LoopTermination {
  /** Maximum iterations before the loop is stopped */
  maxIterations: number;
  /** Conditions that mark the goal as reached */
  successCriteria: string[];
  /** Conditions that mark the loop as failed */
  failureCriteria: string[];
  /** What to do when blocked: ask-human, retry, or abort */
  onBlocked: string;
}

/**
 * Specification for an agent execution loop.
 *
 * A framework-agnostic description of how an agent progresses from one
 * decision to the next: the control cycle (observe/think/act/evaluate), the
 * objective, constraints, where state lives, human participation, and the
 * termination policy.
 */
export interface LoopSpec {
  /** Unique loop identifier (e.g., 'data-analysis') */
  id: string;
  /** Version */
  version: string;
  /** Display name for the loop */
  name: string;
  /** Loop description */
  description: string;
  /** Default goal/objective the loop works toward */
  objective: string;
  /** Loop strategy family */
  strategy: string;
  /** Ordered phase names that make up one iteration */
  phases: string[];
  /** Boundaries the agent must respect */
  constraints: string[];
  /** Termination policy */
  termination?: LoopTermination;
  /** Human-in-the-loop participation settings */
  human?: LoopHuman;
  /** Where loop state lives between iterations */
  stateBackends: string[];
  /** Categorization tags */
  tags: string[];
  /** Icon identifier */
  icon: string;
  /** Emoji representation */
  emoji: string;
}
