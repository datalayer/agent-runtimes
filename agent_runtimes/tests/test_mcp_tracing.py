# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Carrying the trace to the MCP server, and not inventing one.

The agent's work and the gateway's work are one story told in two processes.
Without `traceparent` they are two unrelated traces and "this call took nine
seconds, where did they go" has no answer.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_mcp_tracing.py -v
```
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.mcp import tracing as tracing_module
from agent_runtimes.mcp.tracing import (
    TRACE_HEADERS,
    _inject_on_request,
    trace_headers,
    tracing_client,
    with_trace,
)

TRACE_ID = 0x4BF92F3577B34DA6A3CE929D0E0E4736
SPAN_ID = 0x00F067AA0BA902B7


class _Request:
    """The part of an httpx request the hook touches."""

    def __init__(self, headers: dict[str, str] | None = None) -> None:
        self.headers: dict[str, str] = dict(headers or {})


def _in_a_span():
    """A context with a valid, non-recording span in it.

    Non-recording on purpose: propagation is about the *context*, and a test
    that needed a live exporter would be testing the SDK.
    """
    from opentelemetry import context as otel_context
    from opentelemetry import trace

    span_context = trace.SpanContext(
        trace_id=TRACE_ID,
        span_id=SPAN_ID,
        is_remote=False,
        trace_flags=trace.TraceFlags(trace.TraceFlags.SAMPLED),
    )
    return trace.set_span_in_context(trace.NonRecordingSpan(span_context))


class TestTheHeaders:
    def test_a_span_in_context_becomes_a_traceparent(self) -> None:
        from opentelemetry import context as otel_context

        token = otel_context.attach(_in_a_span())
        try:
            headers = trace_headers()
        finally:
            otel_context.detach(token)
        assert "traceparent" in headers
        assert "4bf92f3577b34da6a3ce929d0e0e4736" in headers["traceparent"]
        assert "00f067aa0ba902b7" in headers["traceparent"]

    def test_no_span_means_no_header_rather_than_a_made_up_one(self) -> None:
        """A fabricated traceparent is an orphan trace that looks real.

        It joins to nothing and sends whoever opens it looking for a parent
        that was never emitted. Not tracing is a fine answer.
        """
        assert trace_headers() == {}

    def test_only_trace_headers_are_ever_set(self) -> None:
        from opentelemetry import context as otel_context

        token = otel_context.attach(_in_a_span())
        try:
            headers = trace_headers()
        finally:
            otel_context.detach(token)
        assert set(headers) <= set(TRACE_HEADERS)

    def test_a_broken_propagator_does_not_fail_the_call(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The story about the work is worth less than the work."""
        import opentelemetry.propagate as propagate

        def explode(carrier: Any, *args: Any, **kwargs: Any) -> None:
            raise RuntimeError("no propagator configured")

        monkeypatch.setattr(propagate, "inject", explode)
        assert trace_headers() == {}


class TestMerging:
    def test_the_callers_headers_win(self) -> None:
        """Something upstream may already have decided what this request
        continues; overwriting it breaks the chain this exists to preserve."""
        from opentelemetry import context as otel_context

        token = otel_context.attach(_in_a_span())
        try:
            merged = with_trace({"traceparent": "00-aaaa-bbbb-01", "Authorization": "token x"})
        finally:
            otel_context.detach(token)
        assert merged["traceparent"] == "00-aaaa-bbbb-01"
        assert merged["Authorization"] == "token x"

    def test_with_no_headers_and_no_span_the_result_is_empty(self) -> None:
        assert with_trace() == {}


class TestTheHook:
    @pytest.mark.asyncio
    async def test_the_request_is_stamped_as_it_goes_out(self) -> None:
        from opentelemetry import context as otel_context

        request = _Request()
        token = otel_context.attach(_in_a_span())
        try:
            await _inject_on_request(request)
        finally:
            otel_context.detach(token)
        assert "4bf92f3577b34da6a3ce929d0e0e4736" in request.headers["traceparent"]

    @pytest.mark.asyncio
    async def test_a_request_that_already_carries_one_is_left_alone(self) -> None:
        from opentelemetry import context as otel_context

        request = _Request({"traceparent": "00-aaaa-bbbb-01"})
        token = otel_context.attach(_in_a_span())
        try:
            await _inject_on_request(request)
        finally:
            otel_context.detach(token)
        assert request.headers["traceparent"] == "00-aaaa-bbbb-01"

    @pytest.mark.asyncio
    async def test_a_request_outside_any_span_gets_no_header(self) -> None:
        request = _Request()
        await _inject_on_request(request)
        assert "traceparent" not in request.headers


class TestTheClient:
    def test_the_hook_runs_per_request_not_per_client(self) -> None:
        """The whole point: a client outlives any one span.

        A header fixed at construction would file every call of a long MCP
        session under whichever trace was current when it connected.
        """
        client = tracing_client()
        assert _inject_on_request in client.event_hooks["request"]

    def test_the_callers_own_hooks_are_kept(self) -> None:
        async def mine(request: Any) -> None:
            return None

        client = tracing_client(event_hooks={"request": [mine]})
        assert mine in client.event_hooks["request"]
        assert _inject_on_request in client.event_hooks["request"]

    def test_headers_given_to_the_client_are_carried(self) -> None:
        client = tracing_client(headers={"Authorization": "token abc"})
        assert client.headers["Authorization"] == "token abc"


class TestWiring:
    def _client_of(self, server: Any) -> Any:
        """The `httpx.AsyncClient` the transport will actually use.

        `MCPToolset` keeps a factory rather than the client, so reading the
        attribute proves nothing — this builds one the way the transport
        does, which is what the request will go through.
        """
        transport = server.client.transport
        return transport.httpx_client_factory(headers={}, auth=None, timeout=None)

    def test_the_mcp_toolset_gets_a_tracing_client_carrying_the_token(self) -> None:
        """`MCPToolset` refuses `headers` beside an `http_client`, so the
        token has to go on the client — and a second source of headers would
        be one of them silently losing."""
        from agent_runtimes.mcp.tools import create_mcp_server

        client = self._client_of(create_mcp_server("http://localhost:8888", "tok"))
        assert client.headers["Authorization"] == "token tok"
        assert _inject_on_request in client.event_hooks["request"]

    def test_an_unauthenticated_connection_still_carries_the_trace(self) -> None:
        from agent_runtimes.mcp.tools import create_mcp_server

        client = self._client_of(create_mcp_server("http://localhost:8888"))
        assert "Authorization" not in client.headers
        assert _inject_on_request in client.event_hooks["request"]
