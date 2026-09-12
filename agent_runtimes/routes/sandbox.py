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

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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
    agent_id: Optional[str] = Field(
        default=None,
        description="Agent whose Jupyter sandbox should execute the code.",
    )
    action: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "An A2UI action the reader triggered — a button, a filter, a table "
            "selection. Bound into the run as `a2ui_action` so the code can "
            "answer it, which is the difference between a surface you can use "
            "and a screenshot."
        ),
    )
    stream: bool = Field(
        default=False,
        description=(
            "Deliver the surface as it is produced, over Server-Sent Events, "
            "rather than as one response when the run finishes. A2UI is a "
            "streaming protocol — the renderer builds the UI incrementally "
            "from a sequence of messages — and a single POST is the one "
            "transport the specification notes cannot carry that."
        ),
    )
    actions: list[dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Optional named controls to append to the converted surface. Each "
            "control has a name, label, and optional event context."
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

    A run with no action *unbinds* it rather than leaving it alone. The kernel
    outlives the request — that is the point of it — so code left the name
    behind, and the next plain run read the button somebody had pressed
    minutes earlier. The interactive demonstration answered "errors: 3" to a
    reader who had pressed nothing, which is worse than answering nothing: it
    looks like a considered reply.
    """
    import json

    if not action:
        return f"a2ui_action = None\n{code}"

    literal = json.dumps(action)
    return f"import json as _json\na2ui_action = _json.loads({literal!r})\n{code}"


def _append_chunk(sink: list[str], event: Any) -> None:
    """Add one streamed output chunk, keeping the kernel's own line breaks.

    The events carry a `terminated` flag saying whether the chunk they came
    from ended with a newline. Appending every chunk as a "line" and joining
    with newlines ignores it, which turns a row of dots printed with `end=""`
    into one dot per line — output the kernel never produced.

    Chunks that continue the current line are concatenated onto it; chunks
    that end one start the next.
    """
    line = getattr(event, "line", "") or ""
    if sink and not sink[-1].endswith("\n"):
        sink[-1] += line
    else:
        sink.append(line)
    if getattr(event, "terminated", True):
        sink[-1] += "\n"


def _text(lines: list[str]) -> str:
    """The collected chunks as one string, without inventing a final newline."""
    text = "".join(lines)
    return text[:-1] if text.endswith("\n") else text


def _sse(payload: Any) -> str:
    """One Server-Sent Event carrying one JSON payload."""
    return f"data: {json.dumps(payload)}\n\n"


async def _stream_surface(request: "SurfaceExecuteRequest"):
    """Yield the surface as the kernel produces it.

    The protocol already allows this and the conversion already exists; what
    was missing was a transport that could carry more than one message. So the
    shape here is the one A2UI describes: the surface is created once, and
    then updated — `updateComponents` carrying the output so far, each time
    more of it arrives.

    The final message is the ordinary full conversion. That matters for more
    than tidiness: images, the error card and the action buttons are only
    knowable once the run has finished, and re-sending the whole surface at
    the end means a reader who watched it grow and a reader who arrived late
    are looking at exactly the same thing.
    """
    from agent_runtimes.a2ui import ExecutionResult, execution_to_a2ui
    from code_sandboxes import CodeSandboxClient

    from ..services.code_sandbox_manager import get_code_sandbox_manager

    surface_id = request.surface_id
    code = _bind_action(request.code, request.action)

    manager = get_code_sandbox_manager()
    sandbox = None
    if request.agent_id:
        sandbox = manager.get_agent_sandbox(request.agent_id)
    if sandbox is None:
        sandbox = manager.get_managed_sandbox()
    client = CodeSandboxClient(sandbox)

    # The surface, before a single line has run: a reader should see the code
    # they asked for immediately, not after the last `time.sleep`.
    opening = execution_to_a2ui(
        ExecutionResult.from_payload({"code": request.code, "success": True}),
        surface_id=surface_id,
    )
    for message in opening:
        yield _sse(message)

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    results: list[str] = []
    outputs: list[dict[str, Any]] = []
    error: str | None = None
    streaming = getattr(client, "execute_code_streaming_async", None)

    if streaming is None:
        # No streaming sandbox: run it whole, and still deliver the result as
        # a stream so the caller has one code path rather than two.
        outcome = await client.execute_code_async(code)
        payload = (
            outcome.model_dump() if hasattr(outcome, "model_dump") else dict(outcome)
        )
        payload["code"] = request.code
        for message in execution_to_a2ui(
            ExecutionResult.from_payload(payload),
            surface_id=surface_id,
            actions=request.actions,
        ):
            yield _sse(message)
        return

    async for event in streaming(code):
        if hasattr(event, "line"):
            if bool(getattr(event, "error", False)):
                _append_chunk(stderr_lines, event)
            else:
                _append_chunk(stdout_lines, event)
        elif hasattr(event, "data"):
            data = getattr(event, "data", {}) or {}
            text = data.get("text/plain")
            if text is not None:
                results.append(str(text))
            if data:
                outputs.append(
                    {
                        "output_type": "display_data",
                        "data": dict(data),
                        "metadata": {},
                    }
                )
        elif hasattr(event, "name") and hasattr(event, "value"):
            error = f"{getattr(event, 'name', 'Error')}: {getattr(event, 'value', '')}"
            traceback = getattr(event, "traceback", None)
            outputs.append(
                {
                    "output_type": "error",
                    "ename": getattr(event, "name", "Error"),
                    "evalue": getattr(event, "value", ""),
                    "traceback": (traceback or "").splitlines(),
                }
            )

        snapshot = {
            "code": request.code,
            "success": error is None,
            "stdout": _text(stdout_lines),
            "stderr": _text(stderr_lines),
            "results": results,
            "outputs": outputs,
            "error": error,
        }

        # Only the parts that can change while the code is still running. The
        # rest of the surface is sent once, at the end.
        partial = execution_to_a2ui(
            ExecutionResult.from_payload(snapshot),
            surface_id=surface_id,
        )
        for message in partial:
            if "updateComponents" in message:
                yield _sse(message)

        # And the raw execution as it stands, for anything rendering the
        # kernel's own outputs rather than the surface. Both panels of the
        # example read from this one stream, and sending only the A2UI
        # messages left the Jupyter output frozen until the run finished —
        # streaming on one side of the comparison and not the other, which is
        # the least useful place for it to be missing.
        yield _sse({"execution": snapshot})

    final_payload = {
        "code": request.code,
        "success": error is None,
        "stdout": _text(stdout_lines),
        "stderr": _text(stderr_lines),
        "results": results,
        "outputs": outputs,
        "error": error,
    }
    for message in execution_to_a2ui(
        ExecutionResult.from_payload(final_payload),
        surface_id=surface_id,
        actions=request.actions,
    ):
        if "createSurface" not in message:
            yield _sse(message)
    # A terminating event, so a client knows the run is over rather than
    # inferring it from a closed socket.
    yield _sse({"execution": final_payload, "done": True})


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

    if request.stream:
        return StreamingResponse(
            _stream_surface(request),
            media_type="text/event-stream",
            headers={
                # Proxies that buffer are the usual reason a stream arrives
                # all at once at the end, which is the bug this exists to fix.
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    result = await execute_sandbox_code(
        SandboxExecuteRequest(
            code=_bind_action(request.code, request.action),
            agent_id=request.agent_id,
        )
    )
    payload = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    # The reader's code, not the bound version: the surface should show what
    # they wrote, not the plumbing that carried their click into it.
    payload["code"] = request.code

    return {
        "execution": payload,
        "messages": execution_to_a2ui(
            ExecutionResult.from_payload(payload),
            surface_id=request.surface_id,
            actions=request.actions,
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
        outputs=list(outcome.outputs),
        error=outcome.error,
        variant=str(client.variant) if client.variant else None,
    )
