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

Opening a session is retried on what heals by itself — a refused connection, a
TLS failure while an ingress is reinstalled, an initialize that failed, a 502,
503 or 504 — ``retries`` times with exponential waits. A tool call is never
retried: once it reached the server, repeating it could repeat a write.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Iterable, Mapping, Optional
from urllib.parse import quote

from agent_runtimes.mcp.datalayer_gateway import gateway_url

__all__ = [
    "DEFAULT_RETRIES",
    "DEFAULT_RETRY_WAIT",
    "DEFAULT_TOKEN_ENV",
    "HostedMCPClient",
    "MCPConnectError",
    "MCPToolError",
    "coerce_arguments",
    "coerce_value",
    "connect",
    "decode_result",
    "endpoint_url",
    "gateway_health",
    "health_urls",
    "list_toolsets",
    "result_text",
    "toolsets_url",
]

logger = logging.getLogger(__name__)

#: The environment variable the bearer token is read from by default.
DEFAULT_TOKEN_ENV = "DATALAYER_API_KEY"

#: How many times opening a session is tried again, and the first wait (s);
#: each next wait doubles.
DEFAULT_RETRIES = 2
DEFAULT_RETRY_WAIT = 1.0

#: The statuses of a gateway or ingress in the middle of a rollout.
RETRY_STATUSES = frozenset({502, 503, 504})


class MCPToolError(RuntimeError):
    """A tool answered with `isError`: the server's own words are kept."""

    def __init__(self, tool: str, text: str, result: Any = None) -> None:
        super().__init__(f"{tool}: {text}")
        self.tool = tool
        self.text = text
        self.result = result


class MCPConnectError(RuntimeError):
    """The session could not be opened, retries spent: the message is a diagnosis."""

    def __init__(
        self, message: str, *, status: Optional[int] = None, attempts: int = 1
    ) -> None:
        super().__init__(message)
        self.status = status
        self.attempts = attempts


def _innermost(error: BaseException) -> BaseException:
    """The error itself, through anyio's exception groups."""
    while getattr(error, "exceptions", None):
        error = error.exceptions[0]  # type: ignore[attr-defined]
    return error


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


def _beside_mcp(url: Optional[str]) -> tuple[str, str]:
    """The address an MCP endpoint sits under, and the query it carries."""
    base, _, query = (url or gateway_url()).partition("?")
    base = base.rstrip("/")
    return (base[: -len("/mcp")] if base.endswith("/mcp") else base), query


def health_urls(url: Optional[str] = None) -> dict[str, str]:
    """The gateway's readiness and liveness addresses, beside its `/mcp` endpoint."""
    base, _ = _beside_mcp(url)
    return {
        "readyz": f"{base}/api/mcp/readyz",
        "healthz": f"{base}/api/mcp/healthz",
    }


