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
"""

import argparse
import logging
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
    
    args = parser.parse_args()
    
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
