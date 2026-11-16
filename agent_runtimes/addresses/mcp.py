# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's MCP server, on Reactor's MCP server (``reactor_mcp_server``).

:class:`OperationsExtension` contributes one tool per operation of the agent's
``openapi``: named by its ``operationId``, described by its instruction, its
input schema the operation's inputs and its output schema the operation's
``200``. Each call is answered by the agent (:func:`call_operation`). The
server is :func:`reactor_mcp_server.create_mcp_app` at ``/mcp`` (streamable
HTTP), behind the agent's access check (who may call it, its rate cap).
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
from reactor_mcp_server import McpExtension, ToolSpec, build_host, create_mcp_app

from agent_runtimes.addresses.access import Caller
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.asgi import guarded
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

    def __init__(self, addressed: AddressedAgent) -> None:
        self.addressed = addressed

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
                caller = await addressed.access.identify(
                    dict(ctx.headers or {}),
                    str(getattr(getattr(request, "client", None), "host", "") or ""),
                )
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
            )
            for operation in self.addressed.operations
        ]

    def on_server(self, server: Any) -> None:
        """Each tool's schemas are its operation's: the input schema the client is
        given, and the output schema of its ``200``."""
        for operation in self.addressed.operations:
            tool = server._tool_manager.get_tool(operation.operation_id)
            tool.parameters = operation.input_schema
            tool.fn_metadata = FuncMetadata(
                arg_model=_Inputs, output_schema=_output_schema(operation.output_schema)
            )
            # Read once per tool, cached: the schema just given is the one listed.
            tool.__dict__.pop("output_schema", None)


def _output_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """MCP's output schema is an object: an answer of another type is under ``result``."""
    if schema.get("type") == "object":
        return schema
    return {"type": "object", "properties": {"result": schema}, "required": ["result"]}


def mcp_app(addressed: AddressedAgent) -> Any:
    """The agent's MCP server, at ``/mcp``, behind its access check."""
    host = build_host(
        [OperationsExtension(addressed)],
        name=addressed.app.name,
        instructions=addressed.app.description,
    )
    return guarded(
        create_mcp_app(host, path="/mcp", app_options=_app_options(addressed)),
        addressed,
        _CALLER,
        open_paths=("/healthz",),
    )


def _app_options(addressed: AddressedAgent) -> Dict[str, Any]:
    """The SDK's transport security: its DNS rebinding protection admits the agent's own
    MCP host (``{name}.mcp.<domain>``, behind the ingress) besides the loopback, which
    alone it admits by default — every request at the agent's address was 421."""
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


__all__ = ["OperationsExtension", "mcp_app"]