def toolsets_url(
    url: Optional[str] = None,
    toolsets: Iterable[str] = (),
    params: Optional[Mapping[str, Any]] = None,
    only: bool = False,
) -> str:
    """The gateway's `/toolsets` listing, beside its `/mcp` endpoint."""
    base, query = _beside_mcp(url)
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
    MCP dict.

    A result with no content answers its structured content, if any: the
    items of a wrapped list (``{"result": [...]}``, how FastMCP wraps a tool
    returning a list, which an empty search answers with no content at all),
    or the structured content itself.
    """
    contents = list(getattr(result, "content", None) or [])
    if not contents:
        structured = getattr(result, "structured_content", None)
        if structured is None:
            return []
        if set(structured) == {"result"} and isinstance(structured["result"], list):
            return list(structured["result"])
        return [structured]
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


def _resolve(schema: Any, root: Mapping[str, Any]) -> dict[str, Any]:
    """A schema, through a local ``$ref`` (``#/$defs/X``)."""
    if not isinstance(schema, dict):
        return {}
    ref = schema.get("$ref")
    if not (isinstance(ref, str) and ref.startswith("#/")):
        return schema
    node: Any = root
    for part in ref[2:].split("/"):
        node = node.get(part) if isinstance(node, dict) else None
    return node if isinstance(node, dict) else {}


_ENUM_TYPES = {str: "string", bool: "boolean", int: "integer", float: "number"}


def _schema_types(schema: Any, root: Mapping[str, Any], depth: int = 0) -> set[str]:
    """The JSON types a property's schema allows; empty when it does not say."""
    schema = _resolve(schema, root)
    declared = schema.get("type")
    types = {declared} if isinstance(declared, str) else set()
    if isinstance(declared, list):
        types.update(name for name in declared if isinstance(name, str))
    if depth < 8:
        for key in ("anyOf", "oneOf", "allOf"):
            for member in schema.get(key) or []:
                types |= _schema_types(member, root, depth + 1)
    if not types and isinstance(schema.get("enum"), list):
        types = {
            _ENUM_TYPES[type(value)]
            for value in schema["enum"]
            if type(value) in _ENUM_TYPES
        }
    if not types and "properties" in schema:
        types.add("object")
    if not types and "items" in schema:
        types.add("array")
    return types


def coerce_value(
    value: Any,
    schema: Any,
    root: Optional[Mapping[str, Any]] = None,
    *,
    from_text: bool = False,
) -> Any:
    """
    One argument as its property's schema types it.

    A string for a string-typed property stays a string, however much it looks
    like a number (an invoice number ``1618720029``); for an integer, number,
    boolean, array or object property it is decoded as JSON. A number for a
    string-only property becomes its text.

    Parameters
    ----------
    value : Any
        The argument.
    schema : Any
        The property's schema.
    root : Mapping[str, Any], optional
        The input schema the property is in, for its ``$ref``s.
    from_text : bool
        The value is text from a command line: decode it as JSON when the
        schema does not say its type (and keep it a string when not JSON).
    """
    types = _schema_types(schema, root if root is not None else schema or {})
    if isinstance(value, str):
        if not types:
            return _decode_text(value) if from_text else value
        if "string" in types:
            return value
        if "boolean" in types and value.lower() in ("true", "false"):
            return value.lower() == "true"
        return _decode_text(value)
    if (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and "string" in types
        and not types & {"integer", "number"}
    ):
        return str(value)
    return value


def coerce_arguments(
    arguments: Mapping[str, Any],
    input_schema: Optional[Mapping[str, Any]],
    *,
    from_text: bool = False,
) -> dict[str, Any]:
    """Each argument through :func:`coerce_value`, by the tool's input schema."""
    root = dict(input_schema or {})
    properties = root.get("properties") or {}
    return {
        key: coerce_value(value, properties.get(key), root, from_text=from_text)
        for key, value in arguments.items()
    }


class HostedMCPClient:
    """One initialized MCP session, with calls that read the gateway's answers."""

    def __init__(self, session: Any, url: str = "") -> None:
        self.session = session
        self.url = url
        self._tools: Optional[dict[str, Any]] = None

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
                self._tools = {candidate.name: candidate for candidate in tools}
                return tools

    async def describe(self, tool: str) -> Any:
        """One tool's definition; `KeyError` when the session has none by that name.

        The session's tools are listed once and kept: a session's tools are fixed.
        """
        if self._tools is None:
            await self.list_tools()
        assert self._tools is not None
        return self._tools[tool]

    async def coerce(
        self, tool: str, arguments: Mapping[str, Any], *, from_text: bool = False
    ) -> dict[str, Any]:
        """`arguments` typed by the tool's input schema (see :func:`coerce_value`).

        A tool the session does not have leaves them as they are (decoded as
        JSON `from_text`): the server's refusal says more.
        """
        try:
            schema = (await self.describe(tool)).input_schema
        except KeyError:
            schema = {}
        return coerce_arguments(arguments, schema, from_text=from_text)

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

    async def call(
        self, tool: str, /, *, coerce: bool = False, **arguments: Any
    ) -> list[Any]:
        """
        Call a tool and decode what it answered.

        Parameters
        ----------
        tool : str
            The tool's name.
        coerce : bool
            Type the arguments by the tool's input schema first (an ``int``
            for a string property is sent as its text, ``"5"`` for an integer
            one as ``5``); the schema is fetched once per session.
        **arguments
            The tool's arguments.

        Returns
        -------
        list[Any]
            One value per content: JSON-decoded text, or the text itself.

        Raises
        ------
        MCPToolError
            When the tool answered with `isError`, or the server refused the
            request with a JSON-RPC error, carrying its text.
        """
        from mcp.shared.exceptions import MCPError  # noqa: PLC0415

        if coerce:
            arguments = await self.coerce(tool, arguments)
        try:
            result = await self.call_raw(tool, **arguments)
        except MCPError as error:
            raise MCPToolError(tool, error.message) from error
        if result.is_error:
            raise MCPToolError(tool, result_text(result), result)
        return decode_result(result)


def _retryable(error: BaseException, status: Optional[int]) -> bool:
    """Whether opening a session may succeed if tried again."""
    if status is not None:
        return status in RETRY_STATUSES
    import anyio  # noqa: PLC0415
    import httpx2  # noqa: PLC0415
    from mcp.shared.exceptions import MCPError  # noqa: PLC0415

    return isinstance(
        _innermost(error),
        (
            MCPError,
            OSError,
            TimeoutError,
            httpx2.TransportError,
            anyio.BrokenResourceError,
            anyio.ClosedResourceError,
            anyio.EndOfStream,
        ),
    )


def _diagnosis(
    error: BaseException, status: Optional[int], attempts: int, address: str
) -> str:
    """One line saying what failed and where to look."""
    readyz = health_urls(address)["readyz"]
    tries = f"after {attempts} attempt{'s' if attempts > 1 else ''}"
    if status is not None:
        if status in (401, 403):
            return (
                f"the server answered {status} at initialize ({tries}): check the token"
            )
        return f"the server answered {status} at initialize ({tries}): check {readyz}"
    inner = _innermost(error)
    text = f"{type(inner).__name__}: {inner}"
    if "CERTIFICATE_VERIFY_FAILED" in text:
        return (
            f"the TLS certificate was refused ({tries}): {text} — an ingress "
            "being reinstalled serves a self-signed certificate for a while"
        )
    return f"connect/initialize failed ({tries}): {text}; check {readyz}"


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
    retries: int = DEFAULT_RETRIES,
    retry_wait: float = DEFAULT_RETRY_WAIT,
    on_retry: Optional[Callable[[str], None]] = None,
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
    retries : int
        How many more times opening the session is tried when it fails on a
        connection, TLS or initialize error, or a 502, 503 or 504. Another
        status (401, 404) fails at once. Calls made on the session are never
        retried.
    retry_wait : float
        The first wait in seconds; each next one doubles.
    on_retry : Callable[[str], None], optional
        Told one line per retry; a warning is logged when omitted.

    Yields
    ------
    HostedMCPClient
        The initialized session.

    Raises
    ------
    MCPConnectError
        When the session could not be opened, with a one-line diagnosis.
    """
    import anyio  # noqa: PLC0415
    from mcp.client.session import ClientSession  # noqa: PLC0415
    from mcp.client.streamable_http import streamable_http_client  # noqa: PLC0415
    from mcp.shared._httpx_utils import create_mcp_http_client  # noqa: PLC0415

    address = endpoint_url(url, toolsets, params, only)
    request_headers = _headers(token, token_env, headers)
    tell = on_retry or logger.warning
    attempts = max(0, retries) + 1
    for attempt in range(1, attempts + 1):
        statuses: list[int] = []

        async def note(response: Any, statuses: list[int] = statuses) -> None:
            # The transport turns a failed POST into "Server returned an error
            # response"; the status says whether waiting can help.
            if response.request.method == "POST" and response.status_code >= 400:
                statuses.append(response.status_code)

        opened = False
        try:
            http_client = create_mcp_http_client(headers=request_headers)
            http_client.event_hooks = {"response": [note]}
            async with http_client:
                async with streamable_http_client(
                    address, http_client=http_client
                ) as streams:
                    read, write = streams[0], streams[1]
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        opened = True
                        yield HostedMCPClient(session, address)
            return
        except Exception as error:
            if opened:
                raise
            status = statuses[-1] if statuses else None
            if attempt < attempts and _retryable(error, status):
                wait = retry_wait * 2 ** (attempt - 1)
                inner = _innermost(error)
                why = f"HTTP {status}" if status else f"{type(inner).__name__}: {inner}"
                tell(
                    f"MCP session attempt {attempt}/{attempts} failed ({why}); "
                    f"retrying in {wait:g}s"
                )
                await anyio.sleep(wait)
                continue
            raise MCPConnectError(
                _diagnosis(error, status, attempt, address),
                status=status,
                attempts=attempt,
            ) from error


async def gateway_health(
    url: Optional[str] = None,
    *,
    headers: Optional[Mapping[str, str]] = None,
    timeout: float = 15.0,
) -> list[dict[str, Any]]:
    """
    The gateway's `readyz` and `healthz`, beside its `/mcp` endpoint.

    Returns
    -------
    list[dict[str, Any]]
        One entry per probe: ``name``, ``url``, ``status`` (None when it could
        not be reached), ``body`` (decoded JSON, or text) and ``error``.
    """
    import httpx  # noqa: PLC0415

    answers: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        for name, address in health_urls(url).items():
            entry: dict[str, Any] = {"name": name, "url": address, "status": None}
            try:
                response = await http.get(address, headers=dict(headers or {}))
            except httpx.HTTPError as error:
                entry["error"] = f"{type(error).__name__}: {error}"
            else:
                entry["status"] = response.status_code
                entry["body"] = _decode_text(response.text)
            answers.append(entry)
    return answers


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
