# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A plain MCP client: the Datalayer gateway, or any MCP server, from Python.

One session, opened once, used for as many calls as a script needs::

    from agent_runtimes.mcp.hosted_client import connect

    async with connect(toolsets=["odoo-accounting"], params={"odoo-company": 1}) as client:
        tools = await client.list_tools()
        [account] = await client.call("odoo_get_account")

The gateway answers a tool with its result as JSON *text* content and no
structured content, even for a tool that declares an output schema. The SDK's
`ClientSession.call_tool` refuses such an answer ("has an output schema but did
not return structured content"), so a tool is called with a raw `tools/call`
request here, and each text content is decoded as JSON when it is JSON.

The gateway's toolsets are chosen in the query string of its address:
``…/mcp?odoo,odoo-accounting&odoo-company=2`` adds `odoo` and `odoo-accounting`
to the default toolsets, ``…/mcp?only=odoo-accounting`` gives that toolset
alone; the other ``key=value`` pairs are the session's parameters.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Iterable, Mapping, Optional
from urllib.parse import quote

from agent_runtimes.mcp.datalayer_gateway import gateway_url

__all__ = [
    "DEFAULT_TOKEN_ENV",
    "HostedMCPClient",
    "MCPToolError",
    "connect",
    "decode_result",
    "endpoint_url",
    "list_toolsets",
    "result_text",
    "toolsets_url",
]

#: The environment variable the bearer token is read from by default.
DEFAULT_TOKEN_ENV = "DATALAYER_API_KEY"


class MCPToolError(RuntimeError):
    """A tool answered with `isError`: the server's own words are kept."""

    def __init__(self, tool: str, text: str, result: Any = None) -> None:
        super().__init__(f"{tool}: {text}")
        self.tool = tool
        self.text = text
        self.result = result


def _query(
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
) -> str:
    names = [name.strip() for name in toolsets if name and name.strip()]
    parts: list[str] = []
    if names:
        joined = ",".join(quote(name, safe="-_.") for name in names)
        parts.append(f"only={joined}" if only else joined)
    elif only:
        raise ValueError("`only` needs at least one toolset.")
    for key, value in (params or {}).items():
        parts.append(f"{quote(str(key), safe='-_.')}={quote(str(value), safe='-_.,')}")
    return "&".join(parts)


def _with_query(url: str, query: str) -> str:
    if not query:
        return url
    return f"{url}{'&' if '?' in url else '?'}{query}"


def endpoint_url(
    url: Optional[str] = None,
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
) -> str:
    """
    The address a session is opened at.

    Parameters
    ----------
    url : str, optional
        The MCP endpoint; the gateway's (``DATALAYER_MCP_SERVER_URL``, or the
        hosted one) when omitted. A query it already carries is kept.
    toolsets : Iterable[str]
        The gateway toolsets to add to its defaults.
    params : Mapping[str, Any], optional
        The session's ``key=value`` parameters (``odoo-company=2``).
    only : bool
        Give exactly `toolsets`, without the gateway's defaults.

    Returns
    -------
    str
        ``url`` with the toolsets and parameters in its query string.
    """
    base = (url or gateway_url()).rstrip("/")
    return _with_query(base, _query(toolsets, params, only))


def toolsets_url(
    url: Optional[str] = None,
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
) -> str:
    """The gateway's `/toolsets` listing, beside its `/mcp` endpoint."""
    base, _, query = (url or gateway_url()).partition("?")
    base = base.rstrip("/")
    base = base[: -len("/mcp")] if base.endswith("/mcp") else base
    listing = f"{base}/toolsets"
    if query:
        listing = f"{listing}?{query}"
    return _with_query(listing, _query(toolsets, params, only))


def _headers(
    token: Optional[str], token_env: str, headers: Optional[Mapping[str, str]]
) -> dict[str, str]:
    merged = dict(headers or {})
    bearer = token if token is not None else os.environ.get(token_env, "")
    # No token, no header: an empty Bearer is not an anonymous request.
    if bearer and not any(key.lower() == "authorization" for key in merged):
        merged["Authorization"] = f"Bearer {bearer}"
    return merged


def _decode_text(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError:
        return text


def decode_result(result: Any) -> list[Any]:
    """
    A tool's answer as Python values.

    Each text content is decoded as JSON when it is JSON, and kept as text
    otherwise; any other content (an image, a resource) is kept as its
    MCP dict. A result with no content but structured content answers that.
    """
    contents = list(getattr(result, "content", None) or [])
    if not contents and getattr(result, "structured_content", None) is not None:
        return [result.structured_content]
    decoded: list[Any] = []
    for content in contents:
        text = getattr(content, "text", None)
        if isinstance(text, str):
            decoded.append(_decode_text(text))
        else:
            decoded.append(content.model_dump(by_alias=True, exclude_none=True))
    return decoded


def result_text(result: Any) -> str:
    """The text contents of a result, joined: what an error says."""
    texts = [
        content.text
        for content in getattr(result, "content", None) or []
        if isinstance(getattr(content, "text", None), str)
    ]
    return "\n".join(texts) or "(no text in the error result)"


class HostedMCPClient:
    """One initialized MCP session, with calls that read the gateway's answers."""

    def __init__(self, session: Any, url: str = "") -> None:
        self.session = session
        self.url = url

    async def list_tools(self) -> list[Any]:
        """Every tool of the session (`mcp.types.Tool`), across pages."""
        from mcp.types import PaginatedRequestParams  # noqa: PLC0415

        tools: list[Any] = []
        cursor: Optional[str] = None
        while True:
            page = await self.session.list_tools(
                params=PaginatedRequestParams(cursor=cursor) if cursor else None
            )
            tools.extend(page.tools)
            cursor = page.next_cursor
            if not cursor:
                return tools

    async def describe(self, tool: str) -> Any:
        """One tool's definition; `KeyError` when the session has none by that name."""
        for candidate in await self.list_tools():
            if candidate.name == tool:
                return candidate
        raise KeyError(tool)

    async def call_raw(self, tool: str, /, **arguments: Any) -> Any:
        """The `CallToolResult` as the server sent it, error or not."""
        from mcp.types import (  # noqa: PLC0415
            CallToolRequest,
            CallToolRequestParams,
            CallToolResult,
        )

        return await self.session.send_request(
            CallToolRequest(
                method="tools/call",
                params=CallToolRequestParams(name=tool, arguments=arguments),
            ),
            CallToolResult,
        )

    async def call(self, tool: str, /, **arguments: Any) -> list[Any]:
        """
        Call a tool and decode what it answered.

        Returns
        -------
        list[Any]
            One value per content: JSON-decoded text, or the text itself.

        Raises
        ------
        MCPToolError
            When the tool answered with `isError`, carrying its text.
        """
        result = await self.call_raw(tool, **arguments)
        if result.is_error:
            raise MCPToolError(tool, result_text(result), result)
        return decode_result(result)


@asynccontextmanager
async def connect(
    url: Optional[str] = None,
    *,
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
    token: Optional[str] = None,
    token_env: str = DEFAULT_TOKEN_ENV,
    headers: Optional[Mapping[str, str]] = None,
) -> AsyncIterator[HostedMCPClient]:
    """
    Open and initialize one streamable-HTTP MCP session.

    Parameters
    ----------
    url : str, optional
        The MCP endpoint; the Datalayer gateway when omitted.
    toolsets, params, only
        The gateway's query string, see :func:`endpoint_url`.
    token : str, optional
        The bearer token; read from `token_env` when omitted. No token sends
        no ``Authorization`` header.
    token_env : str
        The environment variable holding the token.
    headers : Mapping[str, str], optional
        Extra request headers; an ``Authorization`` among them wins.

    Yields
    ------
    HostedMCPClient
        The initialized session.
    """
    from mcp.client.session import ClientSession  # noqa: PLC0415
    from mcp.client.streamable_http import streamable_http_client  # noqa: PLC0415
    from mcp.shared._httpx_utils import create_mcp_http_client  # noqa: PLC0415

    address = endpoint_url(url, toolsets, params, only)
    http_client = create_mcp_http_client(headers=_headers(token, token_env, headers))
    async with http_client:
        async with streamable_http_client(address, http_client=http_client) as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield HostedMCPClient(session, address)


async def list_toolsets(
    url: Optional[str] = None,
    *,
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
    token: Optional[str] = None,
    token_env: str = DEFAULT_TOKEN_ENV,
    headers: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    """
    The gateway's toolsets, and which the given query would make active.

    Returns
    -------
    dict[str, Any]
        The gateway's answer: ``toolsets`` (each with ``name``,
        ``description``, ``default``, ``active``), ``active``, ``tools`` and
        ``unknown`` (toolsets named in the query the gateway does not have).
    """
    import httpx  # noqa: PLC0415

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http:
        response = await http.get(
            toolsets_url(url, toolsets, params, only),
            headers=_headers(token, token_env, headers),
        )
    if response.status_code >= 400:
        raise RuntimeError(
            f"{response.request.url.copy_with(query=None)} answered "
            f"{response.status_code}: {response.text[:400]}"
        )
    return response.json()
