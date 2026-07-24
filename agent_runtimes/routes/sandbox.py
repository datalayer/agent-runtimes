# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""HTTP route for executing code in the running agent's code sandbox.

This endpoint lets out-of-process clients (e.g. the interactive TUX, which
runs in a separate OS process from the agent-runtimes server) execute code in
the *existing* sandbox owned by the server — most importantly the per-agent
Jupyter sandbox created at agent startup — instead of spinning up a brand new
sandbox in the caller's process.

Execution and result normalization are delegated to
:class:`code_sandboxes.CodeSandboxClient` so the wire response is independent
of the underlying sandbox variant.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


class SandboxExecuteRequest(BaseModel):
    """Request body for :func:`execute_sandbox_code`."""

    code: str = Field(..., description="The code to execute in the sandbox.")
    agent_id: Optional[str] = Field(
        default=None,
        description="Agent whose sandbox should run the code. Falls back to the "
        "active sandbox when omitted or unknown.",
    )
    language: str = Field(default="python", description="Programming language.")
    timeout: Optional[float] = Field(
        default=None, description="Execution timeout in seconds."
    )
    stream: bool = Field(
        default=False,
        description=(
            "When true, execute via sandbox streaming API and aggregate streamed "
            "events into the response."
        ),
    )


class SandboxExecuteResponse(BaseModel):
    """Normalized execution result."""

    success: bool
    execution_ok: bool
    stdout: str = ""
    stderr: str = ""
    results: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    variant: Optional[str] = None


@router.post("/execute", response_model=SandboxExecuteResponse)
async def execute_sandbox_code(
    request: SandboxExecuteRequest,
) -> SandboxExecuteResponse:
    """Execute code in the server's existing sandbox and return the output.

    Resolution order for the target sandbox:

    1. The per-agent sandbox for ``request.agent_id`` (the agent's real
       Jupyter sandbox when running in ``loop`` mode).
    2. The manager's currently active sandbox.
    3. The managed sandbox (respects the configured variant), created lazily.
    """
    from code_sandboxes import CodeSandboxClient

    from ..services.code_sandbox_manager import get_code_sandbox_manager

    manager = get_code_sandbox_manager()

    sandbox = None
    if request.agent_id:
        sandbox = manager.get_agent_sandbox(request.agent_id)
    if sandbox is None:
        sandbox = manager.get_managed_sandbox()

    client = CodeSandboxClient(sandbox)
    try:
        if request.stream and hasattr(client, "execute_code_streaming_async"):
            stdout_lines: list[str] = []
            stderr_lines: list[str] = []
            results: list[str] = []
            error: str | None = None

            async for event in client.execute_code_streaming_async(
                request.code,
                language=request.language,
                timeout=request.timeout,
            ):
                if hasattr(event, "line"):
                    line = getattr(event, "line", "") or ""
                    if bool(getattr(event, "error", False)):
                        stderr_lines.append(line)
                    else:
                        stdout_lines.append(line)
                elif hasattr(event, "data"):
                    data = getattr(event, "data", {}) or {}
                    text = data.get("text/plain")
                    if text is not None:
                        results.append(str(text))
                elif hasattr(event, "name") and hasattr(event, "value"):
                    error = f"{getattr(event, 'name', 'Error')}: {getattr(event, 'value', '')}"

            return SandboxExecuteResponse(
                success=error is None,
                execution_ok=True,
                stdout="\n".join(stdout_lines),
                stderr="\n".join(stderr_lines),
                results=results,
                error=error,
                variant=str(client.variant) if client.variant else None,
            )

        outcome = await client.execute_code_async(
            request.code,
            language=request.language,
            timeout=request.timeout,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller
        logger.exception("Sandbox execution failed")
        raise HTTPException(
            status_code=500, detail=f"Sandbox execution failed: {exc}"
        ) from exc

    return SandboxExecuteResponse(
        success=outcome.success,
        execution_ok=outcome.execution_ok,
        stdout=outcome.stdout,
        stderr=outcome.stderr,
        results=outcome.results,
        error=outcome.error,
        variant=str(client.variant) if client.variant else None,
    )
