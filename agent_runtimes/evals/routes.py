# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for evaluation runs."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .runner import EvalReport, EvalRunner

logger = logging.getLogger(__name__)

router = APIRouter(tags=["evals"])

# In-memory store of eval reports (keyed by eval_id)
_eval_reports: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RunEvalsRequest(BaseModel):
    """Request body for triggering an eval run."""

    eval_spec: list[dict[str, Any]] = Field(
        ...,
        description="The evals config list from the agentspec",
    )
    agent_system_prompt: str | None = Field(
        None, description="Agent system prompt for synthetic case generation"
    )
    tool_schemas: list[dict[str, Any]] | None = Field(
        None, description="Tool JSON schemas for grounding"
    )


class EvalReportResponse(BaseModel):
    """Serialized eval report."""

    eval_id: str
    agent_id: str
    total_cases: int = 0
    passed: int = 0
    failed: int = 0
    avg_score: float | None = None
    duration_ms: float = 0.0
    report_path: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/agents/{agent_id}/evals/run",
    response_model=EvalReportResponse,
)
async def run_evals(agent_id: str, body: RunEvalsRequest) -> EvalReportResponse:
    """Trigger an evaluation run for the specified agent.

    POST /api/v1/agents/{agent_id}/evals/run
    """
    runner = EvalRunner(agent_id=agent_id)

    try:
        report = await runner.run(
            eval_spec=body.eval_spec,
            agent_system_prompt=body.agent_system_prompt,
            tool_schemas=body.tool_schemas,
        )
    except Exception as e:
        logger.error("Eval run failed for agent %s: %s", agent_id, e)
        raise HTTPException(status_code=500, detail=f"Eval run failed: {e}")

    # Store for later retrieval
    report_data = {
        "eval_id": report.eval_id,
        "agent_id": report.agent_id,
        "total_cases": report.total_cases,
        "passed": report.passed,
        "failed": report.failed,
        "avg_score": report.avg_score,
        "duration_ms": report.duration_ms,
        "report_path": report.report_path,
    }
    _eval_reports[report.eval_id] = report_data

    return EvalReportResponse(**report_data)


@router.get(
    "/agents/{agent_id}/evals",
    response_model=list[EvalReportResponse],
)
async def list_evals(agent_id: str) -> list[EvalReportResponse]:
    """List past evaluation runs for an agent.

    GET /api/v1/agents/{agent_id}/evals
    """
    reports = [
        EvalReportResponse(**r)
        for r in _eval_reports.values()
        if r["agent_id"] == agent_id
    ]
    return sorted(reports, key=lambda r: r.eval_id, reverse=True)


@router.get(
    "/agents/{agent_id}/evals/{eval_id}",
    response_model=EvalReportResponse,
)
async def get_eval(agent_id: str, eval_id: str) -> EvalReportResponse:
    """Get a specific evaluation report.

    GET /api/v1/agents/{agent_id}/evals/{eval_id}
    """
    report = _eval_reports.get(eval_id)
    if report is None or report["agent_id"] != agent_id:
        raise HTTPException(status_code=404, detail="Eval report not found")
    return EvalReportResponse(**report)
