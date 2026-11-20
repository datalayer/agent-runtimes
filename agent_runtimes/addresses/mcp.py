# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's MCP server, on Reactor's MCP server (``reactor_mcp_server``).

:class:`OperationsExtension` contributes one tool per operation of the agent's
``openapi``: named by its ``operationId``, described by its instruction, its
input schema the operation's inputs and its output schema the operation's
``200``. Each call is answered by the agent (:func:`call_operation`). The
server is :func:`reactor_mcp_server.create_mcp_app` at ``/mcp`` (streamable
HTTP), behind the agent's access check (who may call it, its rate cap).

A company's MCP server is an OAuth protected resource, as the Personal Agent
Protocol asks of one (1.0 §4.5, §7), on Reactor's OAuth plugin
(``reactor_mcp_server.oauth``, :func:`company_oauth`): its protected resource
metadata at ``/.well-known/oauth-protected-resource/mcp`` names its ``url`` and
the company's issuer (its agent host); a request it does not admit is answered
with the challenge naming that document; and it takes the company's access
tokens issued for it alone, their scopes enforced. Who may call is unchanged:
anyone at a public one, a Datalayer API key or token of somebody allowed at a
private one.

A private company whose owner lets other MCP clients sign in also takes the token
of such a client (the SDK's public clients: an MCP client that is no personal agent),
issued for this server after somebody who may open the application allowed it. It
calls the tools its scopes allow, as that person, except those that act for them on
approval (an operation carrying ``x-pap``): only a personal agent asks a person to
approve, so those are refused to it (:data:`NEEDS_A_PERSONAL_AGENT`).
"""

from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any, Dict, Optional

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.mcpserver.utilities.func_metadata import ArgModelBase, FuncMetadata
from mcp.types import CallToolResult, TextContent
from pydantic import ConfigDict
from reactor import PluginManifest
from reactor_mcp_server import (
    McpExtension,
    OAuthExtension,
    ProtectedResource,
    ToolSpec,
    build_host,
    create_mcp_app,
)
from reactor_mcp_server.oauth import AccessToken, Forbidden

from agent_runtimes.addresses.access import Caller, client_address
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.asgi import guarded, headers_of
from agent_runtimes.addresses.operations import OperationError

#: Who is calling, as the access check found, for the tool handlers.
_CALLER: ContextVar[Optional[Caller]] = ContextVar("addresses_mcp_caller", default=None)


class _Inputs(ArgModelBase):
    """A call's arguments, kept whole: the operation's input schema checks them."""

    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    def model_dump_one_level(self) -> Dict[str, Any]:
        return {"arguments": dict(self.model_extra or {})}


def _result(answer: Any) -> CallToolResult:
    """The answer as MCP structured content, its JSON as text beside it."""
    structured = answer if isinstance(answer, dict) else {"result": answer}
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(answer, ensure_ascii=False))],
        structured_content=structured,
    )


class OperationsExtension(McpExtension):
    """One MCP tool per operation of an agent's ``openapi``."""

    def __init__(
        self,
        addressed: AddressedAgent,
        scopes: Optional[Dict[str, tuple[str, ...]]] = None,
    ) -> None:
        self.addressed = addressed
        #: The OAuth scopes each operation's tool requires, by ``operationId``.
        self.scopes = dict(scopes or {})

    def manifest(self) -> PluginManifest:
        from agent_runtimes import __version__

        return PluginManifest(name="agent-runtimes-operations", version=__version__)

    def _handler(self, operation_id: str) -> Any:
        addressed = self.addressed

        async def call(arguments: Dict[str, Any], ctx: Context) -> CallToolResult:
            try:
                # Who calls, from this request's own headers (the session's task
                # outlives the request that opened it): checked, then counted.
                request = ctx.request_context.request
                headers = dict(ctx.headers or {})
                peer = str(getattr(getattr(request, "client", None), "host", "") or "")
                caller = await mcp_client_caller(addressed, headers, peer)
                if caller is None:
                    caller = await addressed.access.identify(headers, peer)
                elif addressed.operation(operation_id).pap:
                    # What a person approves is asked of them by their personal agent:
                    # another MCP client has no way to, so it is not done for it.
                    raise OperationError(403, NEEDS_A_PERSONAL_AGENT)
                addressed.access.count(caller)
                return _result(
                    await addressed.call(
                        operation_id, arguments, interface="mcp", caller=caller
                    )
                )
            except OperationError as error:
                raise ToolError(
                    f"{error.status}: {error.detail}"
                    + (" " + "; ".join(error.errors) if error.errors else "")
                ) from error

        call.__name__ = operation_id
        return call

    def tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name=operation.operation_id,
                handler=self._handler(operation.operation_id),
                description=operation.instruction,
                title=operation.summary or operation.operation_id,
                meta={"method": operation.method, "path": operation.path},
                scopes=self.scopes.get(operation.operation_id, ()),
            )
            for operation in self.addressed.operations
        ]

    def on_server(self, server: Any) -> None:
        """Each tool's schemas are its operation's: the input schema the client is
        given, and the output schema of its ``200``.
        """
        for operation in self.addressed.operations:
            tool = server._tool_manager.get_tool(operation.operation_id)
            tool.parameters = operation.input_schema
            tool.fn_metadata = FuncMetadata(
                arg_model=_Inputs, output_schema=_output_schema(operation.output_schema)
            )
            # Read once per tool, cached: the schema just given is the one listed.
            tool.__dict__.pop("output_schema", None)


