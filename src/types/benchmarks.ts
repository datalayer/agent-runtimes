/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Evaluation benchmark specification.
 */
export interface BenchmarkSpec {
  /** Unique benchmark identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the benchmark */
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
  /** Dataset source mode used by this benchmark */
  dataset_source?: 'hosted' | 'local' | 'hybrid';
  /** Whether this benchmark can be tracked in live monitoring */
  supports_live_monitoring?: boolean;
  /** Whether this benchmark supports side-by-side run comparison */
  supports_experiment_comparison?: boolean;
  /** Shapes emitted by evaluators (pass_rate, numeric, categorical, error_only) */
  evaluator_shapes?: Array<
    'pass_rate' | 'numeric' | 'categorical' | 'error_only'
  >;
  /** Suggested time windows for monitoring UIs */
  recommended_windows?: string[];
  /** Whether traces include links from results to execution spans */
  trace_integration?: boolean;
  /** Whether cases are editable in hosted UI */
  dataset_editability?: 'read-only' | 'editable';
  /** SDK maturity level for this benchmark */
  sdk_support?: 'none' | 'experimental' | 'stable';
}
