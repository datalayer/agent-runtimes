/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A type of question a decision model answers. */
export type DecisionQuestionType = 'noul' | 'choice' | 'score';

/**
 * How an agent decides: the model asked typed decisions, the question types
 * it answers, the limits of one call. An agent has the capability when its
 * spec names one (`decisions: jev:0.0.1`).
 */
export interface DecisionsSpec {
  /** Unique decisions identifier (e.g., 'jev') */
  id: string;
  /** Version */
  version: string;
  /** Display name */
  name: string;
  /** What it decides, and with what */
  description: string;
  /** Whether an agent spec is offered these decisions */
  enabled: boolean;
  /** The model the questions are asked of: a typed-decision model of the catalogue */
  model: string;
  /** The question types it answers: noul, choice, score */
  questions: string[];
  /** The most questions one call may ask */
  maxQuestions: number;
  /** The longest text one call may be about, in characters */
  maxTextLength: number;
  /** Tags */
  tags: string[];
  /** Icon identifier */
  icon: string;
  /** Emoji representation */
  emoji: string;
}

/**
 * What a runtime says of an agent that decides (`GET /api/v1/agents/{id}`,
 * `/api/v1/configure?agent_id=`): its decisions spec and the model asked. An
 * agent that does not decide says none.
 */
export interface AgentDecisions {
  /** The decisions spec the agent's spec names, `id:version`. */
  spec: string;
  /** The spec's name. */
  name: string;
  /** The model the questions are asked of, by its id. */
  model: string;
  /** That model's name in the catalogue. */
  modelName: string;
  /** The question types it answers. */
  questions: DecisionQuestionType[];
  /** The most questions one call may ask. */
  maxQuestions: number;
  /** The longest text one call may be about, in characters. */
  maxTextLength: number;
}
