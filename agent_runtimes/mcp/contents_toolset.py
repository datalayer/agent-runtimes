# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP tools reached through a Datalayer Contents session.

An MCP source in Contents is a server somebody connected: Contents holds its
credential and knows its transport and endpoint. An agent never sees any of
that. What it gets is a *session* — the tools the source allows, narrowed to
what the caller asked for — and every call goes ``POST
/mcp-sessions/{uid}/calls`` with the caller's own token. Contents makes the
connection, applies the approval and destination policies, and answers with a
call record; a call that moved bytes ends in artifacts that name a Transfer,
never in bytes inside the tool result.

Two things live here:

- :class:`ContentsMcpClient` — the small HTTP surface of Contents this needs,
  behind an interface a test can fake;
- :class:`ContentsMcpToolset` — a pydantic-ai toolset whose tools are the
  session's ``allowed_tools`` and nothing more, forwarding each call to the
  session. When Contents answers ``pending-approval`` the toolset raises the
  runtime's own tool-approval flow, keyed by the Contents approval uid, so the
  reviewer sees one approval wherever they look; the decision is relayed to
  Contents and the call is polled to its end.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol

import httpx
from pydantic_ai import RunContext
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.toolsets.abstract import AbstractToolset, ToolsetTool

logger = logging.getLogger(__name__)

#: A call the service has finished with, one way or another.
TERMINAL_CALL_STATUSES = frozenset({"denied", "succeeded", "failed", "refused"})

TokenProvider = Callable[[], str | None]


class ContentsMcpApi(Protocol):
    """What the toolset and the proxy need from Contents."""

    async def get_session(self, session_uid: str, *, token: str) -> dict[str, Any]: ...

    async def create_session(
        self,
        source_uid: str,
        *,
        token: str,
        tools: list[str] | None = None,
        sandbox_uid: str | None = None,
        expires_in: int | None = None,
    ) -> dict[str, Any]: ...

    async def discover_tools(self, source_uid: str, *, token: str) -> dict[str, Any]: ...

    async def call_tool(
        self,
        session_uid: str,
        tool: str,
        arguments: dict[str, Any],
        *,
        token: str,
        destination_uri: str | None = None,
    ) -> dict[str, Any]: ...

    async def get_call(
        self, session_uid: str, call_uid: str, *, token: str
    ) -> dict[str, Any]: ...

    async def decide_approval(
        self, approval_uid: str, decision: str, *, token: str, note: str | None = None
    ) -> dict[str, Any]: ...


class ContentsMcpError(RuntimeError):
    """Contents refused or failed a request; the message is user-facing."""


class ContentsMcpClient:
    """The Contents MCP endpoints over HTTP, one token per request."""

    def __init__(
        self, base_url: str | None = None, *, timeout: float = 60.0
    ) -> None:
        self._base_url = (base_url or _contents_url()).rstrip("/")
        self._timeout = timeout

    @property
    def base_url(self) -> str:
        return self._base_url

    def _url(self, path: str) -> str:
        return f"{self._base_url}/api/contents/v1{path}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        request_headers = {"Authorization": f"Bearer {token}", **(headers or {})}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(
                method, self._url(path), json=json, headers=request_headers
            )
        if response.status_code >= 400:
            detail: Any
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise ContentsMcpError(
                f"Contents answered {response.status_code} to {method} {path}: {detail}"
            )
        if not response.content:
            return {}
        return response.json()

    async def get_session(self, session_uid: str, *, token: str) -> dict[str, Any]:
        return await self._request("GET", f"/mcp-sessions/{session_uid}", token=token)

    async def create_session(
        self,
        source_uid: str,
        *,
        token: str,
        tools: list[str] | None = None,
        sandbox_uid: str | None = None,
        expires_in: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"source_uid": source_uid}
        if tools is not None:
            payload["tools"] = list(tools)
        if sandbox_uid is not None:
            payload["sandbox_uid"] = sandbox_uid
        if expires_in is not None:
            payload["expires_in"] = expires_in
        return await self._request("POST", "/mcp-sessions", token=token, json=payload)

    async def discover_tools(self, source_uid: str, *, token: str) -> dict[str, Any]:
        return await self._request(
            "GET", f"/sources/{source_uid}/mcp/tools", token=token
        )

    async def call_tool(
        self,
        session_uid: str,
        tool: str,
        arguments: dict[str, Any],
        *,
        token: str,
        destination_uri: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"tool": tool, "arguments": arguments}
        if destination_uri is not None:
            payload["destination_uri"] = destination_uri
        return await self._request(
            "POST", f"/mcp-sessions/{session_uid}/calls", token=token, json=payload
        )

    async def get_call(
        self, session_uid: str, call_uid: str, *, token: str
    ) -> dict[str, Any]:
        return await self._request(
            "GET", f"/mcp-sessions/{session_uid}/calls/{call_uid}", token=token
        )

    async def decide_approval(
        self, approval_uid: str, decision: str, *, token: str, note: str | None = None
    ) -> dict[str, Any]:
        if decision not in {"approve", "reject"}:
            raise ValueError(f"decision must be approve or reject, not {decision!r}")
        return await self._request(
            "POST",
            f"/mcp-approvals/{approval_uid}/{decision}",
            token=token,
            json={"note": note} if note else {},
        )


