/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Eval Catalog
 *
 * Predefined built-in evaluator configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { EvalSpec } from '../types';

// ============================================================================
// Eval Definitions
// ============================================================================

export const CONFUSION_MATRIX_EVALUATOR_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'confusion-matrix-evaluator',
  version: '0.0.1',
  name: 'Confusion Matrix Evaluator',
  description:
    'Aggregate evaluator for precision/recall style confusion-matrix reporting.',
  category: 'Report',
  evaluator_type: 'report',
  pydantic_class: 'ConfusionMatrixEvaluator',
  output_kind: 'report_table',
  cost_tier: 'free',
  latency: 'fast',
  requires: ['expected_output'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const CONTAINS_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'contains',
  version: '0.0.1',
  name: 'Contains',
  description: 'Assert that expected content appears in the model output.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'ContainsEvaluator',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['expected_output'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const EQUALS_EXPECTED_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'equals-expected',
  version: '0.0.1',
  name: 'Equals Expected',
  description:
    'Compare model output against an expected value with strict matching.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'EqualsExpectedEvaluator',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['expected_output'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const EQUALS_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'equals',
  version: '0.0.1',
  name: 'Equals',
  description: 'Assert exact equality between expected and actual values.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'EqualsEvaluator',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['expected_output'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'has-matching-span',
  version: '0.0.1',
  name: 'Has Matching Span',
  description:
    'Validate expected spans in structured traces and tool-call transcripts.',
  category: 'Span-Based',
  evaluator_type: 'case',
  pydantic_class: 'HasMatchingSpanEvaluator',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'fast',
  requires: ['trace'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const IS_INSTANCE_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'is-instance',
  version: '0.0.1',
  name: 'Is Instance',
  description:
    'Validate output type against an expected Python/JSON schema type.',
  category: 'Type Validation',
  evaluator_type: 'case',
  pydantic_class: 'IsInstanceEvaluator',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['expected_type'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

export const LLM_JUDGE_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'llm-judge',
  version: '0.0.1',
  name: 'LLM Judge',
  description:
    'Use an LLM-as-a-judge prompt to score quality and provide rationale.',
  category: 'LLM-as-a-Judge',
  evaluator_type: 'case',
  pydantic_class: 'LLMJudgeEvaluator',
  output_kind: 'score_and_assertion',
  cost_tier: 'llm',
  latency: 'slow',
  requires: ['model'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: { threshold: 0.7 },
};

export const MAX_DURATION_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'max-duration',
  version: '0.0.1',
  name: 'Max Duration',
  description:
    'Assert response latency remains below a configured duration threshold.',
  category: 'Performance',
  evaluator_type: 'case',
  pydantic_class: 'MaxDurationEvaluator',
  output_kind: 'boolean_with_reason',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['duration_ms'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: { max_duration_ms: 5000 },
};

export const PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'precision-recall-evaluator',
  version: '0.0.1',
  name: 'Precision Recall Evaluator',
  description:
    'Aggregate evaluator for precision, recall, and pass-rate style benchmark reporting.',
  category: 'Report',
  evaluator_type: 'report',
  pydantic_class: 'PrecisionRecallEvaluator',
  output_kind: 'report_curve',
  cost_tier: 'free',
  latency: 'fast',
  requires: ['expected_output'],
  source: 'https://ai.pydantic.dev/evals/',
  default_config: {},
};

// ============================================================================
// Eval Catalog
// ============================================================================

export const EVAL_CATALOG: Record<string, EvalSpec> = {
  'confusion-matrix-evaluator': CONFUSION_MATRIX_EVALUATOR_EVAL_SPEC_0_0_1,
  contains: CONTAINS_EVAL_SPEC_0_0_1,
  'equals-expected': EQUALS_EXPECTED_EVAL_SPEC_0_0_1,
  equals: EQUALS_EVAL_SPEC_0_0_1,
  'has-matching-span': HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1,
  'is-instance': IS_INSTANCE_EVAL_SPEC_0_0_1,
  'llm-judge': LLM_JUDGE_EVAL_SPEC_0_0_1,
  'max-duration': MAX_DURATION_EVAL_SPEC_0_0_1,
  'precision-recall-evaluator': PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1,
};

export function getEvalSpecs(): EvalSpec[] {
  return Object.values(EVAL_CATALOG);
}

function resolveEvalId(evalId: string): string {
  if (evalId in EVAL_CATALOG) return evalId;
  const idx = evalId.lastIndexOf(':');
  if (idx > 0) {
    const base = evalId.slice(0, idx);
    if (base in EVAL_CATALOG) return base;
  }
  return evalId;
}

export function getEvalSpec(evalId: string): EvalSpec | undefined {
  return EVAL_CATALOG[resolveEvalId(evalId)];
}
