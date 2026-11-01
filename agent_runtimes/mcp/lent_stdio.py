# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A lent gateway toolset, the credential held by the runtime alone (SH-14).

Whatever a harness holds, what it runs can read: the commands the model writes
run as the same user, so a file it could open, or its own memory, is theirs.
So a harness is lent no credential at all. The runtime holds the toolset's URL and
the execution credential here, in this process's memory, under an opaque handle
(:func:`hold`), and answers the handle on the pod's loopback
(`routes.mcp_lent`), adding the bearer as it forwards to the gateway. On a
deployment's runtime this process is unreadable by its own user
(`principal._keep_from_this_user`), so the credential is out of reach of every
command; the handle is not, and what it gives is the toolset itself, which the
harness already has: the gateway's policy, approvals, custody and audit apply to
every call.

A harness that advertises ``mcpCapabilities.http`` is given that local address as
an HTTP server. One that does not is given this shim as a stdio MCP server, which
forwards ``tools/list`` and ``tools/call`` to the same address::

    python -m agent_runtimes.mcp.lent_stdio --lent <its local address>
"""

from __future__ import annotations

import argparse
import asyncio
import secrets
import sys
from typing import Any

__all__ = ["carry", "held", "hold", "lent_url", "release", "serve"]

#: What this runtime lent, by handle. Process memory only: never a file, an
#: environment or an argument, all of which a harness's commands read.
_LENT: dict[str, dict[str, str]] = {}


def hold(name: str, url: str, token: str) -> str:
    """
    Hold a lent toolset's URL and credential, under an opaque handle.

    Parameters
    ----------
    name : str
        The toolset's name, as the harness sees it.
    url : str
        The gateway toolset's URL.
    token : str
        The execution credential.

    Returns
    -------
    str
        The handle; never the token.
    """
    if not token:
        raise ValueError(f"Nothing to hold for {name!r}: the credential is empty.")
    handle = secrets.token_urlsafe(32)
    _LENT[handle] = {"name": name, "url": url, "token": token}
    return handle


def lent_url(handle: str) -> str:
    """Where a harness reaches what a handle holds: the pod's loopback."""
    from agent_runtimes.apps.visitors import loopback_url

    return f"{loopback_url()}/api/v1/mcp/lent/{handle}"


def carry(handle: str, traceparent: str | None) -> None:
    """
    Carry the turn's trace: the ``traceparent`` the gateway is sent from now on (SH-51).

    The toolset is one connection for the session, so what is sent per call is
    read at each call; the runtime sets the current turn's context here before
    each prompt. ``None`` clears it: no trace, no header, never an invented one.

    Parameters
    ----------
    handle : str
        The handle.
    traceparent : str | None
        The W3C trace context of the turn, or nothing.
    """
    kept = held(handle)
    if traceparent:
        kept["traceparent"] = traceparent
    else:
        kept.pop("traceparent", None)


def held(handle: str) -> dict[str, str]:
    """
    What a handle holds; a refusal in a sentence for one that holds nothing.

    Parameters
    ----------
    handle : str
        The handle.

    Returns
    -------
    dict[str, str]
        ``{"name", "url", "token"}``, and the turn's ``traceparent``.
    """
    kept = _LENT.get(handle)
    if kept is None:
        raise ValueError(
            "This handle holds nothing: the session that lent it has ended."
        )
    return kept


def release(handle: str) -> None:
    """
    Forget what a handle held.

    Parameters
    ----------
    handle : str
        The handle.
    """
    _LENT.pop(handle, None)


async def serve(url: str) -> None:
    """
    Serve the lent toolset over stdio, forwarding to the runtime that holds it.

    Parameters
    ----------
    url : str
        The toolset's local address (:func:`lent_url`).
    """
    import mcp.types as types
    from mcp.client.session import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    from mcp.server.lowlevel import Server
    from mcp.server.stdio import stdio_server
    from mcp.shared._httpx_utils import create_mcp_http_client

    http_client = create_mcp_http_client()
    async with streamable_http_client(url, http_client=http_client) as streams:
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
                "datalayer-lent",
                on_list_tools=list_tools,
                on_call_tool=call_tool,
            )
            async with stdio_server() as (read_stream, write_stream):
                await server.run(
                    read_stream, write_stream, server.create_initialization_options()
                )


def main(argv: list[str] | None = None) -> int:
    """
    The entry: ``python -m agent_runtimes.mcp.lent_stdio --lent <its local address>``.

    Parameters
    ----------
    argv : list[str], optional
        The arguments; the process's when None.

    Returns
    -------
    int
        The exit code.
    """
    parser = argparse.ArgumentParser(description="A lent gateway toolset over stdio.")
    parser.add_argument(
        "--lent", required=True, help="The toolset's address, as the runtime gave it."
    )
    args = parser.parse_args(argv)
    asyncio.run(serve(args.lent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
