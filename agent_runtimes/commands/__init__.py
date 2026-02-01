# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Runtimes CLI commands.

This package provides modular command implementations that can be used
both through the CLI and as a library by other Python packages.

Commands:
    - serve: Start the agent-runtimes server
    - list_agents: Query running agents from a server
    - list_specs: List available agent specs from the library

Usage as library:
    from agent_runtimes.commands import (
        # Serve command
        serve_server,
        ServeError,
        LogLevel,
        
        # List agents command
        list_agents_from_server,
        ListAgentsError,
        
        # List specs command
        list_agent_specs,
        get_agent_specs,
        
        # Common
        OutputFormat,
    )
    
    # Start server programmatically
    serve_server(host="0.0.0.0", port=8080)
    
    # Query running agents
    result = list_agents_from_server(host="localhost", port=8000)
    
    # Get available agent specs
    specs = get_agent_specs()
"""

from agent_runtimes.commands.serve import (
    LogLevel,
    Protocol,
    ServeError,
    parse_mcp_servers,
    parse_skills,
    serve_server,
)
from agent_runtimes.commands.list_agents import (
    ListAgentsError,
    OutputFormat,
    list_agents_from_server,
)
from agent_runtimes.commands.list_specs import (
    get_agent_specs,
    list_agent_specs,
)

__all__ = [
    # Serve command
    "serve_server",
    "ServeError",
    "LogLevel",
    "Protocol",
    "parse_mcp_servers",
    "parse_skills",
    # List agents command
    "list_agents_from_server",
    "ListAgentsError",
    # List specs command
    "list_agent_specs",
    "get_agent_specs",
    # Common
    "OutputFormat",
]
