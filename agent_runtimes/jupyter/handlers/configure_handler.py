# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tornado handlers for chat configuration API."""

import json
import logging

from jupyter_server.base.handlers import APIHandler
from tornado import web as tornado_web

from agent_runtimes.mcp import get_available_tools, get_frontend_config

logger = logging.getLogger(__name__)


class ConfigureHandler(APIHandler):
    """
    Handler for /api/configure endpoint.

    Returns configuration information for the frontend:
    - Available models
    - Builtin tools
    - MCP servers
    """

    @tornado_web.authenticated
    async def get(self) -> None:
        """Return configuration for frontend."""
        try:
            # Get MCP manager from settings.
            mcp_manager = self.settings.get("mcp_manager")

            # Get Jupyter server connection details
            serverapp = self.settings.get("serverapp")
            if serverapp:
                base_url = serverapp.connection_url
                token = serverapp.token
                logger.info(f"Using Jupyter ServerApp connection URL: {base_url}")
            else:
                # Fallback to localhost
                base_url = "http://localhost:8888"
                token = None
                logger.warning("ServerApp not found in settings, using localhost")

            # Fetch available tools from MCP server
            logger.info("Fetching tools from MCP server...")
            available_tools = await get_available_tools(
                base_url=base_url,
                token=token,
                enabled_only=False,
            )
            logger.info(
                f"Fetched {len(available_tools)} tools: {[t.get('name') for t in available_tools]}"
            )

            # Get MCP servers
            mcp_servers = []
            if mcp_manager:
                mcp_servers = mcp_manager.get_servers()

            # Build frontend config using shared module
            config = await get_frontend_config(
                tools=available_tools,
                mcp_servers=mcp_servers,
            )

            self.finish(config.model_dump_json(by_alias=True))

        except Exception as e:
            self.log.error(f"Error in configure handler: {e}", exc_info=True)
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))
