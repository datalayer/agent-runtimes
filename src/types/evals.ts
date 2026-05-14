/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Built-in evaluator specification.
 */
export interface EvalSpec {
  /** Unique eval identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the evaluator */
  description: string;
  /** Evaluator family */
  category:
    | 'Comparison'
    | 'Type Validation'
    | 'Performance'
    | 'LLM-as-a-Judge'
    | 'Span-Based'
    | 'Report';
  /** Case-level or report-level evaluator */
  evaluator_type: 'case' | 'report';
  /** Pydantic evaluator class name */
  pydantic_class: string;
  /** Primary output shape */
  output_kind:
    | 'boolean'
    | 'boolean_with_reason'
    | 'score'
    | 'score_and_assertion'
    | 'report_table'
    | 'report_curve';
  /** Cost tier for running this evaluator */
  cost_tier: 'free' | 'llm';
  /** Expected latency profile */
  latency: 'instant' | 'fast' | 'slow';
  /** Runtime requirements (e.g. expected_output, logfire, model) */
  requires?: string[];
  /** Source documentation URL */
  source: string;
  /** Suggested baseline configuration */
  default_config?: Record<string, unknown>;
}

/**
 * Eval configuration for an agent spec.
 */
export interface AgentEvalConfig {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  evaluator_type?: string;
  pydantic_class?: string;
  output_kind?: string;
  cost_tier?: string;
  latency?: string;
  requires?: string[];
  source?: string;
  default_config?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---- Eval Reports ----

export interface EvalReport {
  /** Unique eval run ID */
  evalId: string;
  /** Agent that was evaluated */
  agentId: string;
  /** Total number of test cases */
  totalCases: number;
  /** Number of passing cases */
  passed: number;
  /** Number of failing cases */
  failed: number;
  /** Average score (0-1) if applicable */
  avgScore: number | null;
  /** Total eval duration in milliseconds */
  durationMs: number;
  /** Path or URL to detailed report */
  reportPath: string | null;
}

export interface RunEvalsRequest {
  /** The evals config list from the agentspec */
  evalSpec: Array<Record<string, unknown>>;
  /** Agent system prompt for synthetic case generation */
  agentSystemPrompt?: string;
  /** Tool JSON schemas for grounding */
  toolSchemas?: Array<Record<string, unknown>>;
}
