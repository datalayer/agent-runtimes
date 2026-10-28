# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A remote MCP server, reached at its url with its headers, no process.

A catalogue server with ``transport: streamable-http``, a ``url`` and no
``command`` (the Datalayer MCP gateway's toolsets: ``odoo-accounting``,
``earthdata``, ``datalayer``) is connected to here over Streamable HTTP, the
bearer in its ``headers`` sent with every request. Nothing is fetched and
nothing is spawned: a runtime pod reaches the gateway and no package registry,
so the ``npx -y mcp-remote`` shim these servers went through could never start
there (28 October 2026: the home page's demo scenes answered "the tools could
not be reached").

The gateway refuses a handshake in a sentence — a wrong key is *"This request
carries a token that could not be attributed to a Datalayer user …"*, answered
as a JSON-RPC error with no id at HTTP 200; a 401 or 403 carries its ``detail``
— and the MCP client reads neither: it waits for the answer to its
``initialize`` until the handshake's deadline, then says *"Failed to initialize
server session"*. :func:`refusals_client_factory` reads every answer of the
handshake and, at the first that refuses, keeps the server's sentence on its
:class:`Refusals` and raises :class:`McpServerRefused`, so the start fails at
once and :attr:`MCPLifecycleManager._failed_servers` says what the gateway
said. Once the server has answered the handshake the hook stands down
(:meth:`Refusals.stand_down`): a tool's refusal at run time reaches the model
the way every tool error does.
"""

from __future__ import annotations

import json
import logging
from typing import Any

# The MCP SDK (2.x) and fastmcp speak httpx2: the transport's client is one
# of its, and so are the responses the hook reads.
import httpx2

from agent_runtimes.guardrails.credentials import redact

__all__ = [
    "McpServerRefused",
    "Refusals",
    "refusal_sentence",
    "refusals_client_factory",
    "remote_toolset",
]

logger = logging.getLogger(__name__)


class McpServerRefused(RuntimeError):
    """A remote MCP server refused the handshake: the sentence it answered."""


class Refusals:
    """
    What a remote server answered the handshake with, when it refused it.

    Parameters
    ----------
    server_id : str
        The server, as the catalogue names it.
    url : str
        Where it is reached.
    """

    def __init__(self, server_id: str, url: str) -> None:
        self.server_id = server_id
        self.url = url
        #: The sentence the start failed with, once one did.
        self.sentence: str | None = None
        #: Whether an answer that refuses ends the handshake.
        self.armed = True

    def stand_down(self) -> None:
        """The handshake is over: a refusal from now on is the tool's to say."""
        self.armed = False

    def refused(self, status: int, sentence: str) -> str:
        """
        Keep the server's sentence, said as the start's failure.

        Parameters
        ----------
        status : int
            The HTTP status it was answered at.
        sentence : str
            What the server said.

        Returns
        -------
        str
            The failure, which names the server, its url and the status when
            the status itself refused.
        """
        where = f" (HTTP {status})" if status >= 400 else ""
        self.sentence = redact(
            f"MCP server '{self.server_id}' at {self.url} refused the "
            f"handshake{where}: {sentence}"
        )
        return self.sentence


def refusal_sentence(status: int, content_type: str, body: bytes) -> str | None:
    """
    The sentence an answer refuses with, or nothing for one that refuses nothing.

    Parameters
    ----------
    status : int
        The answer's HTTP status.
    content_type : str
        Its ``Content-Type``.
    body : bytes
        Its body, read whole.

    Returns
    -------
    str | None
        A JSON-RPC error's ``message`` at any status (the gateway's wrong-key
        answer comes at 200, with no id); at 400 and above, the ``detail``,
        ``error`` or ``message`` of a JSON body, else the body's text, else
        the status alone; ``None`` for an answer that refuses nothing.
    """
    text = body.decode("utf-8", errors="replace").strip()
    if content_type.lower().startswith("application/json"):
        try:
            data: Any = json.loads(text) if text else None
        except ValueError:
            data = None
        if isinstance(data, dict):
            error = data.get("error")
            if isinstance(error, dict) and isinstance(error.get("message"), str):
                return str(error["message"])
            if status >= 400:
                for key in ("detail", "error", "message"):
                    if isinstance(data.get(key), str) and data[key].strip():
                        return str(data[key]).strip()
    if status >= 400:
        return text or f"HTTP {status}"
    return None


def refusals_client_factory(refusals: Refusals) -> Any:
    """
    The MCP client's httpx factory, reading the handshake's answers for a refusal.

    Parameters
    ----------
    refusals : Refusals
        Where a refusal is kept, and whether one still ends the handshake.

    Returns
    -------
    Callable[..., httpx2.AsyncClient]
        Builds the client the transport would build itself (the MCP timeouts:
        30 s to connect, 300 s to read a stream held open; redirects followed,
        the bearer stripped by httpx on a cross-origin one) with one response
        hook more. Takes what fastmcp passes, ``follow_redirects`` included.
    """

    async def refused(response: httpx2.Response) -> None:
        if not refusals.armed:
            return
        content_type = response.headers.get("content-type", "")
        if response.status_code < 400 and not content_type.lower().startswith(
            "application/json"
        ):
            # A stream (text/event-stream) is read by the client, not here.
            return
        body = await response.aread()
        sentence = refusal_sentence(response.status_code, content_type, body)
        if sentence is None:
            return
        raise McpServerRefused(refusals.refused(response.status_code, sentence))

    def factory(**kwargs: Any) -> httpx2.AsyncClient:
        kwargs.setdefault("timeout", httpx2.Timeout(30.0, read=300.0))
        kwargs.setdefault("follow_redirects", True)
        client = httpx2.AsyncClient(
            **{name: value for name, value in kwargs.items() if value is not None}
        )
        client.event_hooks["response"] = [
            *client.event_hooks.get("response", []),
            refused,
        ]
        return client

    return factory


def remote_toolset(
    server_id: str, url: str, headers: dict[str, str], init_timeout: float
) -> Any:
    """
    The toolset of a remote server: its url, its headers sent with every request.

    Parameters
    ----------
    server_id : str
        The server, as the catalogue names it.
    url : str
        Where it is reached, over Streamable HTTP.
    headers : dict[str, str]
        The headers of every request, expanded: the bearer among them.
    init_timeout : float
        How long the handshake is given, in seconds.

    Returns
    -------
    DisplayMCPToolset
        With its :class:`Refusals` as ``refusals``: the lifecycle reads the
        sentence a failed start was refused with there, and stands the hook
        down once the server has answered.
    """
    from fastmcp.client.transports import StreamableHttpTransport

    from agent_runtimes.mcp.displays import DisplayMCPToolset

    refusals = Refusals(server_id, url)
    toolset = DisplayMCPToolset(
        StreamableHttpTransport(
            url,
            headers=dict(headers),
            httpx_client_factory=refusals_client_factory(refusals),
        ),
        id=server_id,
        init_timeout=init_timeout,
    )
    toolset.refusals = refusals
    return toolset
