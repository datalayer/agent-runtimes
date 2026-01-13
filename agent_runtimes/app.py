# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
FastAPI application factory for agent-runtimes server.

Provides a configurable FastAPI application with:
- ACP protocol endpoints
- Health check endpoints
- CORS configuration
- OpenAPI documentation
- Demo agent for testing
"""

import asyncio
import logging
import multiprocessing as mp
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.routing import Mount

from .mcp import (
    ensure_mcp_toolsets_event,
    initialize_mcp_servers,
    get_mcp_manager,
    initialize_mcp_toolsets,
    shutdown_mcp_toolsets,
)
from .routes import (
    a2a_protocol_router,
    A2AAgentCard,
    a2ui_router,
    acp_router,
    agents_router,
    agui_router,
    configure_router,
    examples_router,
    get_a2a_mounts,
    get_agui_mounts,
    get_example_mounts,
    health_router,
    mcp_router,
    mcp_ui_router,
    set_a2a_app,
    start_a2a_task_managers,
    stop_a2a_task_managers,
    vercel_ai_router,
)
from .routes.agents import set_api_prefix

logger = logging.getLogger(__name__)


def _is_reload_parent_process() -> bool:
    """Return True when running inside the reload supervisor parent."""
    return "--reload" in sys.argv and mp.current_process().name == "MainProcess"


class ServerConfig(BaseModel):
    """Configuration for the agent-runtimes server."""
    
    title: str = "Agent Runtimes Server"
    description: str = "FastAPI server for agent-runtimes with ACP protocol support"
    version: str = "0.1.0"
    
    # CORS settings
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: list[str] = Field(default_factory=lambda: ["*"])
    
    # Server settings
    debug: bool = False
    docs_url: str | None = "/docs"
    redoc_url: str | None = "/redoc"
    openapi_url: str | None = "/openapi.json"
    
    # API prefix
    api_prefix: str = "/api/v1"


def create_app(config: ServerConfig | None = None) -> FastAPI:
    """
    Create and configure the FastAPI application.
    
    Args:
        config: Server configuration. If None, uses defaults.
        
    Returns:
        Configured FastAPI application.
    """
    if config is None:
        config = ServerConfig()
    
    # Set the API prefix for dynamic agent creation
    set_api_prefix(config.api_prefix)
    
    # Store reference to background task to prevent garbage collection
    _mcp_toolsets_task: asyncio.Task | None = None
    _mcp_servers_task: asyncio.Task | None = None
    
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """Application lifespan handler."""
        nonlocal _mcp_toolsets_task, _mcp_servers_task
        logger.info("Starting agent-runtimes server...")
        
        if _is_reload_parent_process():
            logger.info("Reload parent detected; deferring MCP startup to worker process")
        else:
            # Initialize Pydantic AI MCP toolsets in a background task
            # This allows FastAPI to start immediately while MCP servers start async
            logger.info("Initializing Pydantic AI MCP toolsets (background startup)...")
            ensure_mcp_toolsets_event()
            _mcp_toolsets_task = asyncio.create_task(initialize_mcp_toolsets())
            logger.info("MCP toolset initialization started (servers starting in background)")

            # Initialize MCP servers (check availability and discover tools) - for the frontend/config API
            # This also runs async but we need to wait for it before loading into manager
            logger.info("Initializing MCP servers for configuration API...")

            async def load_mcp_servers_background() -> None:
                mcp_servers = await initialize_mcp_servers(discover_tools=True)
                mcp_manager = get_mcp_manager()
                mcp_manager.load_servers(mcp_servers)
                logger.info(f"Loaded {len(mcp_servers)} MCP servers into manager")

            _mcp_servers_task = asyncio.create_task(load_mcp_servers_background())
        
        # Set app reference for dynamic A2A route mounting
        set_a2a_app(app, config.api_prefix)
        
        # Demo agent auto-registration disabled - use the UI to create agents dynamically
        # To manually register the demo agent, run: python -m agent_runtimes.examples.demo.demo_agent
        
        # Add AG-UI mounts after agents are registered
        for mount in get_agui_mounts():
            # Mount under /api/v1/ag-ui/{agent_id}/
            full_mount = Mount(f"{config.api_prefix}/ag-ui{mount.path}", app=mount.app)
            app.routes.append(full_mount)
            logger.info(f"Mounted AG-UI route: {config.api_prefix}/ag-ui{mount.path}/")
        
        # Add A2A mounts (FastA2A apps) after agents are registered
        for mount in get_a2a_mounts():
            # Mount under /api/v1/a2a/agents/{agent_id}/
            full_mount = Mount(f"{config.api_prefix}/a2a/agents{mount.path}", app=mount.app)
            app.routes.append(full_mount)
            logger.info(f"Mounted A2A route: {config.api_prefix}/a2a/agents{mount.path}/")
        
        # Add AG-UI example mounts
        for mount in get_example_mounts(config.api_prefix):
            app.routes.append(mount)
            logger.info(f"Mounted example route: {mount.path}/")
        
        # Start A2A TaskManagers (required for FastA2A apps to handle requests)
        await start_a2a_task_managers()
        
        yield
        
        # Stop A2A TaskManagers on shutdown
        await stop_a2a_task_managers()
        
        # Wait for MCP toolsets task to complete (or cancel if still running)
        if _mcp_toolsets_task is not None and not _mcp_toolsets_task.done():
            logger.info("Waiting for MCP toolsets initialization to complete...")
            try:
                await asyncio.wait_for(_mcp_toolsets_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("MCP toolsets initialization timed out, cancelling...")
                _mcp_toolsets_task.cancel()
                try:
                    await _mcp_toolsets_task
                except asyncio.CancelledError:
                    pass
        
        # Wait for MCP server loading to complete (if still running)
        if _mcp_servers_task is not None and not _mcp_servers_task.done():
            logger.info("Waiting for MCP server manager load to complete...")
            try:
                await asyncio.wait_for(_mcp_servers_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("MCP server manager load timed out, cancelling...")
                _mcp_servers_task.cancel()
                try:
                    await _mcp_servers_task
                except asyncio.CancelledError:
                    pass

        # Shutdown MCP toolsets (stop all MCP server subprocesses)
        if not _is_reload_parent_process():
            await shutdown_mcp_toolsets()
        
        logger.info("Shutting down agent-runtimes server...")
    
    app = FastAPI(
        title=config.title,
        description=config.description,
        version=config.version,
        debug=config.debug,
        docs_url=config.docs_url,
        redoc_url=config.redoc_url,
        openapi_url=config.openapi_url,
        lifespan=lifespan,
    )
    
    # Add CORS middleware - must be added before other middleware
    # Allow all origins for development and cross-origin agent runtimes
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins
        allow_credentials=True,
        allow_methods=["*"],  # Allow all methods
        allow_headers=["*"],  # Allow all headers
        expose_headers=["*"],  # Expose all headers to the client
    )
    
    # Include routers
    app.include_router(health_router)
    app.include_router(agents_router, prefix=config.api_prefix)
    app.include_router(acp_router, prefix=config.api_prefix)
    app.include_router(configure_router, prefix=config.api_prefix)
    app.include_router(mcp_router, prefix=config.api_prefix)
    app.include_router(vercel_ai_router, prefix=config.api_prefix)
    app.include_router(agui_router, prefix=config.api_prefix)
    app.include_router(mcp_ui_router, prefix=config.api_prefix)
    app.include_router(a2a_protocol_router, prefix=config.api_prefix)
    app.include_router(a2ui_router, prefix=config.api_prefix)
    app.include_router(examples_router, prefix=config.api_prefix)
    
    # Note: AG-UI mounts and example mounts are added dynamically during lifespan startup
    
    # Root endpoint
    @app.get("/")
    async def root() -> dict[str, Any]:
        """Root endpoint with service information."""
        return {
            "service": config.title,
            "version": config.version,
            "docs": config.docs_url,
            "endpoints": {
                "health": "/health",
                "agents": f"{config.api_prefix}/agents",
                "acp": f"{config.api_prefix}/acp",
                "configure": f"{config.api_prefix}/configure",
                "mcp_servers": f"{config.api_prefix}/mcp/servers",
                "vercel_ai": f"{config.api_prefix}/vercel-ai/chat",
                "ag_ui": f"{config.api_prefix}/ag-ui/",
                "mcp_ui": f"{config.api_prefix}/mcp-ui/",
                "a2a": f"{config.api_prefix}/a2a/",
                "a2ui": f"{config.api_prefix}/a2ui/",
                "examples": f"{config.api_prefix}/examples/",
            },
        }
    
    return app


def create_dev_app() -> FastAPI:
    """
    Create a development application with debug settings.
    
    Returns:
        FastAPI application configured for development.
    """
    config = ServerConfig(
        debug=True,
        cors_origins=["*"],
    )
    return create_app(config)


def create_production_app(
    cors_origins: list[str] | None = None,
) -> FastAPI:
    """
    Create a production application with stricter settings.
    
    Args:
        cors_origins: Allowed CORS origins. Defaults to empty list.
        
    Returns:
        FastAPI application configured for production.
    """
    config = ServerConfig(
        debug=False,
        cors_origins=cors_origins or [],
        cors_allow_credentials=False,
    )
    return create_app(config)


# Default app instance for uvicorn
app = create_app()