def _contents_url() -> str:
    """Where Contents is, from the same environment the rest of the runtime reads."""
    try:
        from datalayer_core.utils.urls import DatalayerURLs

        return DatalayerURLs.from_environment().contents_url
    except Exception:  # pragma: no cover - datalayer_core is a hard dependency
        import os

        return os.environ.get("DATALAYER_CONTENTS_URL", "https://prod1.datalayer.run")


_client: ContentsMcpApi | None = None


def get_contents_mcp_client() -> ContentsMcpApi:
    """The process-wide Contents client; a test installs a fake with :func:`set_contents_mcp_client`."""
    global _client
    if _client is None:
        _client = ContentsMcpClient()
    return _client


def set_contents_mcp_client(client: ContentsMcpApi | None) -> None:
    global _client
    _client = client


def _request_token() -> str | None:
    """The caller's token for the current request, when a transport set one."""
    try:
        from agent_runtimes.context.identities import get_request_user_jwt

        return get_request_user_jwt()
    except Exception:
        return None


def _result_content(call: dict[str, Any]) -> Any:
    """
    What a finished call gives the model.

    Text content becomes text; anything else stays structured. Artifacts are
    appended as a description with their handles — a Transfer uid, an object
    uid, a URL — because that is what a model can do something with. The
    bytes are not here and were never meant to be.
    """
    result = call.get("result") or {}
    content = result.get("content")
    artifacts = result.get("artifacts") or []
    if isinstance(content, list) and all(
        isinstance(item, dict) and item.get("type") == "text" for item in content
    ):
        content = "\n".join(str(item.get("text", "")) for item in content)
    if not artifacts:
        return content
    described = [
        {
            key: value
            for key, value in artifact.items()
            if key
            in {"name", "size", "media_type", "transfer_uid", "object_uid", "version_uid", "url"}
            and value is not None
        }
        for artifact in artifacts
    ]
    if content is None:
        return {"artifacts": described}
    return {"content": content, "artifacts": described}


