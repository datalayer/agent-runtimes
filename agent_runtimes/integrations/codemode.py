# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Integration module for agent-codemode and agent-skills.

This module provides integration between:
- agent-runtimes: The main agent infrastructure
- agent-codemode: Code-first MCP tool composition
- agent-skills: Reusable agent skill management

It allows agents running on agent-runtimes to:
- Use Code Mode for efficient tool composition
- Access and execute skills
- Discover tools progressively
"""

import logging
from typing import TYPE_CHECKING, Any, Optional

from agent_runtimes.mcp.manager import MCPManager, get_mcp_manager

if TYPE_CHECKING:
    from agent_codemode import MCPServerConfig
from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)


class CodemodeIntegration:
    """
    Integration between agent-runtimes and agent-codemode.

    Connects the agent-runtimes MCP infrastructure with
    agent-codemode's code execution capabilities.

    Example:
        ```python
        from agent_runtimes.integrations.codemode import CodemodeIntegration

        integration = CodemodeIntegration()
        await integration.setup()

        # Execute code that uses tools
        result = await integration.execute_code('''
            from generated.mcp.filesystem import read_file
            content = await read_file({"path": "/tmp/data.txt"})
            print(content)
        ''')
        ```
    """

    def __init__(
        self,
        mcp_manager: Optional[MCPManager] = None,
        skills_path: str = "./skills",
        sandbox_variant: str = "local-eval",
    ):
        """
        Initialize the integration.

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
        """
        Set up the integration.

        Imports agent-codemode and agent-skills, configures the
        tool registry with servers from agent-runtimes.
        """
        if self._setup_done:
            return

        try:
            from agent_codemode import (
                CodeModeConfig,
                CodeModeExecutor,
                ToolRegistry,
            )
            from agent_skills.simple import SimpleSkillsManager

            # Set up the tool registry
            self._registry = ToolRegistry()

            # Add MCP servers from agent-runtimes
            for server in self.mcp_manager.get_servers():
                mcp_config = self._convert_server_config(server)
                if mcp_config:
                    self._registry.add_server(mcp_config)

            # Discover tools from all servers
            await self._registry.discover_all()

            # Get MCP proxy URL from sandbox manager or environment
            # This enables two-container architecture where Jupyter kernel
            # calls tools via HTTP to the agent-runtimes container
            mcp_proxy_url = None
            try:
                import os

                mcp_proxy_url = os.getenv("AGENT_RUNTIMES_MCP_PROXY_URL")
                if not mcp_proxy_url:
                    from ..services.code_sandbox_manager import get_code_sandbox_manager

                    manager_status = get_code_sandbox_manager().get_status()
                    mcp_proxy_url = manager_status.get("mcp_proxy_url")
            except Exception:
                pass

            # Set up the code executor
            config = CodeModeConfig(
                skills_path=self.skills_path,
                sandbox_variant=self.sandbox_variant,
                **({} if mcp_proxy_url is None else {"mcp_proxy_url": mcp_proxy_url}),
            )
            self._executor = CodeModeExecutor(self._registry, config)
            await self._executor.setup()

            # Set up the skill manager (simple, file-based)
            self._skill_manager = SimpleSkillsManager(self.skills_path)

            self._setup_done = True
            logger.info("Codemode integration set up successfully")

        except ImportError as e:
            logger.warning(f"agent-codemode or agent-skills not available: {e}")
            raise

    def _convert_server_config(self, server: MCPServer) -> Optional["MCPServerConfig"]:
        """
        Convert agent-runtimes MCPServer to agent-codemode config.
        """
        try:
            from agent_codemode import MCPServerConfig

            return MCPServerConfig(
                name=server.id,
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
        """
        Execute code that can compose tools.

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

        # Build error message from ExecutionResult's richer error fields
        error_message = None
        if not execution.execution_ok:
            # Infrastructure-level failure (sandbox failed to execute code)
            error_message = execution.execution_error or "Sandbox execution failed"
        elif execution.code_error:
            # Code-level error (Python exception in user code)
            error_message = f"{execution.code_error.name}: {execution.code_error.value}"

        return {
            "success": execution.success,
            "execution_ok": execution.execution_ok,
            "execution_error": execution.execution_error,
            "code_error": {
                "name": execution.code_error.name,
                "value": execution.code_error.value,
                "traceback": execution.code_error.traceback,
            }
            if execution.code_error
            else None,
            "result": execution.results,
            "output": execution.logs.stdout_text if execution.logs else "",
            "error": error_message,  # Keep for backwards compatibility
        }

    async def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> Any:
        """
        Call a single tool.

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
        """
        Search for available tools.

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
        """
        Run a skill by name.

        Args:
            skill_name: Name of the skill.
            arguments: Optional arguments.

        Returns:
            Skill execution result.
        """
        if not self._setup_done:
            await self.setup()

        execution = await self._executor.execute_skill(skill_name, arguments)

        # Build error message from ExecutionResult's richer error fields
        error_message = None
        if not execution.execution_ok:
            # Infrastructure-level failure (sandbox failed to execute code)
            error_message = execution.execution_error or "Sandbox execution failed"
        elif execution.code_error:
            # Code-level error (Python exception in user code)
            error_message = f"{execution.code_error.name}: {execution.code_error.value}"

        return {
            "success": execution.success,
            "execution_ok": execution.execution_ok,
            "execution_error": execution.execution_error,
            "code_error": {
                "name": execution.code_error.name,
                "value": execution.code_error.value,
                "traceback": execution.code_error.traceback,
            }
            if execution.code_error
            else None,
            "result": execution.results,
            "error": error_message,  # Keep for backwards compatibility
        }

    async def search_skills(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Search for skills.

        Args:
            query: Search query.
            limit: Maximum results.

        Returns:
            List of matching skills.
        """
        if not self._setup_done:
            await self.setup()

        return [
            {
                "name": s.name,
                "description": s.description,
                "tags": s.tags,
            }
            for s in self._skill_manager.search_skills(query, limit=limit)
        ]

    # =========================================================================
    # Cleanup
    # =========================================================================

    async def cleanup(self) -> None:
        """
        Clean up resources.
        """
        if self._executor:
            await self._executor.cleanup()
        self._setup_done = False

    async def __aenter__(self) -> "CodemodeIntegration":
        await self.setup()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.cleanup()


def get_codemode_integration(
    mcp_manager: Optional[MCPManager] = None,
) -> CodemodeIntegration:
    """
    Get a CodemodeIntegration instance.

    Factory function for creating integration instances.

    Args:
        mcp_manager: Optional MCPManager.

    Returns:
        CodemodeIntegration instance.
    """
    return CodemodeIntegration(mcp_manager=mcp_manager)
