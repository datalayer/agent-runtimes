# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Preview run always ends with an answer or a stated error (PAP browser pass, 2026-10-12).

An application's Preview run "On Datalayer" reached the runtime, opened its
MCP session to the gateway's `pap` toolset, and gave no answer for five
minutes, with nothing in the runtime's logs. What these hold:

- the gateway's toolsets wait long enough for a cold gateway worker to answer
  its handshake (7 to 10 s; pydantic-ai's default is 5 s), and their HTTP
  client is not httpx's 5 s for every phase, which cut tool calls longer than
  5 s and made the idle GET stream reconnect into a 409 every 5 s;
- a server that does not open ends the run with a sentence naming it and how
  long it was given — not "Client failed to connect: ";
- the AG-UI stream logs how a run ended — an error, a page that closed the
  stream early — and a stream that ends without `RUN_FINISHED` or
  `RUN_ERROR` is closed with a `RUN_ERROR` of its own.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator

import httpx
import pytest

from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run
from agent_runtimes.mcp.displays import (
    MCP_INIT_TIMEOUT,
    DisplayMCPToolset,
    McpServerUnreachable,
)
from agent_runtimes.mcp.tracing import MCP_HTTP_READ_TIMEOUT, tracing_client
from agent_runtimes.transports.agui import watch_run_stream

#: How long a cold gateway worker took to answer `initialize` on r1.
COLD_GATEWAY_WORKER_SECONDS = 9.6


def test_the_mcp_http_client_is_not_httpx_s_five_seconds() -> None:
    client = tracing_client(headers={"Authorization": "Bearer t"})
    assert client.timeout.read == MCP_HTTP_READ_TIMEOUT
    assert client.timeout.connect is not None and client.timeout.connect > 5
    # A timeout the caller chose is kept.
    assert tracing_client(timeout=7.0).timeout.read == 7.0


def test_a_cold_gateway_worker_has_time_to_answer_the_handshake() -> None:
    toolset = DisplayMCPToolset("http://127.0.0.1:9/mcp", id="pap_x")
    assert MCP_INIT_TIMEOUT > COLD_GATEWAY_WORKER_SECONDS
    assert toolset.client._init_timeout == MCP_INIT_TIMEOUT
    # Said otherwise, it is kept: the stdio servers give their own.
    told = DisplayMCPToolset("http://127.0.0.1:9/mcp", init_timeout=180)
    assert told.client._init_timeout == 180


def test_the_gateway_toolsets_of_a_run_wait_for_a_cold_worker(monkeypatch) -> None:
    from agent_runtimes.apps import pap_connections

    monkeypatch.setenv("DATALAYER_MCP_SERVER_URL", "https://mcp.example/mcp")
    pap_connections.forget()
    app = type(
        "App",
        (),
        {
            "pap": type(
                "Pap",
                (),
                {
                    "connections": [
                        {"company": "manzanita.example", "access": "read"},
                    ]
                },
            )()
        },
    )()
    pap_connections.remember(app)
    try:
        sid = pap_connections.server_id("manzanita.example")
        (company,) = toolsets_for_the_run(
            [], "run-token", users_token="user-token", companies=((sid, "user"),)
        )
        inner = company.wrapped
        assert inner.client._init_timeout == MCP_INIT_TIMEOUT
    finally:
        pap_connections.forget()


@pytest.mark.asyncio
async def test_a_server_that_never_answers_ends_the_run_in_a_sentence() -> None:
    """A gateway that accepts the connection and never answers: the hang of 2026-10-12."""
    held: list[asyncio.StreamWriter] = []

    async def never_answer(
        reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        held.append(writer)
        await reader.read(65536)

    server = await asyncio.start_server(never_answer, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    toolset = DisplayMCPToolset(
        f"http://127.0.0.1:{port}/mcp",
        id="pap_manzanita_example",
        init_timeout=0.5,
        http_client=tracing_client(),
    )
    started = time.perf_counter()
    try:
        with pytest.raises(McpServerUnreachable) as caught:
            async with toolset:
                pass
    finally:
        for writer in held:
            writer.close()
        server.close()
        await server.wait_closed()
    assert time.perf_counter() - started < 5
    said = str(caught.value)
    assert "`pap_manzanita_example`" in said
    assert "0.5 s" in said
    assert not said.rstrip().endswith(":")


async def _chunks(*events: dict) -> AsyncIterator[bytes]:
    for event in events:
        yield f"data: {json.dumps(event)}\n\n".encode()


async def _read(stream: AsyncIterator[bytes]) -> list[dict]:
    text = b"".join([chunk async for chunk in stream]).decode()
    return [
        json.loads(line[5:]) for line in text.splitlines() if line.startswith("data:")
    ]


@pytest.mark.asyncio
async def test_a_stream_that_ends_without_an_end_is_closed_with_an_error(
    caplog,
) -> None:
    caplog.set_level(logging.NOTSET)
    events = await _read(
        watch_run_stream(
            _chunks({"type": "RUN_STARTED"}), "pap-app", time.perf_counter()
        )
    )
    assert [e["type"] for e in events] == ["RUN_STARTED", "RUN_ERROR"]
    assert "no answer" in events[-1]["message"]
    assert any(
        "pap-app" in r.getMessage() and "without RUN_FINISHED" in r.getMessage()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_a_run_s_error_is_logged_and_passed_on_once(caplog) -> None:
    caplog.set_level(logging.NOTSET)
    events = await _read(
        watch_run_stream(
            _chunks(
                {"type": "RUN_STARTED"},
                {"type": "RUN_ERROR", "message": "did not open"},
            ),
            "pap-app",
            time.perf_counter(),
        )
    )
    assert [e["type"] for e in events] == ["RUN_STARTED", "RUN_ERROR"]
    assert any(
        "ended in error" in r.getMessage() and "did not open" in r.getMessage()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_a_finished_run_passes_through_unchanged() -> None:
    events = await _read(
        watch_run_stream(
            _chunks({"type": "RUN_STARTED"}, {"type": "RUN_FINISHED"}),
            "a",
            time.perf_counter(),
        )
    )
    assert [e["type"] for e in events] == ["RUN_STARTED", "RUN_FINISHED"]


@pytest.mark.asyncio
async def test_an_event_split_across_chunks_is_still_read() -> None:
    sent = b'data: {"type": "RUN_STARTED"}\n\ndata: {"type": "RUN_FINISHED"}\n\n'

    async def split() -> AsyncIterator[bytes]:
        yield sent[:45]
        yield sent[45:]

    received = b"".join(
        [chunk async for chunk in watch_run_stream(split(), "a", time.perf_counter())]
    )
    # Its end was read across the two chunks: nothing is added.
    assert received == sent


@pytest.mark.asyncio
async def test_a_stream_the_page_closes_early_is_logged(caplog) -> None:
    caplog.set_level(logging.NOTSET)

    async def forever() -> AsyncIterator[bytes]:
        yield b'data: {"type": "RUN_STARTED"}\n\n'
        await asyncio.sleep(3600)
        yield b""

    stream = watch_run_stream(forever(), "pap-app", time.perf_counter())
    assert b"RUN_STARTED" in await stream.__anext__()
    await stream.aclose()
    assert any(
        "closed its stream before the run ended" in r.getMessage()
        for r in caplog.records
    )


def test_httpx_default_would_have_cut_the_handshake() -> None:
    """The defaults this replaces, for the record: both shorter than a cold worker."""
    assert httpx.AsyncClient().timeout.read == 5.0