@dataclass
class ContentsMcpToolset(AbstractToolset[Any]):
    """
    The tools of one Contents MCP session, as a pydantic-ai toolset.

    Parameters
    ----------
    session_uid
        The session the calls go through. Its ``allowed_tools`` is the whole
        toolset: a tool the session does not allow is not offered, and a call
        to one is refused before it reaches Contents.
    source_uid
        The source the session is on; used to discover tool schemas. Read from
        the session when not given.
    client
        The Contents API; the process-wide one when not given.
    token_provider
        Where the caller's token comes from. Defaults to the per-request
        context the transports set, falling back to ``static_token``.
    approval_manager
        The runtime's ``ToolApprovalManager`` (or a stand-in) to raise the
        approval flow with when a call is ``pending-approval``. Built from
        the environment when not given.
    """

    session_uid: str
    source_uid: str | None = None
    client: ContentsMcpApi | None = None
    token_provider: TokenProvider | None = None
    static_token: str | None = None
    approval_manager: Any = None
    poll_interval: float = 1.0
    poll_timeout: float = 600.0
    max_retries: int = 1
    _session: dict[str, Any] | None = field(default=None, init=False, repr=False)
    _tools: dict[str, ToolDefinition] = field(default_factory=dict, init=False, repr=False)
    _sleep: Callable[[float], Awaitable[None]] = field(
        default=asyncio.sleep, init=False, repr=False
    )

    @property
    def id(self) -> str | None:
        return f"contents-mcp:{self.session_uid}"

    @property
    def label(self) -> str:
        return f"Contents MCP session {self.session_uid}"

    # -- plumbing ----------------------------------------------------------

    def _api(self) -> ContentsMcpApi:
        return self.client or get_contents_mcp_client()

    def _token(self) -> str:
        token = (self.token_provider or _request_token)() or self.static_token
        if not token:
            raise ContentsMcpError(
                "No caller token for the Contents MCP session: the request must carry one"
            )
        return token

    async def session(
        self, *, refresh: bool = False, token: str | None = None
    ) -> dict[str, Any]:
        """
        The session record, read once with the caller's token.

        Contents answers only the session's own actor, so reading it is the
        authorization check: a token that is not the session's gets nothing.
        """
        if self._session is None or refresh:
            self._session = await self._api().get_session(
                self.session_uid, token=token or self._token()
            )
            if not self.source_uid:
                self.source_uid = self._session.get("source_uid")
        return self._session

    async def allowed_tools(self, *, token: str | None = None) -> set[str]:
        session = await self.session(token=token)
        return {str(name) for name in session.get("allowed_tools") or []}

    async def _discover(self) -> dict[str, ToolDefinition]:
        """The allowed tools with the schemas the source reports for them."""
        allowed = await self.allowed_tools()
        if not self.source_uid:
            return {}
        discovered = await self._api().discover_tools(self.source_uid, token=self._token())
        definitions: dict[str, ToolDefinition] = {}
        for tool in discovered.get("tools") or []:
            name = str(tool.get("name") or "")
            if not name or name not in allowed:
                continue
            schema = tool.get("input_schema") or tool.get("inputSchema") or {}
            if not isinstance(schema, dict) or not schema:
                schema = {"type": "object", "properties": {}, "additionalProperties": True}
            definitions[name] = ToolDefinition(
                name=name,
                description=tool.get("description") or None,
                parameters_json_schema=schema,
                metadata={"contents_session_uid": self.session_uid, "source_uid": self.source_uid},
            )
        missing = allowed - set(definitions)
        if missing:
            logger.warning(
                "Contents session %s allows tools the source did not report: %s",
                self.session_uid,
                sorted(missing),
            )
        self._tools = definitions
        return definitions

    # -- AbstractToolset ---------------------------------------------------

    async def get_tools(self, ctx: RunContext[Any]) -> dict[str, ToolsetTool[Any]]:
        from pydantic_ai.mcp import TOOL_SCHEMA_VALIDATOR

        definitions = await self._discover()
        return {
            name: ToolsetTool[Any](
                toolset=self,
                tool_def=definition,
                max_retries=self.max_retries,
                args_validator=TOOL_SCHEMA_VALIDATOR,
            )
            for name, definition in definitions.items()
        }

    async def call_tool(
        self,
        name: str,
        tool_args: dict[str, Any],
        ctx: RunContext[Any],
        tool: ToolsetTool[Any],
    ) -> Any:
        tool_call_id = getattr(getattr(ctx, "tool_call_id", None), "__str__", lambda: None)()
        return await self.direct_call_tool(name, tool_args, tool_call_id=tool_call_id)

    async def direct_call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        tool_call_id: str | None = None,
        destination_uri: str | None = None,
        token: str | None = None,
    ) -> Any:
        """
        Call one tool through the session and see it to the end.

        Refuses locally when the session does not allow the tool. Otherwise
        forwards to Contents; on ``pending-approval`` raises the runtime's
        approval flow keyed by the Contents approval uid, relays the decision
        to Contents, and polls the call until it is terminal.
        """
        caller_token = token or self._token()
        allowed = await self.allowed_tools(token=caller_token)
        if name not in allowed:
            raise ContentsMcpError(
                f"Tool '{name}' is not allowed by Contents MCP session {self.session_uid}"
            )
        api = self._api()
        call = await api.call_tool(
            self.session_uid,
            name,
            arguments,
            token=caller_token,
            destination_uri=destination_uri,
        )
        if call.get("status") == "pending-approval":
            call = await self._await_approval(call, name, arguments, tool_call_id, caller_token)
        call = await self._await_terminal(call, caller_token)
        status = call.get("status")
        if status == "succeeded":
            return _result_content(call)
        detail = call.get("error") or status
        raise ContentsMcpError(
            f"Contents MCP call {call.get('uid')} of '{name}' ended {status}: {detail}"
        )

    async def _await_approval(
        self,
        call: dict[str, Any],
        name: str,
        arguments: dict[str, Any],
        tool_call_id: str | None,
        token: str,
    ) -> dict[str, Any]:
        approval_uid = call.get("approval_uid")
        manager = self._approval_manager()
        logger.info(
            "Contents MCP call %s of '%s' awaits approval %s; raising the tool-approval flow",
            call.get("uid"),
            name,
            approval_uid,
        )
        try:
            decision = await manager.request_and_wait(
                name,
                {**arguments, "contents_approval_uid": approval_uid},
                tool_call_id=tool_call_id or (f"contents-approval:{approval_uid}" if approval_uid else None),
            )
        except Exception as error:
            # The reviewer said no (or the wait ran out). Tell Contents, then
            # tell the model; the call record is what both will find later.
            if approval_uid:
                try:
                    await self._api().decide_approval(
                        approval_uid, "reject", token=token, note=str(error)
                    )
                except Exception as relay_error:  # pragma: no cover - best effort
                    logger.warning(
                        "Could not relay rejection of %s to Contents: %s",
                        approval_uid,
                        relay_error,
                    )
            raise
        note = decision.get("note") if isinstance(decision, dict) else None
        if approval_uid:
            await self._api().decide_approval(approval_uid, "approve", token=token, note=note)
        return await self._api().get_call(self.session_uid, str(call["uid"]), token=token)

    async def _await_terminal(self, call: dict[str, Any], token: str) -> dict[str, Any]:
        deadline = time.monotonic() + self.poll_timeout
        while call.get("status") not in TERMINAL_CALL_STATUSES:
            if time.monotonic() >= deadline:
                raise ContentsMcpError(
                    f"Contents MCP call {call.get('uid')} is still {call.get('status')} "
                    f"after {self.poll_timeout:.0f}s"
                )
            await self._sleep(self.poll_interval)
            call = await self._api().get_call(self.session_uid, str(call["uid"]), token=token)
        return call

    def _approval_manager(self) -> Any:
        if self.approval_manager is None:
            from agent_runtimes.guardrails.tool_approvals import (
                ToolApprovalConfig,
                ToolApprovalManager,
            )

            config = ToolApprovalConfig.from_env()
            self.approval_manager = ToolApprovalManager(config)
        return self.approval_manager


