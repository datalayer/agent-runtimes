# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Carrying the trace across the wire to an MCP server.

An agent's work and the gateway's work are one story told in two processes.
Without a `traceparent` header they are two unrelated traces, and the question
somebody actually asks — "this call took nine seconds, where did they go" —
has no answer: the agent's span says nine seconds and the gateway's says
nothing, because nothing joins them.

The gateway already continues an incoming `traceparent` rather than starting
a new trace; this is the other half.

Two properties.

**Per request, never per client.** The headers are computed when a request is
sent, not when the client is built. An MCP session is long-lived — one client,
many calls, across many of the agent's own spans — so a header fixed at
construction would file every call in the session under whichever trace
happened to be current when the connection opened.

**No span, no header.** A fabricated `traceparent` produces a trace id nothing
else knows: an orphan trace that looks exactly like a real one in the trace
list, joins to nothing, and sends whoever opens it looking for a parent that
was never emitted. Not tracing is a fine answer; inventing a trace is not.

@module agent_runtimes.mcp.tracing
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

#: The headers this may set, W3C Trace Context. Named so a test can assert
#: nothing else is added and so a reader knows what to look for on the wire.
TRACE_HEADERS = ("traceparent", "tracestate")


def trace_headers() -> dict[str, str]:
    """The current trace context as headers, or nothing when there is none.

    Uses `opentelemetry.propagate.inject`, so a deployment configured for a
    format other than W3C — B3, say — gets that format rather than this
    module's idea of one.

    Never raises. A tracer that fails must not fail the MCP call it was
    describing: the story about the work is worth less than the work.
    """
    try:
        from opentelemetry.propagate import inject  # noqa: PLC0415
    except Exception:  # noqa: BLE001 - telemetry is optional
        return {}
    carrier: dict[str, str] = {}
    try:
        inject(carrier)
    except Exception as error:  # noqa: BLE001
        logger.debug("The trace context could not be injected: %s", error)
        return {}
    # `inject` writes nothing when there is no span in context, which is
    # exactly the behaviour wanted: no trace to continue, no header claiming
    # there is one.
    return carrier


def with_trace(headers: Optional[dict[str, str]] = None) -> dict[str, str]:
    """`headers` plus the current trace context.

    The caller's headers win. If something upstream already decided what
    `traceparent` this request continues — a relayed webhook, a replayed
    request — overwriting it would break the chain this exists to preserve.
    """
    merged = dict(trace_headers())
    merged.update(headers or {})
    return merged


async def _inject_on_request(request: Any) -> None:
    """An httpx request event hook: stamp the trace as the request goes out."""
    for name, value in trace_headers().items():
        # Only when the request does not carry one already, for the same
        # reason `with_trace` lets the caller win.
        if name not in request.headers:
            request.headers[name] = value


#: How long an MCP server's HTTP exchange may take, in seconds: the default of
#: :func:`tracing_client`. httpx's own default is 5 s for every phase, which
#: cut an MCP session in two ways (PAP browser pass, 2026-10-12): a tool whose
#: answer takes longer than 5 s (`pap_ask` waits 10 s for the company) came
#: back "Connection closed", and the session's idle GET stream timed out every
#: 5 s and reconnected into the gateway's 409 "Only one SSE stream is allowed
#: per session". A read waits as long as an MCP request may (pydantic-ai's
#: `read_timeout`, 5 minutes); connecting, writing and the pool, 30 s.
MCP_HTTP_READ_TIMEOUT = 300.0
MCP_HTTP_TIMEOUT_SECONDS = 30.0


def mcp_http_timeout() -> Any:
    """The `httpx.Timeout` an MCP server's client is given by default."""
    import httpx  # noqa: PLC0415

    return httpx.Timeout(MCP_HTTP_TIMEOUT_SECONDS, read=MCP_HTTP_READ_TIMEOUT)


def tracing_client(**kwargs: Any) -> Any:
    """An `httpx.AsyncClient` that carries the trace on every request.

    Handed to `MCPToolset(http_client=...)`. The hook runs per request, which
    is the whole point: the client outlives any one span. Without a `timeout`
    of its own it is given :func:`mcp_http_timeout`, never httpx's 5 s.
    """
    import httpx  # noqa: PLC0415

    hooks = dict(kwargs.pop("event_hooks", None) or {})
    hooks["request"] = [*hooks.get("request", []), _inject_on_request]
    kwargs.setdefault("timeout", mcp_http_timeout())
    return httpx.AsyncClient(event_hooks=hooks, **kwargs)
