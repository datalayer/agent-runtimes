# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tornado handlers for MCP server management API."""

import json

from jupyter_server.base.handlers import APIHandler
from tornado import web as tornado_web

from agent_runtimes.types import MCPServer


class MCPServersHandler(APIHandler):
    """Handler for MCP server CRUD operations."""

    @tornado_web.authenticated
    async def get(self) -> None:
        """Get all MCP servers."""
        try:
            mcp_manager = self.settings.get("mcp_manager")
            if not mcp_manager:
                self.finish(json.dumps([]))
                return

            servers = mcp_manager.get_servers()
            self.finish(json.dumps([s.model_dump() for s in servers]))

        except Exception as e:
            self.log.error(f"Error getting MCP servers: {e}", exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))

    @tornado_web.authenticated
    async def post(self) -> None:
        """Add a new MCP server."""
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            server = MCPServer(**data)

            mcp_manager = self.settings.get("mcp_manager")
            config = self.settings.get("chat_config")

            if mcp_manager:
                mcp_manager.add_server(server)

            if config:
                servers = mcp_manager.get_servers() if mcp_manager else [server]
                config.save_mcp_servers(servers)

            self.finish(server.model_dump_json())

        except Exception as e:
            self.log.error(f"Error adding MCP server: {e}", exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class MCPServerHandler(APIHandler):
    """Handler for individual MCP server operations."""

    @tornado_web.authenticated
    async def put(self, server_id: str) -> None:
        """Update MCP server."""
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            server = MCPServer(**data)

            mcp_manager = self.settings.get("mcp_manager")
            config = self.settings.get("chat_config")

            if mcp_manager:
                mcp_manager.update_server(server_id, server)

            if config:
                servers = mcp_manager.get_servers() if mcp_manager else []
                config.save_mcp_servers(servers)

            self.finish(server.model_dump_json())

        except Exception as e:
            self.log.error(f"Error updating MCP server: {e}", exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))

    @tornado_web.authenticated
    async def delete(self, server_id: str) -> None:
        """Delete MCP server."""
        try:
            mcp_manager = self.settings.get("mcp_manager")
            config = self.settings.get("chat_config")

            if mcp_manager:
                mcp_manager.remove_server(server_id)

            if config:
                servers = mcp_manager.get_servers() if mcp_manager else []
                config.save_mcp_servers(servers)

            self.set_status(204)
            self.finish()

        except Exception as e:
            self.log.error(f"Error deleting MCP server: {e}", exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))
