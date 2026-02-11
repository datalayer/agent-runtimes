# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Factory Service.

Provides shared logic for creating agents with skills and codemode toolsets.
Used by both app.py (CLI agents) and routes/agents.py (API agents).
"""

import logging
import os
from pathlib import Path
from typing import Any

from ..mcp import get_mcp_manager

logger = logging.getLogger(__name__)


def create_skills_toolset(
    skills: list[str],
    skills_path: str,
    shared_sandbox: Any | None = None,
) -> Any | None:
    """
    Create an AgentSkillsToolset with the specified skills.

    Args:
        skills: List of skill names to load
        skills_path: Path to the skills directory
        shared_sandbox: Optional shared sandbox for state persistence

    Returns:
        AgentSkillsToolset instance or None if skills not available
    """
    try:
        from agent_skills import (
            PYDANTIC_AI_AVAILABLE,
            AgentSkill,
            AgentSkillsToolset,
            SandboxExecutor,
        )

        if not PYDANTIC_AI_AVAILABLE:
            logger.warning("agent-skills pydantic-ai integration not available")
            return None

        selected_set = set(skills)
        selected_skills: list[AgentSkill] = []

        for skill_md in Path(skills_path).rglob("SKILL.md"):
            try:
                skill = AgentSkill.from_skill_md(skill_md)
            except Exception as exc:
                logger.warning(f"Failed to load skill from {skill_md}: {exc}")
                continue
            if skill.name in selected_set:
                selected_skills.append(skill)
                logger.info(f"Loaded skill: {skill.name}")

        missing = selected_set - {s.name for s in selected_skills}
        if missing:
            logger.warning(
                f"Requested skills not found in {skills_path}: {sorted(missing)}"
            )

        # Create executor - use shared sandbox if available
        if shared_sandbox is not None:
            executor = SandboxExecutor(shared_sandbox)
            logger.info("Using shared managed sandbox for skills executor")
        else:
            # Use CodeSandboxManager for skills-only sandbox
            from .code_sandbox_manager import get_code_sandbox_manager

            sandbox_manager = get_code_sandbox_manager()

            # Configure if Jupyter sandbox URL is provided
            jupyter_sandbox_url = os.getenv("AGENT_RUNTIMES_JUPYTER_SANDBOX")
            if jupyter_sandbox_url:
                sandbox_manager.configure_from_url(jupyter_sandbox_url)
            else:
                sandbox_manager.configure(variant="local-eval")

            skills_sandbox = sandbox_manager.get_managed_sandbox()
            executor = SandboxExecutor(skills_sandbox)

        skills_toolset = AgentSkillsToolset(
            skills=selected_skills,
            executor=executor,
        )
        logger.info(f"Created AgentSkillsToolset with {len(selected_skills)} skills")
        return skills_toolset

    except ImportError as e:
        logger.warning(f"agent-skills package not installed, skills disabled: {e}")
        return None


def create_codemode_toolset(
    mcp_servers: list[Any],
    workspace_path: str,
    generated_path: str,
    skills_path: str,
    allow_direct_tool_calls: bool = False,
    shared_sandbox: Any | None = None,
    mcp_proxy_url: str | None = None,
    enable_discovery_tools: bool = True,
) -> Any | None:
    """
    Create a CodemodeToolset with the specified MCP servers.

    Args:
        mcp_servers: List of MCP server objects to register
        workspace_path: Path to the workspace directory
        generated_path: Path to the generated code directory
        skills_path: Path to the skills directory
        allow_direct_tool_calls: Whether to allow direct tool calls
        shared_sandbox: Optional shared sandbox for state persistence
        mcp_proxy_url: Optional MCP proxy URL for Jupyter/remote execution
        enable_discovery_tools: Whether to enable discovery tools (default: True)

    Returns:
        CodemodeToolset instance or None if codemode not available
    """
    try:
        from agent_codemode import (
            PYDANTIC_AI_AVAILABLE as CODEMODE_AVAILABLE,
        )
        from agent_codemode import (
            CodeModeConfig,
            CodemodeToolset,
            MCPServerConfig,
            ToolRegistry,
        )

        if not CODEMODE_AVAILABLE:
            logger.warning("agent-codemode pydantic-ai integration not available")
            return None

        # Build registry with MCP servers
        registry = ToolRegistry()

        for mcp_server in mcp_servers:
            if not mcp_server.enabled:
                logger.debug(f"Skipping disabled MCP server: {mcp_server.id}")
                continue

            # Normalize server name to valid Python identifier
            normalized_name = "".join(
                c if c.isalnum() or c == "_" else "_" for c in mcp_server.id
            )

            # Gather environment variables for the server
            server_env: dict[str, str] = {}

            # Add required env vars
            for env_key in mcp_server.required_env_vars:
                env_val = os.getenv(env_key)
                if env_val:
                    server_env[env_key] = env_val

            # Add any custom env from mcp_server.env (with expansion)
            if mcp_server.env:
                import re

                for env_key, env_value in mcp_server.env.items():
                    # Expand ${VAR} syntax
                    if isinstance(env_value, str) and "${" in env_value:
                        pattern = r"\$\{([^}]+)\}"

                        def replace(match: re.Match[str]) -> str:
                            var_name = match.group(1)
                            return os.environ.get(var_name, "")

                        expanded_value = re.sub(pattern, replace, env_value)
                        server_env[env_key] = expanded_value
                    else:
                        server_env[env_key] = env_value

            registry.add_server(
                MCPServerConfig(
                    name=normalized_name,
                    url=mcp_server.url if mcp_server.transport == "http" else "",
                    command=mcp_server.command or "",
                    args=mcp_server.args or [],
                    env=server_env,
                    enabled=mcp_server.enabled,
                )
            )
            logger.info(f"Added MCP server to codemode registry: {normalized_name}")

        # Create config with conditional mcp_proxy_url
        config_kwargs = {
            "workspace_path": workspace_path,
            "generated_path": generated_path,
            "skills_path": skills_path,
            "allow_direct_tool_calls": allow_direct_tool_calls,
        }

        # Add mcp_proxy_url if provided (for Jupyter/remote execution)
        if mcp_proxy_url:
            config_kwargs["mcp_proxy_url"] = mcp_proxy_url

        codemode_config = CodeModeConfig(**config_kwargs)

        logger.info(
            f"Codemode config: generated_path={codemode_config.generated_path}, "
            f"skills_path={codemode_config.skills_path}, "
            f"mcp_proxy_url={getattr(codemode_config, 'mcp_proxy_url', None)}"
        )

        codemode_toolset = CodemodeToolset(
            registry=registry,
            config=codemode_config,
            sandbox=shared_sandbox,
            allow_discovery_tools=enable_discovery_tools,
        )

        logger.info("Created CodemodeToolset")
        return codemode_toolset

    except ImportError as e:
        logger.warning(f"agent-codemode package not installed, codemode disabled: {e}")
        return None


async def initialize_codemode_toolset(codemode_toolset: Any) -> None:
    """
    Initialize a codemode toolset (start and discover tools).

    Args:
        codemode_toolset: The CodemodeToolset instance to initialize
    """
    if codemode_toolset is None:
        return

    try:
        # Initialize the toolset
        logger.info("Starting codemode toolset...")
        await codemode_toolset.start()

        # Log discovered tools
        if codemode_toolset.registry:
            discovered_tools = codemode_toolset.registry.list_tools(
                include_deferred=True
            )
            tool_names = [t.name for t in discovered_tools]
            logger.info(f"Codemode discovered {len(tool_names)} tools: {tool_names}")

        logger.info("Codemode toolset initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize codemode toolset: {e}")
        raise


def create_shared_sandbox(
    jupyter_sandbox_url: str | None = None,
) -> Any | None:
    """
    Create a shared managed sandbox proxy.

    The proxy always delegates to the manager's current sandbox, so when
    the manager is reconfigured (e.g. local-eval → local-jupyter),
    all consumers automatically use the new sandbox.

    Args:
        jupyter_sandbox_url: Optional Jupyter server URL (with token)

    Returns:
        ManagedSandbox proxy or None if code_sandboxes not available
    """
    try:
        from .code_sandbox_manager import get_code_sandbox_manager

        sandbox_manager = get_code_sandbox_manager()

        # Configure if Jupyter sandbox URL is provided
        if jupyter_sandbox_url:
            sandbox_manager.configure_from_url(jupyter_sandbox_url)
            logger.info(
                f"Configured sandbox manager for Jupyter: {jupyter_sandbox_url.split('?')[0]}"
            )
        else:
            # Use default local-eval sandbox
            sandbox_manager.configure(variant="local-eval")

        shared_sandbox = sandbox_manager.get_managed_sandbox()
        logger.info(
            f"Created managed sandbox proxy (variant={sandbox_manager.variant})"
        )
        return shared_sandbox

    except ImportError as e:
        logger.warning(
            f"code_sandboxes not installed, cannot create shared sandbox: {e}"
        )
        return None
