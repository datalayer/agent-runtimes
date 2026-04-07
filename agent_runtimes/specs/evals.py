# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Eval Catalog.

Predefined evaluation benchmark configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import EvalSpec


# ============================================================================
# Eval Definitions
# ============================================================================

AGENTBENCH_EVAL_SPEC_0_0_1 = EvalSpec(
    id="agentbench",
    version="0.0.1",
    name="AgentBench",
    description="Multi-dimensional LLM-as-agent evaluation across 8 diverse environments including web browsing, operating system interaction, database queries, digital card games, lateral thinking, and household tasks.",
    category="Agentic",
    task_count=4080,
    metric="success_rate",
    source="https://github.com/THUDM/AgentBench",
    difficulty="hard",
    languages=["python", "sql", "bash"],
)

GPQA_DIAMOND_EVAL_SPEC_0_0_1 = EvalSpec(
    id="gpqa-diamond",
    version="0.0.1",
    name="GPQA Diamond",
    description="Graduate-level science questions crafted by domain experts. Tests advanced reasoning in physics, chemistry, and biology with questions that require PhD-level understanding to answer correctly.",
    category="Reasoning",
    task_count=448,
    metric="accuracy",
    source="https://github.com/idavidrein/gpqa",
    difficulty="expert",
    languages=["english"],
)

HUMANEVAL_EVAL_SPEC_0_0_1 = EvalSpec(
    id="humaneval",
    version="0.0.1",
    name="HumanEval",
    description="Python function implementation from docstrings. Measures functional correctness of code generation by testing against hand-written test cases. Widely used as a baseline for code generation benchmarks.",
    category="Coding",
    task_count=164,
    metric="pass@k",
    source="https://github.com/openai/human-eval",
    difficulty="medium",
    languages=["python"],
)

MMLU_EVAL_SPEC_0_0_1 = EvalSpec(
    id="mmlu",
    version="0.0.1",
    name="MMLU",
    description="Massive Multitask Language Understanding: 57-subject knowledge benchmark spanning STEM, humanities, social sciences, and more. Tests broad knowledge and reasoning across diverse academic domains.",
    category="Knowledge",
    task_count=15908,
    metric="accuracy",
    source="https://github.com/hendrycks/test",
    difficulty="medium",
    languages=["english"],
)

SWE_BENCH_VERIFIED_EVAL_SPEC_0_0_1 = EvalSpec(
    id="swe-bench-verified",
    version="0.0.1",
    name="SWE-bench Verified",
    description="Human-validated subset of SWE-bench with verified ground-truth patches. Provides higher confidence evaluation of software engineering capabilities by eliminating ambiguous or flawed test cases from the full benchmark.",
    category="Coding",
    task_count=500,
    metric="pass@1",
    source="https://www.swebench.com/",
    difficulty="hard",
    languages=["python"],
)

SWE_BENCH_EVAL_SPEC_0_0_1 = EvalSpec(
    id="swe-bench",
    version="0.0.1",
    name="SWE-bench",
    description="Real-world software engineering tasks from GitHub issues. Tests an agent's ability to understand bug reports and feature requests, then produce working code patches that pass existing test suites.",
    category="Coding",
    task_count=2294,
    metric="pass@1",
    source="https://www.swebench.com/",
    difficulty="hard",
    languages=["python"],
)

TOOLBENCH_EVAL_SPEC_0_0_1 = EvalSpec(
    id="toolbench",
    version="0.0.1",
    name="ToolBench",
    description="Large-scale benchmark for tool-augmented LLMs covering 16000+ real-world APIs across 49 categories. Evaluates multi-step tool usage, API selection, argument generation, and response parsing in complex, chained workflows.",
    category="Agentic",
    task_count=12657,
    metric="pass_rate",
    source="https://github.com/OpenBMB/ToolBench",
    difficulty="hard",
    languages=["python", "json"],
)

TRUTHFULQA_EVAL_SPEC_0_0_1 = EvalSpec(
    id="truthfulqa",
    version="0.0.1",
    name="TruthfulQA",
    description="Benchmark measuring whether a language model generates truthful answers to questions spanning 38 categories including health, law, finance, and politics. Designed to test resilience against common human misconceptions and falsehoods that models may have learned from training data.",
    category="Safety",
    task_count=817,
    metric="truthful_informative",
    source="https://github.com/sylinrl/TruthfulQA",
    difficulty="medium",
    languages=["english"],
)

# ============================================================================
# Eval Catalog
# ============================================================================

EVAL_CATALOG: Dict[str, EvalSpec] = {
    "agentbench": AGENTBENCH_EVAL_SPEC_0_0_1,
    "gpqa-diamond": GPQA_DIAMOND_EVAL_SPEC_0_0_1,
    "humaneval": HUMANEVAL_EVAL_SPEC_0_0_1,
    "mmlu": MMLU_EVAL_SPEC_0_0_1,
    "swe-bench-verified": SWE_BENCH_VERIFIED_EVAL_SPEC_0_0_1,
    "swe-bench": SWE_BENCH_EVAL_SPEC_0_0_1,
    "toolbench": TOOLBENCH_EVAL_SPEC_0_0_1,
    "truthfulqa": TRUTHFULQA_EVAL_SPEC_0_0_1,
}


def get_eval_spec(eval_id: str) -> EvalSpec | None:
    """Get an eval specification by ID (accepts both bare and versioned refs)."""
    spec = EVAL_CATALOG.get(eval_id)
    if spec is not None:
        return spec
    base, _, ver = eval_id.rpartition(':')
    if base and '.' in ver:
        return EVAL_CATALOG.get(base)
    return None


def list_eval_specs() -> List[EvalSpec]:
    """List all eval specifications."""
    return list(EVAL_CATALOG.values())
