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
    name="ConfusionMatrixEvaluator",
    description="Computes classification confusion matrix across the full experiment report.",
    category="Report",
    evaluator_type="report",
    pydantic_class="ConfusionMatrixEvaluator",
    output_kind="report_table",
    cost_tier="free",
    latency="instant",
    requires=["classification_labels"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#built-in-report-evaluators",
    default_config={},
)

CONTAINS_EVAL_SPEC_0_0_1 = EvalSpec(
    id="contains",
    version="0.0.1",
    name="Contains",
    description="Checks whether output contains a required value, substring, or key-value pair.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="Contains",
    output_kind="boolean_with_reason",
    cost_tier="free",
    latency="instant",
    requires=[],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#contains",
    default_config={
        "value": "required_term",
        "case_sensitive": False,
        "as_strings": True,
    },
)

EQUALS_EXPECTED_EVAL_SPEC_0_0_1 = EvalSpec(
    id="equals-expected",
    version="0.0.1",
    name="EqualsExpected",
    description="Exact equality check between output and expected output for each case.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="EqualsExpected",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["expected_output"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#equalsexpected",
    default_config={},
)

EQUALS_EVAL_SPEC_0_0_1 = EvalSpec(
    id="equals",
    version="0.0.1",
    name="Equals",
    description="Checks whether output equals a fixed expected value.",
    category="Comparison",
    evaluator_type="case",
    pydantic_class="Equals",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=[],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#equals",
    default_config={"value": "expected_result"},
)

HAS_MATCHING_SPAN_EVAL_SPEC_0_0_1 = EvalSpec(
    id="has-matching-span",
    version="0.0.1",
    name="HasMatchingSpan",
    description="Verifies that traces include at least one OpenTelemetry span matching a query.",
    category="Span-Based",
    evaluator_type="case",
    pydantic_class="HasMatchingSpan",
    output_kind="boolean",
    cost_tier="free",
    latency="fast",
    requires=["logfire"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#hasmatchingspan",
    default_config={"query": {"name_contains": "tool_call"}},
)

IS_INSTANCE_EVAL_SPEC_0_0_1 = EvalSpec(
    id="is-instance",
    version="0.0.1",
    name="IsInstance",
    description="Validates that the output type matches the expected runtime type name.",
    category="Type Validation",
    evaluator_type="case",
    pydantic_class="IsInstance",
    output_kind="boolean_with_reason",
    cost_tier="free",
    latency="instant",
    requires=[],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#isinstance",
    default_config={"type_name": "str"},
)

LLM_JUDGE_EVAL_SPEC_0_0_1 = EvalSpec(
    id="llm-judge",
    version="0.0.1",
    name="LLMJudge",
    description="Uses an LLM rubric to score and/or assert subjective response quality.",
    category="LLM-as-a-Judge",
    evaluator_type="case",
    pydantic_class="LLMJudge",
    output_kind="score_and_assertion",
    cost_tier="llm",
    latency="slow",
    requires=["model", "rubric"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#llmjudge",
    default_config={
        "rubric": "Response is accurate and helpful.",
        "include_input": True,
        "include_expected_output": False,
    },
)

MAX_DURATION_EVAL_SPEC_0_0_1 = EvalSpec(
    id="max-duration",
    version="0.0.1",
    name="MaxDuration",
    description="Enforces a maximum allowed execution duration per case.",
    category="Performance",
    evaluator_type="case",
    pydantic_class="MaxDuration",
    output_kind="boolean",
    cost_tier="free",
    latency="instant",
    requires=["duration"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#maxduration",
    default_config={"seconds": 2.0},
)

PRECISION_RECALL_EVALUATOR_EVAL_SPEC_0_0_1 = EvalSpec(
    id="precision-recall-evaluator",
    version="0.0.1",
    name="PrecisionRecallEvaluator",
    description="Computes precision-recall curve and AUC metrics at report level.",
    category="Report",
    evaluator_type="report",
    pydantic_class="PrecisionRecallEvaluator",
    output_kind="report_curve",
    cost_tier="free",
    latency="instant",
    requires=["binary_labels"],
    source="https://pydantic.dev/docs/ai/evals/evaluators/built-in/#built-in-report-evaluators",
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
