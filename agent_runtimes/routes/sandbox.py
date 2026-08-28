# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

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
from typing import Any, Optional

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
    #: The rich results as Jupyter outputs, mime bundles intact. `results` is
    #: their `text/plain` and nothing else, which is enough to print and not
    #: enough to draw — a figure arrives there as `<Figure size 640x480>`.
    outputs: list[dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    variant: Optional[str] = None


class SurfaceExecuteRequest(BaseModel):
    """Code to run, and optionally what the reader just did to a surface."""

    code: str = Field(description="Code to execute")
    action: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "An A2UI action the reader triggered — a button, a filter, a table "
            "selection. Bound into the run as `a2ui_action` so the code can "
            "answer it, which is the difference between a surface you can use "
            "and a screenshot."
        ),
    )
    surface_id: str = Field(
        default="sandbox-execution",
        description="Surface to update, so a re-run replaces rather than stacks",
    )


def _bind_action(code: str, action: Optional[dict[str, Any]]) -> str:
    """Put the action in front of the code as a plain Python value.

    A literal rather than a template: the reader's selections reach the code as
    data, and nothing they typed is ever spliced into the source.
    """
    if not action:
        return code
    import json

    literal = json.dumps(action)
    return (
        "import json as _json\n"
        f"a2ui_action = _json.loads({literal!r})\n"
        f"{code}"
    )


@router.post("/execute/a2ui")
async def execute_as_surface(
    request: SurfaceExecuteRequest,
) -> dict[str, Any]:
    """Run code and return the result as an A2UI surface.

    The same execution as `/execute`, rendered rather than dumped — a prompt
    that runs code should come back as something you can read. Server-side
    (D20) so the browser, the terminal and JupyterLab all get the same surface
    from one converter.

    Given an `action`, this is the round-trip: the reader filtered something,
    the code runs again knowing that, and the surface it returns replaces the
    one they were looking at.
    """
    from agent_runtimes.a2ui import ExecutionResult, execution_to_a2ui

    result = await execute_sandbox_code(
        SandboxExecuteRequest(code=_bind_action(request.code, request.action))
    )
    payload = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    # The reader's code, not the bound version: the surface should show what
    # they wrote, not the plumbing that carried their click into it.
    payload["code"] = request.code

    return {
        "execution": payload,
        "messages": execution_to_a2ui(
            ExecutionResult.from_payload(payload), surface_id=request.surface_id
        ),
    }


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
            streamed_outputs: list[dict[str, Any]] = []
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
                    if data:
                        streamed_outputs.append(
                            {
                                "output_type": "display_data",
                                "data": dict(data),
                                "metadata": {},
                            }
                        )
                elif hasattr(event, "name") and hasattr(event, "value"):
                    error = f"{getattr(event, 'name', 'Error')}: {getattr(event, 'value', '')}"

            return SandboxExecuteResponse(
                success=error is None,
                execution_ok=True,
                stdout="\n".join(stdout_lines),
                stderr="\n".join(stderr_lines),
                results=results,
                outputs=streamed_outputs,
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
        outputs=list(getattr(outcome, "outputs", []) or []),
        error=outcome.error,
        variant=str(client.variant) if client.variant else None,
    )