# -- registry ----------------------------------------------------------------
#
# The proxy answers sandboxes by session uid. It needs the toolset an agent
# holds for that session — not to trust it, but to reuse its client and
# settings; the caller's token is re-checked against Contents on every call.

_toolsets_by_session: dict[str, ContentsMcpToolset] = {}


def register_contents_toolset(toolset: ContentsMcpToolset) -> None:
    _toolsets_by_session[toolset.session_uid] = toolset


def unregister_contents_toolset(session_uid: str) -> None:
    _toolsets_by_session.pop(session_uid, None)


def get_contents_toolset(session_uid: str) -> ContentsMcpToolset | None:
    return _toolsets_by_session.get(session_uid)


async def ensure_contents_session(
    *,
    source_uid: str | None,
    session_uid: str | None,
    token: str,
    tools: list[str] | None = None,
    sandbox_uid: str | None = None,
    client: ContentsMcpApi | None = None,
) -> str:
    """
    The session uid an agent will use: the one handed in, or one created now.

    Creating needs the source and the caller's token — the session belongs to
    the caller, which is what makes every later call theirs.
    """
    if session_uid:
        return session_uid
    if not source_uid:
        raise ContentsMcpError(
            "A Contents MCP selection needs a session_uid or a source_uid to open one"
        )
    api = client or get_contents_mcp_client()
    session = await api.create_session(
        source_uid, token=token, tools=tools, sandbox_uid=sandbox_uid
    )
    uid = session.get("uid")
    if not uid:
        raise ContentsMcpError("Contents opened a session without a uid")
    return str(uid)


__all__ = [
    "TERMINAL_CALL_STATUSES",
    "ContentsMcpApi",
    "ContentsMcpClient",
    "ContentsMcpError",
    "ContentsMcpToolset",
    "ensure_contents_session",
    "get_contents_mcp_client",
    "get_contents_toolset",
    "register_contents_toolset",
    "set_contents_mcp_client",
    "unregister_contents_toolset",
]
