# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Eval Catalog.

Predefined built-in evaluator configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import EvalSpec

# ============================================================================
# Eval Definitions
# ============================================================================

CONFUSION_MATRIX_EVALUATOR_EVAL_SPEC_0_0_1 = EvalSpec(
    id="confusion-matrix-evaluator",
    version="0.0.1",
    name="Confusion Matrix Evaluator",
    description="Aggregate evaluator for precision/recall style confusion-matrix reporting.",
    category="Report",
    evaluator_type="report",
    pydantic_class="ConfusionMatrixEvaluator",
    output_kind="report_table",
    cost_tier="free",
    latency="fast",
    requires=["expected_output"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

CONTAINS_EVAL_SPEC_0_0_1 = EvalSpec(
    id="contains",
    version="0.0.1",
    name="Contains",
    description="Assert that expected content appears in the model output.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="ContainsEvaluator",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["expected_output"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

EQUALS_EXPECTED_EVAL_SPEC_0_0_1 = EvalSpec(
    id="equals-expected",
    version="0.0.1",
    name="Equals Expected",
    description="Compare model output against an expected value with strict matching.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="EqualsExpectedEvaluator",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["expected_output"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

EQUALS_EVAL_SPEC_0_0_1 = EvalSpec(
    id="equals",
    version="0.0.1",
    name="Equals",
    description="Assert exact equality between expected and actual values.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="EqualsEvaluator",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["expected_output"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1 = EvalSpec(
    id="has-matching-span",
    version="0.0.1",
    name="Has Matching Span",
    description="Validate expected spans in structured traces and tool-call transcripts.",
    category="Span-Based",
    evaluator_type="case",
    pydantic_class="HasMatchingSpanEvaluator",
    output_kind="boolean",
    cost_tier="free",
    latency="fast",
    requires=["trace"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

IS_INSTANCE_EVAL_SPEC_0_0_1 = EvalSpec(
    id="is-instance",
    version="0.0.1",
    name="Is Instance",
    description="Validate output type against an expected Python/JSON schema type.",
    category="Type Validation",
    evaluator_type="case",
    pydantic_class="IsInstanceEvaluator",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["expected_type"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

LLM_JUDGE_EVAL_SPEC_0_0_1 = EvalSpec(
    id="llm-judge",
    version="0.0.1",
    name="LLM Judge",
    description="Use an LLM-as-a-judge prompt to score quality and provide rationale.",
    category="LLM-as-a-Judge",
    evaluator_type="case",
    pydantic_class="LLMJudgeEvaluator",
    output_kind="score_and_assertion",
    cost_tier="llm",
    latency="slow",
    requires=["model"],
    source="https://ai.pydantic.dev/evals/",
    default_config={"threshold": 0.7},
)

MAX_DURATION_EVAL_SPEC_0_0_1 = EvalSpec(
    id="max-duration",
    version="0.0.1",
    name="Max Duration",
    description="Assert response latency remains below a configured duration threshold.",
    category="Performance",
    evaluator_type="case",
    pydantic_class="MaxDurationEvaluator",
    output_kind="boolean_with_reason",
    cost_tier="free",
    latency="instant",
    requires=["duration_ms"],
    source="https://ai.pydantic.dev/evals/",
    default_config={"max_duration_ms": 5000},
)

PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1 = EvalSpec(
    id="precision-recall-evaluator",
    version="0.0.1",
    name="Precision Recall Evaluator",
    description="Aggregate evaluator for precision, recall, and pass-rate style benchmark reporting.",
    category="Report",
    evaluator_type="report",
    pydantic_class="PrecisionRecallEvaluator",
    output_kind="report_curve",
    cost_tier="free",
    latency="fast",
    requires=["expected_output"],
    source="https://ai.pydantic.dev/evals/",
    default_config={},
)

# ============================================================================
# Eval Catalog
# ============================================================================

EVAL_CATALOG: Dict[str, EvalSpec] = {
    "confusion-matrix-evaluator": CONFUSION_MATRIX_EVALUATOR_EVAL_SPEC_0_0_1,
    "contains": CONTAINS_EVAL_SPEC_0_0_1,
    "equals-expected": EQUALS_EXPECTED_EVAL_SPEC_0_0_1,
    "equals": EQUALS_EVAL_SPEC_0_0_1,
    "has-matching-span": HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1,
    "is-instance": IS_INSTANCE_EVAL_SPEC_0_0_1,
    "llm-judge": LLM_JUDGE_EVAL_SPEC_0_0_1,
    "max-duration": MAX_DURATION_EVAL_SPEC_0_0_1,
    "precision-recall-evaluator": PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1,
}


def get_eval_spec(eval_id: str) -> EvalSpec | None:
    """Get an eval specification by ID (accepts both bare and versioned refs)."""
    spec = EVAL_CATALOG.get(eval_id)
    if spec is not None:
        return spec
    base, _, ver = eval_id.rpartition(":")
    if base and "." in ver:
        return EVAL_CATALOG.get(base)
    return None


def list_eval_specs() -> List[EvalSpec]:
    """List all eval specifications."""
    return list(EVAL_CATALOG.values())
