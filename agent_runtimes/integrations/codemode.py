# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Integration module for mcp-codemode and agent-skills.

This module provides integration between:
- agent-runtimes: The main agent infrastructure
- mcp-codemode: Code-first MCP tool composition
- agent-skills: Reusable agent skill management

It allows agents running on agent-runtimes to:
- Use Code Mode for efficient tool composition
- Access and execute skills
- Discover tools progressively
"""

import logging
from typing import Any, Optional

from agent_runtimes.mcp.manager import MCPManager, get_mcp_manager
from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)


class CodemodeIntegration:
    """Integration between agent-runtimes and mcp-codemode.
    
    Connects the agent-runtimes MCP infrastructure with
    mcp-codemode's code execution capabilities.
    
    Example:
        from agent_runtimes.integrations.codemode import CodemodeIntegration
        
        integration = CodemodeIntegration()
        await integration.setup()
        
        # Execute code that uses tools
        result = await integration.execute_code('''
            from generated.servers.filesystem import read_file
            content = await read_file({"path": "/tmp/data.txt"})
            print(content)
        ''')
    """
    
    def __init__(
        self,
        mcp_manager: Optional[MCPManager] = None,
        skills_path: str = "./skills",
        sandbox_variant: str = "local-eval",
    ):
        """Initialize the integration.
        
        Args:
            mcp_manager: Optional MCPManager from agent-runtimes.
            skills_path: Directory for skill storage.
            sandbox_variant: Sandbox type for code execution.
        """
        self.mcp_manager = mcp_manager or get_mcp_manager()
        self.skills_path = skills_path
        self.sandbox_variant = sandbox_variant
        
        # Lazy imports for optional dependencies
        self._registry = None
        self._executor = None
        self._skill_manager = None
        self._setup_done = False
    
    async def setup(self) -> None:
        """Set up the integration.
        
        Imports mcp-codemode and agent-skills, configures the
        tool registry with servers from agent-runtimes.
        """
        if self._setup_done:
            return
        
        try:
            from mcp_codemode import (
                ToolRegistry,
                CodeModeExecutor,
                CodeModeConfig,
                MCPServerConfig,
            )
            from agent_skills import SkillsManager
            
            # Set up the tool registry
            self._registry = ToolRegistry()
            
            # Add MCP servers from agent-runtimes
            for server in self.mcp_manager.get_servers():
                mcp_config = self._convert_server_config(server)
                if mcp_config:
                    self._registry.add_server(mcp_config)
            
            # Discover tools from all servers
            await self._registry.discover_all()
            
            # Set up the code executor
            config = CodeModeConfig(
                skills_path=self.skills_path,
                sandbox_variant=self.sandbox_variant,
            )
            self._executor = CodeModeExecutor(self._registry, config)
            await self._executor.setup()
            
            # Set up the skill manager
            self._skill_manager = SkillsManager(
                skills_path=self.skills_path,
                sandbox_variant=self.sandbox_variant,
            )
            self._skill_manager.discover()
            
            self._setup_done = True
            logger.info("Codemode integration set up successfully")
            
        except ImportError as e:
            logger.warning(f"mcp-codemode or agent-skills not available: {e}")
            raise
    
    def _convert_server_config(self, server: MCPServer):
        """Convert agent-runtimes MCPServer to mcp-codemode config."""
        try:
            from mcp_codemode import MCPServerConfig
            
            return MCPServerConfig(
                name=server.id,
                transport=server.transport or "http",
                url=server.url,
                command=server.command,
                args=server.args or [],
            )
        except Exception as e:
            logger.warning(f"Failed to convert server config: {e}")
            return None
    
    # =========================================================================
    # Code Mode Operations
    # =========================================================================
    
    async def execute_code(
        self,
        code: str,
        timeout: float = 30.0,
        context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Execute code that can compose tools.
        
        Args:
            code: Python code to execute.
            timeout: Execution timeout.
            context: Optional variables to inject.
            
        Returns:
            Execution result dictionary.
        """
        if not self._setup_done:
            await self.setup()
        
        if context and self._executor._sandbox:
            for name, value in context.items():
                self._executor._sandbox.set_variable(name, value)
        
        execution = await self._executor.execute(code, timeout=timeout)
        
        return {
            "success": not execution.error,
            "result": execution.results,
            "output": execution.logs.stdout if execution.logs else "",
            "error": str(execution.error) if execution.error else None,
        }
    
    async def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> Any:
        """Call a single tool.
        
        Args:
            tool_name: Full tool name (server__toolname).
            arguments: Tool arguments.
            
        Returns:
            Tool result.
        """
        if not self._setup_done:
            await self.setup()
        
        return await self._executor.call_tool(tool_name, arguments)
    
    async def search_tools(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search for available tools.
        
        Args:
            query: Search query.
            limit: Maximum results.
            
        Returns:
            List of matching tools.
        """
        if not self._setup_done:
            await self.setup()
        
        result = await self._registry.search_tools(query, limit=limit)
        
        return [
            {
                "name": t.name,
                "description": t.description,
                "server": t.server_name,
            }
            for t in result.tools
        ]
    
    # =========================================================================
    # Skills Operations
    # =========================================================================
    
    async def run_skill(
        self,
        skill_name: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Run a skill by name.
        
        Args:
            skill_name: Name of the skill.
            arguments: Optional arguments.
            
        Returns:
            Skill execution result.
        """
        if not self._setup_done:
            await self.setup()
        
        skill = self._skill_manager.get(skill_name)
        if not skill:
            return {
                "success": False,
                "error": f"Skill not found: {skill_name}",
            }
        
        execution = await self._skill_manager.execute(skill, arguments)
        
        return {
            "success": execution.success,
            "result": execution.result,
            "error": execution.error,
        }
    
    async def search_skills(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search for skills.
        
        Args:
            query: Search query.
            limit: Maximum results.
            
        Returns:
            List of matching skills.
        """
        if not self._setup_done:
            await self.setup()
        
        result = self._skill_manager.search(query, limit=limit)
        
        return [
            {
                "name": s.name,
                "description": s.description,
                "tags": s.metadata.tags,
            }
            for s in result.skills
        ]
    
    # =========================================================================
    # Cleanup
    # =========================================================================
    
    async def cleanup(self) -> None:
        """Clean up resources."""
        if self._executor:
            await self._executor.cleanup()
        self._setup_done = False
    
    async def __aenter__(self) -> "CodemodeIntegration":
        await self.setup()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.cleanup()


def get_codemode_integration(
    mcp_manager: Optional[MCPManager] = None,
) -> CodemodeIntegration:
    """Get a CodemodeIntegration instance.
    
    Factory function for creating integration instances.
    
    Args:
        mcp_manager: Optional MCPManager.
        
    Returns:
        CodemodeIntegration instance.
    """
    return CodemodeIntegration(mcp_manager=mcp_manager)
