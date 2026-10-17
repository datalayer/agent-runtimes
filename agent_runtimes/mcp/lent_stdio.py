# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A lent gateway toolset over stdio, the credential held here (SH-14).

A harness that advertises no ``mcpCapabilities.http`` cannot be given the
gateway's toolset as an HTTP server with a bearer header; it is given this
shim instead, as a stdio MCP server::

    python -m agent_runtimes.mcp.lent_stdio --lent <handle>

The handle is opaque. The toolset's URL and the execution credential are
**held** by the runtime in a file of the Shield's home (``lent/<handle>``,
readable by its owner only, removed when the session ends) and read by this
process: nothing of the credential is in the harness's arguments or its
environment, and the audit never carries it. The shim forwards ``tools/list``
and ``tools/call`` to the gateway over Streamable HTTP with the bearer, so the
gateway's policy, approvals, custody and audit apply to every call.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any

from agent_shield.config import home

__all__ = ["LENT_DIR", "carry", "held", "hold", "lent_dir", "release", "serve"]

#: Where the runtime holds what it lent, under the Shield's home.
LENT_DIR = "lent"


def lent_dir(base: Path | None = None) -> Path:
    """
    The directory the handles live in: the Shield's home, or ``base``.

    Parameters
    ----------
    base : Path, optional
        The Shield's home, for a test.

    Returns
    -------
    Path
        ``<home>/lent``, created, readable by its owner only.
    """
    directory = (base or home()) / LENT_DIR
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    return directory


def hold(name: str, url: str, token: str, *, base: Path | None = None) -> str:
    """
    Hold a lent toolset's URL and credential for the shim, under an opaque handle.

    Parameters
    ----------
    name : str
        The toolset's name, as the harness sees it.
    url : str
        The gateway toolset's URL.
    token : str
        The execution credential.
    base : Path, optional
        The Shield's home, for a test.

    Returns
    -------
    str
        The handle the shim is given; never the token.
    """
    if not token:
        raise ValueError(f"Nothing to hold for {name!r}: the credential is empty.")
    handle = secrets.token_urlsafe(18)
    path = lent_dir(base) / handle
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as kept:
        json.dump({"name": name, "url": url, "token": token}, kept)
    return handle


def carry(handle: str, traceparent: str | None, *, base: Path | None = None) -> None:
    """
    Carry the turn's trace to the shim: the ``traceparent`` it sends the gateway from now on (SH-51).

    The shim is one process for the session, so what it sends per call is
    read from the handle at each call; the runtime writes the current turn's
    context here before each prompt. ``None`` clears it: no trace, no header,
    never an invented one.

    Parameters
    ----------
    handle : str
        The handle the shim was given.
    traceparent : str | None
        The W3C trace context of the turn, or nothing.
    base : Path, optional
        The Shield's home, for a test.
    """
    kept = held(handle, base=base)
    if traceparent:
        kept["traceparent"] = traceparent
    else:
        kept.pop("traceparent", None)
    path = lent_dir(base) / handle
    path.write_text(json.dumps(kept), encoding="utf-8")


def held(handle: str, *, base: Path | None = None) -> dict[str, str]:
    """
    What a handle holds; a refusal in a sentence for one that holds nothing.

    Parameters
    ----------
    handle : str
        The handle the shim was given.
    base : Path, optional
        The Shield's home, for a test.

    Returns
    -------
    dict[str, str]
        ``{"name", "url", "token"}``.
    """
    if not handle or "/" in handle or handle.startswith("."):
        raise ValueError(f"{handle!r} is not a handle.")
    path = lent_dir(base) / handle
    if not path.is_file():
        raise ValueError(
            f"The handle {handle!r} holds nothing: the session that lent it has ended."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def release(handle: str, *, base: Path | None = None) -> None:
    """
    Forget what a handle held.

    Parameters
    ----------
    handle : str
        The handle.
    base : Path, optional
        The Shield's home, for a test.
    """
    path = lent_dir(base) / handle
    if path.is_file():
        path.unlink()


async def serve(handle: str, *, base: Path | None = None) -> None:
    """
    Serve the lent toolset over stdio, forwarding to the gateway with the credential.

    Parameters
    ----------
    handle : str
        The handle the runtime gave.
    base : Path, optional
        The Shield's home, for a test.
    """
    import mcp.types as types
    from mcp.client.session import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    from mcp.server.lowlevel import Server
    from mcp.server.stdio import stdio_server
    from mcp.shared._httpx_utils import create_mcp_http_client

    lent = held(handle, base=base)
    http_client = create_mcp_http_client(
        headers={"Authorization": f"Bearer {lent['token']}"}
    )

    async def with_turn_trace(request: Any) -> None:
        # The turn's trace, as the runtime carried it to the handle (SH-51):
        # read per request, since the turn changes while this process does not.
        try:
            traceparent = held(handle, base=base).get("traceparent")
        except ValueError:
            return
        if traceparent and "traceparent" not in request.headers:
            request.headers["traceparent"] = traceparent

    http_client.event_hooks["request"] = [
        *http_client.event_hooks.get("request", []),
        with_turn_trace,
    ]
    async with streamable_http_client(lent["url"], http_client=http_client) as streams:
        async with ClientSession(streams[0], streams[1]) as gateway:
            await gateway.initialize()

            async def list_tools(_context: Any, params: Any) -> types.ListToolsResult:
                return await gateway.list_tools()

            async def call_tool(
                _context: Any, params: types.CallToolRequestParams
            ) -> types.CallToolResult:
                # Raw, as the gateway answers its tools as JSON text content
                # and the SDK's `call_tool` refuses that beside an output schema.
                return await gateway.send_request(
                    types.CallToolRequest(method="tools/call", params=params),
                    types.CallToolResult,
                )

            server: Server[Any] = Server(
                f"datalayer-lent:{lent['name']}",
                on_list_tools=list_tools,
                on_call_tool=call_tool,
            )
            async with stdio_server() as (read_stream, write_stream):
                await server.run(
                    read_stream, write_stream, server.create_initialization_options()
                )


def main(argv: list[str] | None = None) -> int:
    """
    The entry: ``python -m agent_runtimes.mcp.lent_stdio --lent <handle>``.

    Parameters
    ----------
    argv : list[str], optional
        The arguments; the process's when None.

    Returns
    -------
    int
        The exit code: 2 for a handle that holds nothing.
    """
    parser = argparse.ArgumentParser(description="A lent gateway toolset over stdio.")
    parser.add_argument("--lent", required=True, help="The handle the runtime gave.")
    args = parser.parse_args(argv)
    try:
        asyncio.run(serve(args.lent))
    except ValueError as refused:
        print(f"lent_stdio: {refused}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
