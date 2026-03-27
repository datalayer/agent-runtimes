# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""EvalRunner — orchestrates evaluation suites against registered agents."""

from __future__ import annotations

import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from .report import CaseResult, EvalReportData, format_report, save_report_json
from .spec_adapter import build_dataset_from_spec, parse_eval_spec

logger = logging.getLogger(__name__)

_DEFAULT_EVALS_DIR = os.path.join(tempfile.gettempdir(), "agent-evals")


@dataclass
class EvalReport:
    """Public-facing eval report returned by EvalRunner.run()."""

    eval_id: str
    agent_id: str
    total_cases: int = 0
    passed: int = 0
    failed: int = 0
    avg_score: float | None = None
    duration_ms: float = 0.0
    report_path: str | None = None
    details: EvalReportData | None = None


class EvalRunner:
    """Executes evaluation suites against registered agents.

    Parameters
    ----------
    agent_id : str
        Identifier of the agent to evaluate.
    agent_fn : Callable[[dict], Awaitable[str]] | None
        Async function that takes ``{"prompt": ...}`` and returns agent output.
        If not provided, a no-op stub is used.
    output_dir : str
        Directory for storing eval reports.
    """

    def __init__(
        self,
        agent_id: str,
        agent_fn: Callable[[dict[str, Any]], Awaitable[str]] | None = None,
        output_dir: str = _DEFAULT_EVALS_DIR,
    ):
        self.agent_id = agent_id
        self.agent_fn = agent_fn or self._noop_agent
        self.output_dir = output_dir

    async def run(
        self,
        eval_spec: list[dict[str, Any]],
        agent_system_prompt: str | None = None,
        tool_schemas: list[dict[str, Any]] | None = None,
    ) -> EvalReport:
        """Run the full evaluation suite.

        Parameters
        ----------
        eval_spec : list[dict]
            The ``evals`` section from the agentspec.
        agent_system_prompt : str | None
            System prompt for synthetic case generation.
        tool_schemas : list[dict] | None
            Tool JSON schemas for grounding.
        """
        eval_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc)

        logger.info(
            "Starting eval run %s for agent %s (%d suites)",
            eval_id,
            self.agent_id,
            len(eval_spec),
        )

        # 1. Build dataset from spec
        dataset = await build_dataset_from_spec(
            eval_spec,
            agent_system_prompt=agent_system_prompt,
            tool_schemas=tool_schemas,
        )

        # 2. Run evaluations
        case_results: list[CaseResult] = []

        # pydantic-evals path
        try:
            from pydantic_evals import Dataset

            if isinstance(dataset, Dataset):
                case_results = await self._run_pydantic_evals(dataset)
            else:
                case_results = await self._run_manual(eval_spec)
        except ImportError:
            case_results = await self._run_manual(eval_spec)

        # 3. Build report
        report_data = format_report(
            eval_id=eval_id,
            agent_id=self.agent_id,
            case_results=case_results,
            started_at=started_at,
            metadata={"eval_spec": eval_spec},
        )

        # 4. Persist
        report_path = save_report_json(report_data, self.output_dir)

        total_duration = sum(c.duration_ms for c in case_results)
        report = EvalReport(
            eval_id=eval_id,
            agent_id=self.agent_id,
            total_cases=report_data.summary.total_cases,
            passed=report_data.summary.passed,
            failed=report_data.summary.failed,
            avg_score=report_data.summary.avg_score,
            duration_ms=total_duration,
            report_path=report_path,
            details=report_data,
        )

        logger.info(
            "Eval run %s complete: %d/%d passed (%.1fms)",
            eval_id,
            report.passed,
            report.total_cases,
            total_duration,
        )
        return report

    async def _run_pydantic_evals(self, dataset: Any) -> list[CaseResult]:
        """Run evaluation using pydantic-evals Dataset.evaluate()."""
        results: list[CaseResult] = []

        for case in dataset.cases:
            start = time.monotonic()
            try:
                output = await self.agent_fn(case.inputs)
                duration = (time.monotonic() - start) * 1000

                passed = True
                if case.expected_output is not None:
                    passed = output.strip() == str(case.expected_output).strip()

                results.append(
                    CaseResult(
                        case_name=case.name,
                        passed=passed,
                        score=1.0 if passed else 0.0,
                        actual_output=output,
                        expected_output=(
                            str(case.expected_output) if case.expected_output else None
                        ),
                        duration_ms=duration,
                        metadata=case.metadata or {},
                    )
                )
            except Exception as e:
                duration = (time.monotonic() - start) * 1000
                results.append(
                    CaseResult(
                        case_name=case.name,
                        passed=False,
                        duration_ms=duration,
                        error=str(e),
                        metadata=case.metadata or {},
                    )
                )

        return results

    async def _run_manual(self, eval_spec: list[dict[str, Any]]) -> list[CaseResult]:
        """Fallback: run evaluations without pydantic-evals library."""
        suites = parse_eval_spec(eval_spec)
        results: list[CaseResult] = []

        for suite in suites:
            for i in range(min(suite.task_count, 10)):  # Cap at 10 for manual mode
                prompt = f"[{suite.category}] Test case {i + 1} for: {suite.name}"
                start = time.monotonic()
                try:
                    output = await self.agent_fn({"prompt": prompt})
                    duration = (time.monotonic() - start) * 1000
                    results.append(
                        CaseResult(
                            case_name=f"{suite.name} #{i + 1}",
                            passed=True,  # No expected output → pass if no error
                            score=None,
                            actual_output=output,
                            duration_ms=duration,
                            metadata={"category": suite.category},
                        )
                    )
                except Exception as e:
                    duration = (time.monotonic() - start) * 1000
                    results.append(
                        CaseResult(
                            case_name=f"{suite.name} #{i + 1}",
                            passed=False,
                            duration_ms=duration,
                            error=str(e),
                            metadata={"category": suite.category},
                        )
                    )

        return results

    @staticmethod
    async def _noop_agent(inputs: dict[str, Any]) -> str:
        """No-op agent function for testing."""
        return f"[no-op] Received: {inputs.get('prompt', '')}"
