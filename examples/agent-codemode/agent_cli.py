#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Pydantic AI Agent CLI with Agent Codemode (STDIO).

This agent connects to a local MCP stdio server and provides an
interactive CLI. It supports a Codemode variant that uses the
agent-codemode toolset for code-first tool composition.
"""

from __future__ import annotations

import asyncio
import inspect
import io
import logging
import sys
from pathlib import Path
from typing import Any, Optional

try:
    from pydantic_ai import Agent
    from pydantic_ai.mcp import MCPServerStdio

    HAS_PYDANTIC_AI = True
except ImportError:
    HAS_PYDANTIC_AI = False

try:
    from rich.console import Console

    HAS_RICH = True
except ImportError:
    HAS_RICH = False

from agent_runtimes.context import (
    UsageTracker,
)

logger = logging.getLogger(__name__)


def _resolve_mcp_server_path() -> str:
    return str(Path(__file__).with_name("example_mcp_server.py").resolve())


def _resolve_config_path() -> str:
    return str(Path(__file__).with_name("agent_cli_config.json").resolve())


def _load_mcp_config() -> list[dict[str, Any]]:
    """
    Load MCP server configuration from JSON config file.

    Returns:
        List of MCP server configurations, or empty list if config not found.
    """
    config_path = _resolve_config_path()

    if not Path(config_path).exists():
        logger.debug("Config file not found at %s, using default", config_path)
        return []

    try:
        import json

        with open(config_path, "r") as f:
            config = json.load(f)

        if config and "mcp_servers" in config:
            servers = config["mcp_servers"]
            logger.debug("Loaded %d MCP server(s) from config", len(servers))
            return servers
        return []
    except Exception as e:
        logger.warning("Failed to load config file: %s", e)
        return []


def _build_prompt_examples(codemode: bool) -> str:
    base = [
        "Create random content of 1000 words, write it to file.txt, and read it ten times.",
        "Generate 500 words of random text, write to ./data/sample.txt, then read it once.",
        "Write random content to ./data/log.txt and read it back with max_chars=200.",
    ]
    if codemode:
        base.append(
            "(Codemode) Use execute_code to generate text, write it once, and read it ten times "
            "without returning the full content each time."
        )
    else:
        base.append("(Standard) Use the MCP tools directly for each step.")
    return "\n".join(f"  - {item}" for item in base)


def _build_system_prompt(
    codemode: bool,
    tool_hints: Optional[list[tuple[str, str]]] = None,
) -> str:
    if not codemode:
        lines = [
            "You are a helpful AI assistant with access to MCP tools.",
            "Use MCP tools when they are the best way to complete the task.",
            "Avoid tool discovery unless the user asks about tools or a tool is unknown.",
            "When unsure, ask for clarification.",
        ]
        if tool_hints:
            lines.append("Known tools:")
            for name, description in tool_hints:
                if description:
                    lines.append(f"- {name}: {description}")
                else:
                    lines.append(f"- {name}")
        return " ".join(lines)

    # For codemode: emphasize using the 4 core codemode tools
    lines = [
        "You are a helpful AI assistant with Agent Codemode.",
        "",
        "## IMPORTANT: Be Honest About Your Capabilities",
        "NEVER claim to have tools or capabilities you haven't verified.",
        "",
        "## Core Codemode Tools",
        "Use these 4 tools to accomplish any task:",
        "1. **list_servers** - List available MCP servers",
        "   Use this to see what MCP servers you can access.",
        "",
        "2. **search_tools** - Progressive tool discovery by natural language query",
        "   Use this to find relevant tools before executing tasks.",
        "",
        "3. **get_tool_details** - Get full tool schema and documentation",
        "   Use this to understand tool parameters before calling them.",
        "",
        "4. **execute_code** - Run Python code that composes multiple tools",
        "   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.",
        "   Variables, functions, and state PERSIST between execute_code calls.",
        "   Import tools using: `from generated.servers.<server_name> import <function_name>`",
        "   NEVER use `import *` - always use explicit named imports.",
        "",
        "",
        "## Recommended Workflow",
        "1. **Discover**: Use list_servers and search_tools to find relevant tools",
        # The above code is a comment in Python that provides guidance on understanding and using the
        # `get_tool_details` function. It suggests checking the parameters of the function and using any other
        # tools that may be helpful in correctly using subsequent tools.
        "2. **Understand**: Use get_tool_details to check parameters",
        "3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed",
        "",
        "## Token Efficiency",
        "When possible, chain multiple tool calls in a single execute_code block.",
        "This reduces output tokens by processing intermediate results in code rather than returning them.",
        "If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.",
        "",
    ]
    return "\n".join(lines)


async def _dump_context_to_file(
    filename: str,
    agent: Any,
    message_history: list[Any] | None,
    codemode: bool = False,
) -> None:
    """
    Dump the context in provider-specific format showing what the LLM sees.
    """
    import json
    from datetime import datetime

    lines: list[str] = []
    lines.append("=" * 80)
    lines.append(f"CONTEXT DUMP - {datetime.now().isoformat()}")
    lines.append("=" * 80)

    if not message_history:
        lines.append("\n(No message history)")
        with open(filename, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        return

    # Get the underlying model (unwrap InstrumentedModel if needed)
    model = agent._model
    while hasattr(model, "wrapped"):
        model = model.wrapped

    lines.append(f"\nModel: {model.model_name}")
    lines.append(f"Provider: {model.system}")

    def serialize_provider_msg(msg: Any) -> Any:
        """
        Recursively serialize provider message to JSON-safe format.
        """
        if isinstance(msg, dict):
            return {k: serialize_provider_msg(v) for k, v in msg.items()}
        elif isinstance(msg, list):
            return [serialize_provider_msg(item) for item in msg]
        elif isinstance(msg, bytes):
            return msg.decode("utf-8", errors="replace")
        elif hasattr(msg, "model_dump"):
            return msg.model_dump()
        elif hasattr(msg, "__dict__"):
            return serialize_provider_msg(vars(msg))
        else:
            return msg

    from pydantic_ai.models import ModelRequestParameters

    model_request_parameters = ModelRequestParameters()
    model_settings = getattr(agent, "model_settings", None) or {}

    # Try to get tool definitions from the agent's toolsets
    tool_definitions = []
    try:
        from pydantic_ai.tools import ToolDefinition

        # Get tools from agent.toolsets property (includes _function_toolset and _user_toolsets)
        for toolset in agent.toolsets:
            # Check for CodemodeToolset (from agent_codemode) - uses TOOL_SCHEMAS
            if toolset.__class__.__name__ == "CodemodeToolset":
                try:
                    from agent_codemode.tool_definitions import TOOL_SCHEMAS

                    for name, schema in TOOL_SCHEMAS.items():
                        # Check if this tool is enabled in the toolset
                        if name in [
                            "list_tool_names",
                            "search_tools",
                            "get_tool_details",
                            "list_servers",
                        ]:
                            if not getattr(toolset, "allow_discovery_tools", True):
                                continue
                        if name == "call_tool":
                            if not getattr(toolset, "allow_direct_tool_calls", False):
                                continue
                        tool_definitions.append(
                            ToolDefinition(
                                name=name,
                                description=schema.get("description", ""),
                                parameters_json_schema=schema.get(
                                    "parameters", {"type": "object", "properties": {}}
                                ),
                            )
                        )
                except ImportError:
                    pass
            # FunctionToolset has .tools dict with Tool objects
            elif hasattr(toolset, "tools") and isinstance(toolset.tools, dict):
                for name, tool in toolset.tools.items():
                    desc = getattr(tool, "description", None) or ""
                    # Get the json schema from function_schema if available
                    schema = {"type": "object", "properties": {}}
                    if hasattr(tool, "function_schema") and tool.function_schema:
                        schema = getattr(tool.function_schema, "json_schema", schema)
                    tool_definitions.append(
                        ToolDefinition(
                            name=name,
                            description=desc,
                            parameters_json_schema=schema,
                        )
                    )
    except Exception as e:
        lines.append(f"\n(Error extracting tool definitions: {e})")

    provider_format_found = False

    # Try Bedrock format (_map_messages - plural)
    if hasattr(model, "_map_messages"):
        try:
            system_blocks, provider_messages = await model._map_messages(
                list(message_history),
                model_request_parameters,
                model_settings,
            )
            provider_format_found = True

            lines.append("\n" + "-" * 40)
            lines.append("SYSTEM PROMPT (Bedrock Format)")
            lines.append("-" * 40)
            if system_blocks:
                serialized_system = serialize_provider_msg(system_blocks)
                lines.append(json.dumps(serialized_system, indent=2, default=str))
            else:
                lines.append("(empty)")

            # Add tool configuration if available
            if hasattr(model, "_map_tool_config") and tool_definitions:
                try:
                    params_with_tools = ModelRequestParameters(
                        function_tools=tool_definitions,
                        allow_text_output=True,
                    )
                    tool_config = model._map_tool_config(
                        params_with_tools, model_settings
                    )

                    lines.append("\n" + "-" * 40)
                    lines.append("TOOL CONFIGURATION (Bedrock Format)")
                    lines.append("-" * 40)
                    if tool_config:
                        serialized_tools = serialize_provider_msg(tool_config)
                        lines.append(
                            json.dumps(serialized_tools, indent=2, default=str)
                        )
                    else:
                        lines.append("(no tools)")
                except Exception as e:
                    lines.append(f"\n(Error getting tool config: {e})")
            elif not tool_definitions:
                lines.append("\n" + "-" * 40)
                lines.append("TOOL CONFIGURATION (Bedrock Format)")
                lines.append("-" * 40)
                lines.append("(no tools extracted from agent)")

            lines.append("\n" + "-" * 40)
            lines.append("MESSAGES (Bedrock Format)")
            lines.append("-" * 40)
            serialized = serialize_provider_msg(provider_messages)
            lines.append(json.dumps(serialized, indent=2, default=str))

        except Exception as e:
            lines.append(f"\n(Error getting Bedrock format: {e})")

    # Try Anthropic format (_map_message - singular)
    if not provider_format_found and hasattr(model, "_map_message"):
        try:
            system_prompt, provider_messages = await model._map_message(
                list(message_history),
                model_request_parameters,
                model_settings,
            )
            provider_format_found = True

            lines.append("\n" + "-" * 40)
            lines.append("SYSTEM PROMPT (Anthropic Format)")
            lines.append("-" * 40)
            if isinstance(system_prompt, str):
                lines.append(system_prompt if system_prompt else "(empty)")
            elif isinstance(system_prompt, list):
                serialized_system = serialize_provider_msg(system_prompt)
                lines.append(json.dumps(serialized_system, indent=2, default=str))
            else:
                lines.append(str(system_prompt) if system_prompt else "(empty)")

            lines.append("\n" + "-" * 40)
            lines.append("MESSAGES (Anthropic Format)")
            lines.append("-" * 40)
            serialized = serialize_provider_msg(provider_messages)
            lines.append(json.dumps(serialized, indent=2, default=str))

        except Exception as e:
            lines.append(f"\n(Error getting Anthropic format: {e})")

    # Fallback to pydantic-ai format
    if not provider_format_found:
        from pydantic_ai.messages import ModelMessagesTypeAdapter

        lines.append(
            "\n(No provider-specific format available, using pydantic-ai format)"
        )
        json_bytes = ModelMessagesTypeAdapter.dump_json(list(message_history), indent=2)
        lines.append(json_bytes.decode("utf-8"))

    lines.append("\n" + "=" * 80)
    lines.append("END OF CONTEXT DUMP")
    lines.append("=" * 80)

    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


async def _list_available_tools(
    codemode: bool,
    codemode_toolset: object | None,
    mcp_server_path: str,
) -> list[tuple[str, str]]:
    tools: list[tuple[str, str]] = []

    if codemode and codemode_toolset is not None:
        registry = getattr(codemode_toolset, "registry", None)
        if registry is not None:
            if not registry.list_tools():
                await registry.discover_all()
            for tool in registry.list_tools(include_deferred=True):
                tools.append((tool.name, tool.description or ""))
            return tools

    # Use raw subprocess to avoid anyio cancel-scope issues with ClientSession
    try:
        import json as _json
        import os as _os

        env = {**_os.environ}
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            mcp_server_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "agent_cli", "version": "1.0.0"},
            },
        }
        if proc.stdin:
            proc.stdin.write((_json.dumps(request) + "\n").encode())
            await proc.stdin.drain()
        if proc.stdout:
            await proc.stdout.readline()  # discard initialize response
        request = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        if proc.stdin:
            proc.stdin.write((_json.dumps(request) + "\n").encode())
            await proc.stdin.drain()
        if proc.stdout:
            line = await proc.stdout.readline()
            result = _json.loads(line.decode())
            for tool in result.get("result", {}).get("tools", []):
                tools.append((tool.get("name", ""), tool.get("description", "")))
        proc.terminate()
        await proc.wait()
    except Exception:
        pass

    return tools


def create_agent(model: str, codemode: bool) -> tuple[Agent, object | None]:
    if not HAS_PYDANTIC_AI:
        print("❌ Error: pydantic-ai not installed")
        print("   Install with: pip install 'pydantic-ai[mcp]'\n")
        sys.exit(1)

    mcp_server_path = _resolve_mcp_server_path()

    if codemode:
        from agent_codemode import (
            CodeModeConfig,
            CodemodeToolset,
            MCPServerConfig,
            ToolRegistry,
        )

        registry = ToolRegistry()

        # Load MCP servers from config file
        mcp_configs = _load_mcp_config()
        if mcp_configs:
            print(f"Loading {len(mcp_configs)} MCP server(s) from config...")
            for server_config in mcp_configs:
                name = server_config.get("name", "mcp_server")
                command = server_config.get("command", sys.executable)
                args = server_config.get("args", [])
                env = server_config.get("env", {})
                # Resolve relative paths
                resolved_args = []
                config_dir = Path(_resolve_config_path()).parent
                for arg in args:
                    if arg.startswith("./") or arg.startswith("../"):
                        resolved_args.append(str((config_dir / arg).resolve()))
                    else:
                        resolved_args.append(arg)
                registry.add_server(
                    MCPServerConfig(
                        name=name,
                        command=command,
                        args=resolved_args,
                        env=env,
                    )
                )
                print(f"  - Added server: {name}")
                logger.debug("Added MCP server from config: %s", name)
        else:
            # Fallback to default example_mcp server
            registry.add_server(
                MCPServerConfig(
                    name="example_mcp",
                    command=sys.executable,
                    args=[mcp_server_path],
                )
            )

        repo_root = Path(__file__).resolve().parents[2]
        config = CodeModeConfig(
            workspace_path=str((repo_root / "workspace").resolve()),
            generated_path=str((repo_root / "generated").resolve()),
            skills_path=str((repo_root / "skills").resolve()),
            allow_direct_tool_calls=False,
        )

        toolset = CodemodeToolset(
            registry=registry,
            config=config,
            allow_discovery_tools=True,  # Enable discovery tools (search_tools, get_tool_details, list_tool_names, list_servers)
        )
        toolsets = [toolset]
    else:
        # Load MCP servers from config file
        mcp_configs = _load_mcp_config()
        if mcp_configs:
            toolsets = []
            config_dir = Path(_resolve_config_path()).parent
            for server_config in mcp_configs:
                command = server_config.get("command", sys.executable)
                args = server_config.get("args", [])
                timeout = server_config.get("timeout", 300.0)
                env = server_config.get("env")
                # Resolve relative paths
                resolved_args = []
                for arg in args:
                    if arg.startswith("./") or arg.startswith("../"):
                        resolved_args.append(str((config_dir / arg).resolve()))
                    else:
                        resolved_args.append(arg)
                mcp_server = MCPServerStdio(
                    command,
                    args=resolved_args,
                    timeout=float(timeout),
                    env=env,
                )
                toolsets.append(mcp_server)
                logger.debug(
                    "Added MCP server from config: %s",
                    server_config.get("name", "unnamed"),
                )
        else:
            # Fallback to default example_mcp server
            mcp_server = MCPServerStdio(
                sys.executable,
                args=[mcp_server_path],
                timeout=300.0,
            )
            toolsets = [mcp_server]
        toolset = None

    # Skip upfront tool discovery to avoid anyio cancel-scope issues.
    # Tool hints are omitted; toolset will discover tools lazily on first use.
    tool_hints: list[tuple[str, str]] = []

    agent_kwargs = dict(
        model=model,
        toolsets=toolsets,
        system_prompt=_build_system_prompt(codemode, tool_hints),
    )
    try:
        signature = inspect.signature(Agent)
        if "retries" in signature.parameters:
            agent_kwargs["retries"] = 3
        elif "max_retries" in signature.parameters:
            agent_kwargs["max_retries"] = 3
        elif "model_settings" in signature.parameters:
            agent_kwargs["model_settings"] = {"max_retries": 3}
    except Exception:
        agent_kwargs["model_settings"] = {"max_retries": 3}

    agent = Agent(**agent_kwargs)

    return agent, toolset


def main() -> None:
    if sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    # Suppress verbose MCP server logs
    logging.getLogger("mcp.server").setLevel(logging.WARNING)

    import argparse

    parser = argparse.ArgumentParser(description="MCP Agent CLI with Agent Codemode")
    parser.add_argument(
        "--model",
        type=str,
        default="anthropic:claude-sonnet-4-0",
        help="Model to use (default: anthropic:claude-sonnet-4-0)",
    )
    parser.add_argument(
        "--codemode", action="store_true", help="Enable Agent Codemode mode"
    )
    parser.add_argument("-q", "--query", type=str, help="Run a single query and exit")
    args = parser.parse_args()

    model = args.model
    codemode = args.codemode
    query = getattr(args, "query", None)

    print("\n" + "=" * 72)
    if codemode:
        print("🤖 𝄃𝄂𝄂𝄀𝄁𝄃𝄂𝄂𝄃 Agent Codemode Agent CLI")
    else:
        print("🤖 MCP Agent CLI")
    print("=" * 72)
    print(f"\nMode: {'Codemode' if codemode else 'Standard MCP'}")
    print(f"Model: {model}")

    print("\n📋 Example prompts:")
    print(_build_prompt_examples(codemode))

    agent, codemode_toolset = create_agent(model=model, codemode=codemode)

    async def _run_cli() -> None:
        prompt = "𝄃𝄂𝄂𝄀𝄁𝄃𝄂𝄂𝄃 agent-codemode-agent ➤ " if codemode else "mcp-agent ➤ "
        multiline = False
        message_history = []  # Store conversation history
        usage_tracker = UsageTracker(codemode=codemode)

        if codemode_toolset:
            if codemode:
                logger.debug("Initializing codemode environment...")
            try:
                if hasattr(codemode_toolset, "start"):
                    await codemode_toolset.start()
            except Exception as e:
                logger.debug("Failed to start codemode", exc_info=e)
                return

        async with agent:
            # Handle single query mode
            if query:
                usage_tracker.start_turn()
                async with agent.iter(query, message_history=message_history) as run:
                    run_result = run.result
                    run_usage = run.usage()
                    message_history = run.all_messages()

                if run_result is not None:
                    reply = (
                        getattr(run_result, "output", None)
                        or getattr(run_result, "data", None)
                        or str(run_result)
                    )
                    print(reply)

                    # Record and display usage
                    codemode_counts = None
                    if codemode and codemode_toolset is not None:
                        if hasattr(codemode_toolset, "get_call_counts"):
                            codemode_counts = codemode_toolset.get_call_counts()
                    usage_tracker.record_turn(run_usage, codemode_counts)

                    if HAS_RICH:
                        console = Console()
                        console.print()

                        from agent_runtimes.context import (
                            extract_context_snapshot,
                            get_model_context_window,
                        )

                        turn_usage = usage_tracker.get_turn_usage()
                        session_usage_obj = usage_tracker.get_session_usage()
                        context_window = get_model_context_window(model)

                        snapshot = extract_context_snapshot(
                            agent,
                            "agent_cli",
                            context_window=context_window,
                            message_history=message_history,
                            model_input_tokens=turn_usage.input_tokens,
                            model_output_tokens=turn_usage.output_tokens,
                            turn_usage=turn_usage,
                            session_usage=session_usage_obj,
                            tool_definitions=None,
                            turn_start_time=usage_tracker._turn_start_time,
                        )

                        per_req = (
                            snapshot.per_request_usage
                            if hasattr(snapshot, "per_request_usage")
                            else []
                        )
                        tool_names = []
                        for r in per_req[-turn_usage.requests :]:
                            tool_names.extend(r.tool_names)
                        if tool_names and snapshot.turn_usage:
                            snapshot.turn_usage.tool_names = tool_names

                        console.print(snapshot.to_table(show_context=False))
                    else:
                        print(
                            f"\nToken usage (prompt): {usage_tracker.format_turn_usage()}"
                        )
                        print(
                            f"Token usage (session): {usage_tracker.format_session_usage()}"
                        )
                return

            mcp_server_path = _resolve_mcp_server_path()
            while True:
                if multiline:
                    print("Enter multiline input. End with /end on its own line.")
                    lines: list[str] = []
                    while True:
                        line = await asyncio.to_thread(input, "… ")
                        if line.strip() == "/end":
                            break
                        lines.append(line)
                    user_input = "\n".join(lines).strip()
                    multiline = False
                else:
                    user_input = await asyncio.to_thread(input, prompt)
                    user_input = user_input.strip()

                if not user_input:
                    continue

                if user_input in {"/exit", "/quit"}:
                    break
                if user_input == "/markdown":
                    print("Markdown rendering is not enabled in this minimal CLI.")
                    continue
                if user_input == "/multiline":
                    multiline = True
                    continue
                if user_input == "/cp":
                    print("Clipboard copy is not enabled in this minimal CLI.")
                    continue
                if user_input == "/tools":
                    print("Listing available tools...")
                    try:
                        tools = await _list_available_tools(
                            codemode, codemode_toolset, mcp_server_path
                        )
                        if tools:
                            for name, description in tools:
                                if description:
                                    print(f"  • {name}: {description}")
                                else:
                                    print(f"  • {name}")
                            print(f"\nTotal: {len(tools)} tools")
                        else:
                            print("  No tools found.")
                    except Exception as e:
                        print(f"Error listing tools: {e}")
                    continue
                if user_input.startswith("/context"):
                    parts = user_input.split()
                    if len(parts) >= 2 and parts[1] == "dump":
                        # Dump the context to a file
                        filename = parts[2] if len(parts) >= 3 else "context_dump.txt"
                        try:
                            await _dump_context_to_file(
                                filename,
                                agent,
                                message_history,
                                codemode=codemode,
                            )
                            print(f"Context dumped to {filename}")
                        except Exception as e:
                            print(f"Error dumping context: {e}")
                    else:
                        print("Usage: /context dump [filename.txt]")
                    continue

                run_result = None
                run_usage = None
                iteration_count = 0
                usage_tracker.start_turn()
                async with agent.iter(
                    user_input, message_history=message_history
                ) as run:
                    async for node in run:
                        iteration_count += 1
                        node_type = type(node).__name__
                        # Print all node types for debugging
                        logger.debug("  [iter %s] %s", iteration_count, node_type)

                        if node_type == "CallToolsNode":
                            mr = getattr(node, "model_response", None)
                            if mr and hasattr(mr, "parts"):
                                for p in mr.parts:
                                    if hasattr(p, "tool_name"):
                                        args = getattr(p, "args", {})
                                        if isinstance(args, dict) and "code" in args:
                                            code_preview = args["code"][:100].replace(
                                                "\n", "\\n"
                                            )
                                            logger.debug(
                                                "    -> %s(code=%s...)",
                                                p.tool_name,
                                                code_preview,
                                            )
                                        else:
                                            logger.debug(
                                                "    -> %s(%s)", p.tool_name, args
                                            )
                        elif node_type == "HandleResponseNode":
                            # Tool results might be here
                            data = getattr(node, "data", None)
                            if data:
                                logger.debug("    -> data: %s", str(data)[:200])
                    run_result = run.result
                    run_usage = run.usage()
                    # Update message history with the conversation
                    message_history = run.all_messages()

                if run_result is None:
                    print("No result returned.")
                    continue

                reply = getattr(run_result, "output", None)
                if reply is None:
                    reply = getattr(run_result, "data", None)
                if reply is None:
                    reply = str(run_result)

                # Record turn usage with the tracker
                codemode_counts = None
                if codemode and codemode_toolset is not None:
                    if hasattr(codemode_toolset, "get_call_counts"):
                        codemode_counts = codemode_toolset.get_call_counts()
                usage_tracker.record_turn(run_usage, codemode_counts)

                print(reply)

                if HAS_RICH:
                    console = Console()
                    console.print()

                    # Use the original extract_context_snapshot approach
                    from agent_runtimes.context import (
                        extract_context_snapshot,
                        get_model_context_window,
                    )

                    turn_usage = usage_tracker.get_turn_usage()
                    session_usage_obj = usage_tracker.get_session_usage()

                    # Get context window for the model
                    context_window = get_model_context_window(model)

                    snapshot = extract_context_snapshot(
                        agent,
                        "agent_cli",
                        context_window=context_window,
                        message_history=message_history,
                        model_input_tokens=turn_usage.input_tokens,
                        model_output_tokens=turn_usage.output_tokens,
                        turn_usage=turn_usage,
                        session_usage=session_usage_obj,
                        tool_definitions=None,
                    )

                    # Get tool names from per_request_usage (last N requests for this turn)
                    # Each request can have multiple tools, so flatten the lists
                    per_req = (
                        snapshot.per_request_usage
                        if hasattr(snapshot, "per_request_usage")
                        else []
                    )
                    tool_names = []
                    for r in per_req[-turn_usage.requests :]:
                        tool_names.extend(r.tool_names)
                    if tool_names and snapshot.turn_usage:
                        snapshot.turn_usage.tool_names = tool_names

                    console.print(snapshot.to_table(show_context=False))
                    console.print()
                else:
                    print(
                        f"\nToken usage (prompt): {usage_tracker.format_turn_usage()}"
                    )
                    print(
                        f"Token usage (session): {usage_tracker.format_session_usage()}\n"
                    )

    try:
        asyncio.run(_run_cli())
    except KeyboardInterrupt:
        pass
    finally:
        if codemode_toolset and hasattr(codemode_toolset, "cleanup"):
            try:
                asyncio.run(codemode_toolset.cleanup())
            except Exception as e:
                logger.debug("Error during cleanup", exc_info=e)


if __name__ == "__main__":
    main()
