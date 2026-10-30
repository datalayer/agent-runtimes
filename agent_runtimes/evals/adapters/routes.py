# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The routes a service reaches a runtime's adapter host through.

- `PUT /evals/adapters/sources/{digest}` hands the runtime an archive;
- `POST /evals/adapters/{framework}/inspect` discovers what it defines;
- `POST /evals/adapters/{framework}/execute` runs one trial;
- `POST /evals/adapters/executions/{key}/cancel` stops one.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from agent_runtimes.evals.adapters.base import AdapterPlan, InferenceRoute, Trial
from agent_runtimes.evals.adapters.host import AdapterHost, SourceMissing
from agent_runtimes.evals.adapters.registry import UnknownAdapter
from agent_runtimes.evals.adapters.sandbox import SandboxCancelled, SandboxUnavailable
from agent_runtimes.evals.adapters.source import MAX_ARCHIVE_BYTES, SourceRefused

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evals/adapters", tags=["evals"])

_host: AdapterHost | None = None


def host() -> AdapterHost:
    """Answer the host of this runtime, made on first use."""
    global _host
    if _host is None:
        _host = AdapterHost()
    return _host


def use_host(replacement: AdapterHost | None) -> None:
    """Replace the host — for the tests."""
    global _host
    _host = replacement


class InspectRequest(BaseModel):
    """What `inspect` is asked."""

    model_config = ConfigDict(extra="forbid")

    digest: str
    options: dict[str, Any] = Field(default_factory=dict)


class ExecuteRequest(BaseModel):
    """What `execute` is asked."""

    model_config = ConfigDict(extra="forbid")

    digest: str
    plan: AdapterPlan
    trial: Trial
    #: Values for the names the plan's policy holds, for this execution only.
    secrets: dict[str, str] = Field(default_factory=dict)
    key: str = ""
    #: How this execution reaches ai-inference: held by the relay here.
    inference: InferenceRoute | None = None


def _refusal(error: Exception) -> HTTPException:
    """An operation's failure as an HTTP refusal."""
    if isinstance(error, UnknownAdapter):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, SourceMissing):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, SandboxUnavailable):
        return HTTPException(
            status_code=503,
            detail={"code": "sandbox_unavailable", "message": str(error)},
        )
    if isinstance(error, SandboxCancelled):
        return HTTPException(
            status_code=409, detail={"code": "cancelled", "message": str(error)}
        )
    return HTTPException(status_code=422, detail=str(error))


@router.put("/sources/{digest}")
async def put_source(digest: str, request: Request) -> dict[str, Any]:
    """Hand this runtime an archive."""
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_ARCHIVE_BYTES:
            raise HTTPException(status_code=413, detail="the archive is too large")
    try:
        tree = await run_in_threadpool(host().put_source, digest, bytes(data))
    except (ValueError, SourceRefused) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"digest": tree.archive_digest, "content_digest": tree.content_digest}


@router.post("/{framework}/inspect")
async def inspect(framework: str, body: InspectRequest) -> dict[str, Any]:
    """Discover what a source defines."""
    try:
        inspection = await run_in_threadpool(
            host().inspect, framework, body.digest, options=body.options
        )
    except (
        UnknownAdapter,
        SourceMissing,
        SandboxUnavailable,
        SandboxCancelled,
        ValueError,
    ) as error:
        raise _refusal(error) from error
    return inspection.model_dump()


@router.post("/{framework}/execute")
async def execute(framework: str, body: ExecuteRequest) -> dict[str, Any]:
    """Run one trial."""
    try:
        result = await run_in_threadpool(
            host().execute,
            framework,
            body.digest,
            plan=body.plan,
            trial=body.trial,
            secrets=body.secrets,
            key=body.key,
            inference=body.inference,
        )
    except (
        UnknownAdapter,
        SourceMissing,
        SandboxUnavailable,
        SandboxCancelled,
        ValueError,
    ) as error:
        raise _refusal(error) from error
    return result.model_dump()


@router.post("/executions/{key}/cancel")
async def cancel(key: str) -> dict[str, Any]:
    """Stop one trial."""
    return {"cancelled": host().cancel(key)}
