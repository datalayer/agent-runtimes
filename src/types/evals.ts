/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Evaluation benchmark specification.
 */
export interface EvalSpec {
  /** Unique eval identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the evaluation */
  description: string;
  /** Category: Coding, Knowledge, Reasoning, Agentic, or Safety */
  category: 'Coding' | 'Knowledge' | 'Reasoning' | 'Agentic' | 'Safety';
  /** Number of tasks in the benchmark */
  task_count: number;
  /** Primary metric (e.g., 'pass@1', 'accuracy', 'success_rate') */
  metric: string;
  /** Source URL or repository */
  source: string;
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  /** Relevant languages */
  languages: string[];
}

/**
 * Eval configuration for an agent spec.
 */
export interface AgentEvalConfig {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  task_count?: number;
  metric?: string;
  source?: string;
  difficulty?: string;
  languages?: string[];
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
