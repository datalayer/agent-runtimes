#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Runtimes Server Entry Point.

This module provides the main entry point for running the agent-runtimes
FastAPI server with uvicorn.

Usage:
    # Run directly
    python -m agent_runtimes

    # Or with uvicorn for development
    uvicorn agent_runtimes.app:app --reload --port 8000

    # With custom host/port
    python -m agent_runtimes --host 0.0.0.0 --port 8080

    # With a specific agent from the library
    python -m agent_runtimes --agent data-acquisition
"""

import argparse
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point for the agent-runtimes server."""
    parser = argparse.ArgumentParser(
        description="Run the agent-runtimes server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Start with defaults (localhost:8000)
    python -m agent_runtimes
    
    # Start on all interfaces
    python -m agent_runtimes --host 0.0.0.0
    
    # Start on custom port
    python -m agent_runtimes --port 8080
    
    # Start with auto-reload for development
    python -m agent_runtimes --reload
    
    # Start with debug logging
    python -m agent_runtimes --debug

    # Start with a specific agent from the library
    python -m agent_runtimes --agent data-acquisition
    
    # List available agents
    python -m agent_runtimes --list-agents
        """,
    )
    
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind to (default: 8000)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode with verbose logging",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of worker processes (default: 1)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Log level (default: info)",
    )
    parser.add_argument(
        "--agent",
        type=str,
        default=None,
        help="Agent spec ID from the library to start (e.g., 'data-acquisition', 'crawler'). "
             "When specified, the agent will be registered under the name 'default'.",
    )
    parser.add_argument(
        "--list-agents",
        action="store_true",
        help="List available agent specs from the library and exit",
    )
    
    args = parser.parse_args()

    # Handle --list-agents
    if args.list_agents:
        from agent_runtimes.config.agents import AGENT_LIBRARY
        print("\nAvailable Agent Specs:")
        print("-" * 60)
        for agent_id, agent in AGENT_LIBRARY.items():
            mcp_ids = [s.id for s in agent.mcp_servers]
            print(f"  {agent_id:<25} - {agent.name}")
            print(f"    {agent.description[:55]}...")
            print(f"    MCP Servers: {', '.join(mcp_ids)}")
            print()
        sys.exit(0)

    # Validate agent if specified
    if args.agent:
        from agent_runtimes.config.agents import AGENT_LIBRARY, get_agent
        agent_spec = get_agent(args.agent)
        if not agent_spec:
            available = list(AGENT_LIBRARY.keys())
            logger.error(f"Agent '{args.agent}' not found. Available: {available}")
            sys.exit(1)
        # Set environment variable for the app to pick up
        os.environ["AGENT_RUNTIMES_DEFAULT_AGENT"] = args.agent
        logger.info(f"Will start with agent: {agent_spec.name} (registered as 'default')")
    
    # Set log level
    log_level = args.log_level.upper()
    if args.debug:
        log_level = "DEBUG"
    logging.getLogger().setLevel(log_level)
    
    try:
        import uvicorn
    except ImportError:
        logger.error(
            "uvicorn is not installed. Install it with: pip install uvicorn"
        )
        sys.exit(1)
    
    logger.info(f"Starting agent-runtimes server on {args.host}:{args.port}")
    logger.info(f"API docs available at http://{args.host}:{args.port}/docs")
    logger.info(f"ACP WebSocket endpoint: ws://{args.host}:{args.port}/api/v1/acp/ws/{{agent_id}}")
    
    # Exclude generated/ directory from reload watching (codemode generates bindings there)
    reload_excludes = ["generated/*", "generated/**/*", "*.pyc", "__pycache__"]
    
    uvicorn.run(
        "agent_runtimes.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_excludes=reload_excludes if args.reload else None,
        workers=args.workers if not args.reload else 1,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