def _output_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """The output schema MCP takes is an object: an answer of another type is under ``result``."""
    if schema.get("type") == "object":
        return schema
    return {"type": "object", "properties": {"result": schema}, "required": ["result"]}


#: Who an anonymous caller of a public company's MCP server is, and whose key an API key is.
ANONYMOUS_CLIENT = "anonymous"
API_KEY_CLIENT = "datalayer-api-key"
DATALAYER_CLIENT = "datalayer"

NOT_ALLOWED = "Its owner has not allowed you to call it."

#: What another MCP client is told of an operation a person approves (``x-pap``).
NEEDS_A_PERSONAL_AGENT = (
    "This is done only once the person approved it, which their personal agent asks "
    "them: this client cannot."
)

#: In a verified token's ``claims``: the token is another MCP client's, not a personal agent's.
MCP_CLIENT_CLAIM = "datalayer.ai/mcp_client"


async def mcp_client_token(addressed: AddressedAgent, token: str) -> Any:
    """The SDK's record of ``token`` when it is another MCP client's (a public client's)
    issued for this MCP server and still good, else ``None``: asked of the company each
    time, so a sign-in its owner ended, or a switch turned off, stops it at once.
    """
    company, hosts = addressed.company, addressed.hosts
    if company is None or hosts is None or not token:
        return None
    issued = await company.service.access_token_for(token, hosts.mcp)
    return issued if issued is not None and issued.public else None


async def mcp_client_caller(
    addressed: AddressedAgent, headers: Dict[str, Any], peer: str = ""
) -> Optional[Caller]:
    """Who calls, when the request's bearer is another MCP client's token: the person
    who allowed it, who must still be somebody its owner lets in. ``None`` for any other
    request, which the access check identifies as before.
    """
    authorization = next(
        (
            str(value)
            for key, value in headers.items()
            if key.lower() == "authorization"
        ),
        "",
    )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    # Who may call, as the deployment says now: the switch and the people both.
    policy = await addressed.access.current_policy()
    issued = await mcp_client_token(addressed, token.strip())
    if issued is None:
        return None
    uid = str(issued.account_id)
    if not addressed.mcp_clients or not policy.admits(uid):
        raise OperationError(403, NOT_ALLOWED)
    return Caller(kind="token", uid=uid, address=client_address(headers, peer))


def operation_scopes(addressed: AddressedAgent) -> Dict[str, tuple[str, ...]]:
    """The scopes each operation of a company requires, from its ``openapi``: an
    operation's ``security`` naming one requirement lists them (OpenAPI 3.1 §4.8.30),
    those the company offers. An operation that says none, or offers alternatives,
    requires none here: its agent decides what the caller's scopes allow.
    """
    offered = set(_offered_scopes(addressed))
    found: Dict[str, tuple[str, ...]] = {}
    for item in (addressed.document.get("paths") or {}).values():
        for operation in (item or {}).values():
            if not isinstance(operation, dict) or not operation.get("operationId"):
                continue
            security = operation.get("security")
            if not isinstance(security, list) or len(security) != 1:
                continue
            scopes = tuple(
                dict.fromkeys(
                    str(scope)
                    for listed in (security[0] or {}).values()
                    for scope in listed or ()
                    if str(scope) in offered
                )
            )
            if scopes:
                found[str(operation["operationId"])] = scopes
    return found


def _offered_scopes(addressed: AddressedAgent) -> tuple[str, ...]:
    """The scopes the company offers, as its issuer publishes them."""
    from agent_runtimes.pap.company import company_config

    assert addressed.hosts is not None
    return tuple(
        company_config(
            addressed.app.name,
            addressed.hosts.host("agent"),
            addressed.app.pap.company,
            description=addressed.app.description,
        ).offered_scopes
    )


