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
