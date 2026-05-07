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
  name: 'ConfusionMatrixEvaluator',
  description:
    'Computes classification confusion matrix across the full experiment report.',
  category: 'Report',
  evaluator_type: 'report',
  pydantic_class: 'ConfusionMatrixEvaluator',
  output_kind: 'report_table',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['classification_labels'],
  source:
    'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#built-in-report-evaluators',
  default_config: {},
};

export const CONTAINS_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'contains',
  version: '0.0.1',
  name: 'Contains',
  description:
    'Checks whether output contains a required value, substring, or key-value pair.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'Contains',
  output_kind: 'boolean_with_reason',
  cost_tier: 'free',
  latency: 'instant',
  requires: [],
  source: 'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#contains',
  default_config: {
    value: 'required_term',
    case_sensitive: false,
    as_strings: true,
  },
};

export const EQUALS_EXPECTED_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'equals-expected',
  version: '0.0.1',
  name: 'EqualsExpected',
  description:
    'Exact equality check between output and expected output for each case.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'EqualsExpected',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['expected_output'],
  source:
    'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#equalsexpected',
  default_config: {},
};

export const EQUALS_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'equals',
  version: '0.0.1',
  name: 'Equals',
  description: 'Checks whether output equals a fixed expected value.',
  category: 'Comparison',
  evaluator_type: 'case',
  pydantic_class: 'Equals',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: [],
  source: 'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#equals',
  default_config: { value: 'expected_result' },
};

export const HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'has-matching-span',
  version: '0.0.1',
  name: 'HasMatchingSpan',
  description:
    'Verifies that traces include at least one OpenTelemetry span matching a query.',
  category: 'Span-Based',
  evaluator_type: 'case',
  pydantic_class: 'HasMatchingSpan',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'fast',
  requires: ['logfire'],
  source:
    'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#hasmatchingspan',
  default_config: { query: { name_contains: 'tool_call' } },
};

export const IS_INSTANCE_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'is-instance',
  version: '0.0.1',
  name: 'IsInstance',
  description:
    'Validates that the output type matches the expected runtime type name.',
  category: 'Type Validation',
  evaluator_type: 'case',
  pydantic_class: 'IsInstance',
  output_kind: 'boolean_with_reason',
  cost_tier: 'free',
  latency: 'instant',
  requires: [],
  source: 'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#isinstance',
  default_config: { type_name: 'str' },
};

export const LLM_JUDGE_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'llm-judge',
  version: '0.0.1',
  name: 'LLMJudge',
  description:
    'Uses an LLM rubric to score and/or assert subjective response quality.',
  category: 'LLM-as-a-Judge',
  evaluator_type: 'case',
  pydantic_class: 'LLMJudge',
  output_kind: 'score_and_assertion',
  cost_tier: 'llm',
  latency: 'slow',
  requires: ['model', 'rubric'],
  source: 'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#llmjudge',
  default_config: {
    rubric: 'Response is accurate and helpful.',
    include_input: true,
    include_expected_output: false,
  },
};

export const MAX_DURATION_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'max-duration',
  version: '0.0.1',
  name: 'MaxDuration',
  description: 'Enforces a maximum allowed execution duration per case.',
  category: 'Performance',
  evaluator_type: 'case',
  pydantic_class: 'MaxDuration',
  output_kind: 'boolean',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['duration'],
  source: 'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#maxduration',
  default_config: { seconds: 2.0 },
};

export const PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1: EvalSpec = {
  id: 'precision-recall-evaluator',
  version: '0.0.1',
  name: 'PrecisionRecallEvaluator',
  description:
    'Computes precision-recall curve and AUC metrics at report level.',
  category: 'Report',
  evaluator_type: 'report',
  pydantic_class: 'PrecisionRecallEvaluator',
  output_kind: 'report_curve',
  cost_tier: 'free',
  latency: 'instant',
  requires: ['binary_labels'],
  source:
    'https://pydantic.dev/docs/ai/evals/evaluators/built-in/#built-in-report-evaluators',
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
