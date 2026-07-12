# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Convert agentspec eval configuration into pydantic-evals Datasets."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class EvalCaseSpec:
    """A single evaluation case derived from the agentspec."""

    name: str
    prompt: str
    expected_output: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvalSuiteSpec:
    """A suite of eval cases for one named evaluation."""

    name: str
    category: str
    task_count: int
    cases: list[EvalCaseSpec] = field(default_factory=list)


def parse_eval_spec(eval_spec: list[dict[str, Any]]) -> list[EvalSuiteSpec]:
    """Parse the agentspec evals YAML list into strongly-typed suite specs.

    Parameters
    ----------
    eval_spec : list[dict]
        The ``evals`` section from the agentspec, e.g.::

            [
                {"name": "KPI Accuracy", "category": "coding", "task_count": 400},
                {"name": "Variance Quality", "category": "reasoning", "task_count": 200},
            ]
    """
    suites: list[EvalSuiteSpec] = []
    for entry in eval_spec:
        suites.append(
            EvalSuiteSpec(
                name=entry["name"],
                category=entry.get("category", "general"),
                task_count=entry.get("task_count", 50),
            )
        )
    return suites


async def build_dataset_from_spec(
    eval_spec: list[dict[str, Any]],
    agent_system_prompt: str | None = None,
    tool_schemas: list[dict[str, Any]] | None = None,
) -> Any:
    """Convert agentspec eval config into a pydantic-evals Dataset.

    If ``pydantic_evals`` is available, returns a ``Dataset`` instance.
    Otherwise returns a list of ``EvalSuiteSpec`` for manual processing.

    Parameters
    ----------
    eval_spec : list[dict]
        The evals config from the agentspec.
    agent_system_prompt : str | None
        System prompt of the agent (used for synthetic case generation).
    tool_schemas : list[dict] | None
        JSON schemas of the agent's tools (for grounding case generation).
    """
    suites = parse_eval_spec(eval_spec)

    try:
        from pydantic_evals import Case, Dataset

        all_cases: list[Case] = []
        for suite in suites:
            cases = await _generate_pydantic_cases(
                suite,
                agent_system_prompt=agent_system_prompt,
                tool_schemas=tool_schemas,
            )
            all_cases.extend(cases)

        return Dataset(cases=all_cases)

    except ImportError:
        logger.warning(
            "pydantic-evals not installed — returning raw EvalSuiteSpecs. "
            "Install with: pip install pydantic-evals"
        )
        return suites


async def _generate_pydantic_cases(
    suite: EvalSuiteSpec,
    agent_system_prompt: str | None = None,
    tool_schemas: list[dict[str, Any]] | None = None,
) -> list[Any]:
    """Generate pydantic-evals Case instances for an eval suite.

    Uses category-based heuristics and optional LLM generation.
    """
    from pydantic_evals import Case

    cases: list[Case] = []

    # If the suite already has hand-written cases, convert directly
    for c in suite.cases:
        cases.append(
            Case(
                name=c.name,
                inputs={"prompt": c.prompt},
                expected_output=c.expected_output,
                metadata={"category": suite.category, **c.metadata},
            )
        )

    # Generate synthetic cases up to task_count
    remaining = suite.task_count - len(cases)
    if remaining > 0:
        synthetic = _generate_synthetic_cases(
            suite_name=suite.name,
            category=suite.category,
            count=remaining,
            agent_system_prompt=agent_system_prompt,
            tool_schemas=tool_schemas,
        )
        cases.extend(synthetic)

    return cases


def _generate_synthetic_cases(
    suite_name: str,
    category: str,
    count: int,
    agent_system_prompt: str | None = None,
    tool_schemas: list[dict[str, Any]] | None = None,
) -> list[Any]:
    """Generate synthetic evaluation cases from category templates.

    This is a stub that produces placeholder cases.  In production,
    this would call an LLM to generate realistic test cases based on
    the agent's system prompt and tool schemas.
    """
    from pydantic_evals import Case

    cases: list[Case] = []
    for i in range(count):
        cases.append(
            Case(
                name=f"{suite_name} - synthetic #{i + 1}",
                inputs={
                    "prompt": f"[{category}] Synthetic test case {i + 1} for: {suite_name}"
                },
                expected_output=None,
                metadata={
                    "category": category,
                    "synthetic": True,
                    "suite": suite_name,
                },
            )
        )
    return cases