def company_oauth(addressed: AddressedAgent) -> OAuthExtension:
    """A company's MCP server as an OAuth protected resource (PAP 1.0 §4.5, §7).

    - **The resource** is its ``url`` (``https://{name}.mcp.<domain>/mcp``, what its
      ``poppy.json`` lists), its authorization server the company's issuer
      (``https://{name}.agent.<domain>``), its scopes the company's.
    - **A bearer token** is the company's access token *issued for this server*
      (``resource`` its ``url``), held to its scopes; or a Datalayer token, the whole
      authority of whoever holds it here. A company token issued for another
      resource, the default one among them, is not valid here (§4.5).
    - **Another way in** is what admitted a caller before: a Datalayer API key
      (``X-API-Key``), and nothing at all at a public one.

    Somebody known whom the owner did not allow is refused (403), as before.
    """
    hosts = addressed.hosts
    assert hosts is not None
    offered = _offered_scopes(addressed)

    async def admitted(uid: str) -> None:
        # Who may call, as the deployment says now: never a copy kept from before.
        if not (await addressed.access.current_policy()).admits(uid):
            raise Forbidden(NOT_ALLOWED)

    async def verify(token: str) -> Optional[AccessToken]:
        # The deployment read again first: the company is built again with it when
        # its owner turned "Let other MCP clients sign in".
        await addressed.access.refresh()
        company = addressed.company
        issued = (
            await company.service.access_token_for(token, hosts.mcp)
            if company is not None
            else None
        )
        if issued is not None:
            if issued.public and not addressed.mcp_clients:
                # Another MCP client's token, at a company that takes none (any more).
                return None
            await admitted(str(issued.account_id))
            return AccessToken(
                token=token,
                client_id=str(issued.client_id),
                scopes=list(issued.scopes),
                expires_at=int(issued.expires_at.timestamp()),
                resource=hosts.mcp,
                subject=str(issued.account_id),
                # Whose kind of client it is, for whoever reads the verified token.
                claims={MCP_CLIENT_CLAIM: True} if issued.public else None,
            )
        checker = addressed.platform_tokens or (
            addressed.access.token_checker if company is None else None
        )
        uid = await checker(token) if checker is not None else None
        if not uid:
            return None
        await admitted(uid)
        # A Datalayer token is its holder's own authority here, not a delegation.
        return AccessToken(
            token=token, client_id=DATALAYER_CLIENT, scopes=list(offered), subject=uid
        )

    async def by_key_or_open(scope: Any) -> Optional[AccessToken]:
        headers = headers_of(scope)
        key = headers.get("x-api-key", "").strip()
        checker = addressed.access.key_checker
        if key and checker is not None:
            uid = await checker(key)
            if uid:
                await admitted(uid)
                return AccessToken(
                    token=key,
                    client_id=API_KEY_CLIENT,
                    scopes=list(offered),
                    subject=uid,
                )
            return None
        if (
            (await addressed.access.current_policy()).visibility == "public"
            and not key
            and not headers.get("authorization")
        ):
            # Open to anybody, as before: a caller nobody names, for everything it offers.
            return AccessToken(
                token="", client_id=ANONYMOUS_CLIENT, scopes=list(offered)
            )
        return None

    return OAuthExtension(
        ProtectedResource(
            resource=hosts.mcp,
            authorization_servers=(hosts.agent,),
            scopes_supported=offered,
            resource_name=addressed.app.name,
        ),
        verifier=verify,
        admits=by_key_or_open,
    )


def mcp_app(addressed: AddressedAgent) -> Any:
    """The agent's MCP server, at ``/mcp``, behind its access check.

    A company at its addresses is an OAuth protected resource
    (:func:`company_oauth`); any other agent keeps its access check in front.
    """
    options = {
        "name": addressed.app.name,
        "instructions": addressed.app.description,
    }
    if addressed.role == "company" and addressed.hosts is not None:
        host = build_host(
            [
                OperationsExtension(addressed, operation_scopes(addressed)),
                company_oauth(addressed),
            ],
            **options,
        )
        return create_mcp_app(host, path="/mcp", app_options=_app_options(addressed))
    host = build_host([OperationsExtension(addressed)], **options)
    return guarded(
        create_mcp_app(host, path="/mcp", app_options=_app_options(addressed)),
        addressed,
        _CALLER,
        open_paths=("/healthz",),
    )


def _app_options(addressed: AddressedAgent) -> Dict[str, Any]:
    """The SDK's transport security: its DNS rebinding protection admits the agent's own
    MCP host (``{name}.mcp.<domain>``, behind the ingress) besides the loopback, which
    alone it admits by default — every request at the agent's address was 421.
    """
    from mcp.server.transport_security import TransportSecuritySettings

    hosts = ["127.0.0.1", "127.0.0.1:*", "localhost", "localhost:*", "[::1]:*"]
    origins = ["http://127.0.0.1:*", "http://localhost:*"]
    if addressed.hosts is not None:
        host = addressed.hosts.host("mcp")
        hosts += [host, f"{host}:443"]
        origins.append(f"https://{host}")
    return {
        "transport_security": TransportSecuritySettings(
            allowed_hosts=hosts, allowed_origins=origins
        )
    }


__all__ = [
    "MCP_CLIENT_CLAIM",
    "NEEDS_A_PERSONAL_AGENT",
    "OperationsExtension",
    "company_oauth",
    "mcp_app",
    "mcp_client_caller",
    "mcp_client_token",
    "operation_scopes",
]
