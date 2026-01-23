#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pydantic AI Agent CLI with Agent Codemode (STDIO).

This agent connects to a local MCP stdio server and provides an
interactive CLI. It supports a Codemode variant that uses the
agent-codemode toolset for code-first tool composition.
"""

from __future__ import annotations

import asyncio
import io
import sys
import logging
from pathlib import Path
from typing import Optional
import inspect

try:
    from pydantic_ai import Agent
    from pydantic_ai.mcp import MCPServerStdio
    HAS_PYDANTIC_AI = True
except ImportError:
    HAS_PYDANTIC_AI = False

try:
    from rich.console import Console
    from rich.table import Table
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

from agent_runtimes.context.snapshot import extract_context_snapshot, get_model_context_window
HAS_CONTEXT_SNAPSHOT = True

logger = logging.getLogger(__name__)


def _resolve_mcp_server_path() -> str:
    return str(Path(__file__).with_name("example_mcp_server.py").resolve())


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
        base.append(
            "(Standard) Use the MCP tools directly for each step."
        )
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
        "When greeting users or describing yourself, say you can DISCOVER what tools are available.",
        "Use search_tools FIRST to see what's actually available before claiming any capabilities.",
        "",
        "## Core Codemode Tools",
        "Use these 4 tools to accomplish any task:",
        "",
        "1. **search_tools** - Progressive tool discovery by natural language query",
        "   Use this to find relevant tools before executing tasks.",
        "",
        "2. **get_tool_details** - Get full tool schema and documentation",
        "   Use this to understand tool parameters before calling them.",
        "",
        "3. **execute_code** - Run Python code that composes multiple tools",
        "   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.",
        "   Variables, functions, and state PERSIST between execute_code calls.",
        "   Import tools using: `from generated.servers.<server_name> import <function_name>`",
        "   NEVER use `import *` - always use explicit named imports.",
        "",
        "4. **call_tool** - Direct single-tool invocation",
        "   Use this for simple, single-tool operations.",
        "",
        "## Recommended Workflow",
        "1. **Discover**: Use search_tools to find relevant tools",
        "2. **Understand**: Use get_tool_details to check parameters",
        "3. **Execute**: Use call_tool for simple ops OR execute_code for complex workflows",
        "",
    ]
    return "\n".join(lines)


def _usage_to_dict(usage: object) -> dict[str, object]:
    if usage is None:
        return {}

    if isinstance(usage, dict):
        return usage

    data = None
    if hasattr(usage, "model_dump"):
        try:
            data = usage.model_dump()
        except Exception:
            data = None
    if data is None and hasattr(usage, "dict"):
        try:
            data = usage.dict()
        except Exception:
            data = None
    if data is None and hasattr(usage, "__dict__"):
        data = usage.__dict__

    if isinstance(data, dict):
        return data

    extracted: dict[str, object] = {}
    for key in (
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "requests",
        "cached_tokens",
        "billable_tokens",
    ):
        if hasattr(usage, key):
            try:
                extracted[key] = getattr(usage, key)
            except Exception:
                pass

    return extracted


def _format_usage(usage: object, keys: Optional[list[str]] = None) -> str:
    data = _usage_to_dict(usage)
    if not data:
        return "N/A"

    parts = []
    preferred = [k for k in (keys or [
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "requests",
        "cached_tokens",
        "billable_tokens",
        "cache_write_tokens",
        "cache_read_tokens",
        "input_audio_tokens",
        "cache_audio_read_tokens",
        "output_audio_tokens",
        "tool_calls",
        "details",
    ]) if k != "details"]
    for key in preferred:
        if key in data:
            parts.append(f"{key}={data[key]}")
    if parts:
        return ", ".join(parts)
    return str(data)

    return str(usage)


def _usage_to_table(
    prompt_usage: object,
    session_usage: object,
    keys: Optional[list[str]] = None,
) -> "Table":
    prompt_data = _usage_to_dict(prompt_usage)
    session_data = _usage_to_dict(session_usage)
    table = Table(title="Token usage")
    table.add_column("Metric", style="cyan", no_wrap=True)
    table.add_column("Prompt", style="cyan")
    table.add_column("Session", style="cyan")

    preferred = keys or [
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "requests",
        "cached_tokens",
        "billable_tokens",
    ]

    if not prompt_data and not session_data:
        table.add_row("usage", "N/A", "N/A")
        return table

    def _format_value(value: object) -> str:
        if value is None:
            return "-"
        if isinstance(value, float):
            if value.is_integer():
                return str(int(value))
            return str(value)
        if isinstance(value, (int, bool)):
            return str(value)
        return str(value)

    for key in preferred:
        if key in prompt_data or key in session_data:
            table.add_row(
                key,
                _format_value(prompt_data.get(key, "-")),
                _format_value(session_data.get(key, "-")),
            )


    if table.row_count == 0:
        table.add_row("usage", str(prompt_data or "-"), str(session_data or "-"))

    return table


async def _dump_context_to_file(
    filename: str,
    agent: Any,
    message_history: list[Any] | None,
    codemode: bool = False,
) -> None:
    """Dump the context in provider-specific format showing what the LLM sees."""
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
    while hasattr(model, 'wrapped'):
        model = model.wrapped
    
    lines.append(f"\nModel: {model.model_name}")
    lines.append(f"Provider: {model.system}")
    
    def serialize_provider_msg(msg: Any) -> Any:
        """Recursively serialize provider message to JSON-safe format."""
        if isinstance(msg, dict):
            return {k: serialize_provider_msg(v) for k, v in msg.items()}
        elif isinstance(msg, list):
            return [serialize_provider_msg(item) for item in msg]
        elif isinstance(msg, bytes):
            return msg.decode("utf-8", errors="replace")
        elif hasattr(msg, 'model_dump'):
            return msg.model_dump()
        elif hasattr(msg, '__dict__'):
            return serialize_provider_msg(vars(msg))
        else:
            return msg
    
    from pydantic_ai.models import ModelRequestParameters
    model_request_parameters = ModelRequestParameters()
    model_settings = getattr(agent, 'model_settings', None) or {}
    
    # Try to get tool definitions from the agent's toolsets
    tool_definitions = []
    try:
        from pydantic_ai.tools import ToolDefinition
        
        # Get tools from agent.toolsets property (includes _function_toolset and _user_toolsets)
        for toolset in agent.toolsets:
            # Check for CodemodeToolset (from agent_codemode) - uses TOOL_SCHEMAS
            if toolset.__class__.__name__ == 'CodemodeToolset':
                try:
                    from agent_codemode.tool_definitions import TOOL_SCHEMAS
                    for name, schema in TOOL_SCHEMAS.items():
                        # Check if this tool is enabled in the toolset
                        if name in ["list_tool_names", "search_tools", "get_tool_details", "list_servers"]:
                            if not getattr(toolset, 'allow_discovery_tools', True):
                                continue
                        if name == "call_tool":
                            if not getattr(toolset, 'allow_direct_tool_calls', False):
                                continue
                        tool_definitions.append(ToolDefinition(
                            name=name,
                            description=schema.get("description", ""),
                            parameters_json_schema=schema.get("parameters", {'type': 'object', 'properties': {}}),
                        ))
                except ImportError:
                    pass
            # FunctionToolset has .tools dict with Tool objects
            elif hasattr(toolset, 'tools') and isinstance(toolset.tools, dict):
                for name, tool in toolset.tools.items():
                    desc = getattr(tool, 'description', None) or ''
                    # Get the json schema from function_schema if available
                    schema = {'type': 'object', 'properties': {}}
                    if hasattr(tool, 'function_schema') and tool.function_schema:
                        schema = getattr(tool.function_schema, 'json_schema', schema)
                    tool_definitions.append(ToolDefinition(
                        name=name,
                        description=desc,
                        parameters_json_schema=schema,
                    ))
    except Exception as e:
        lines.append(f"\n(Error extracting tool definitions: {e})")
    
    provider_format_found = False
    
    # Try Bedrock format (_map_messages - plural)
    if hasattr(model, '_map_messages'):
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
            if hasattr(model, '_map_tool_config') and tool_definitions:
                try:
                    params_with_tools = ModelRequestParameters(
                        function_tools=tool_definitions,
                        allow_text_output=True,
                    )
                    tool_config = model._map_tool_config(params_with_tools, model_settings)
                    
                    lines.append("\n" + "-" * 40)
                    lines.append("TOOL CONFIGURATION (Bedrock Format)")
                    lines.append("-" * 40)
                    if tool_config:
                        serialized_tools = serialize_provider_msg(tool_config)
                        lines.append(json.dumps(serialized_tools, indent=2, default=str))
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
    if not provider_format_found and hasattr(model, '_map_message'):
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
        lines.append("\n(No provider-specific format available, using pydantic-ai format)")
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
        from agent_codemode import CodemodeToolset, ToolRegistry, MCPServerConfig, CodeModeConfig

        registry = ToolRegistry()
        # Server name becomes the tool prefix (e.g., example_mcp__read_text_file)
        # and matches the generated bindings path: generated.servers.example_mcp
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
        help="Model to use (default: anthropic:claude-sonnet-4-0)"
    )
    parser.add_argument(
        "--codemode",
        action="store_true",
        help="Enable Agent Codemode mode"
    )
    args = parser.parse_args()
    
    model = args.model
    codemode = args.codemode

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

    # print("\nCommands:")
    # print("  /exit      - Exit the CLI")
    # print("  /markdown  - Toggle markdown rendering")
    # print("  /multiline - Enter multiline mode")
    # print("  /cp        - Copy last response to clipboard")
    # print("\n" + "=" * 72 + "\n")

    agent, codemode_toolset = create_agent(model=model, codemode=codemode)

    async def _run_cli() -> None:
        prompt = "𝄃𝄂𝄂𝄀𝄁𝄃𝄂𝄂𝄃 agent-codemode-agent ➤ " if codemode else "mcp-agent ➤ "
        multiline = False
        message_history = []  # Store conversation history
        session_usage: dict[str, float] = {
            "input_tokens": 0.0,
            "output_tokens": 0.0,
            "total_tokens": 0.0,
            "requests": 0.0,
            "cached_tokens": 0.0,
            "billable_tokens": 0.0,
            "codemode_tool_calls": 0.0,
            "mcp_tool_calls": 0.0,
        }
        previous_counts: dict[str, int] = {
            "codemode_tool_calls": 0,
            "mcp_tool_calls": 0,
        }

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
                        tools = await _list_available_tools(codemode, codemode_toolset, mcp_server_path)
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
                captured_tool_defs: list[tuple[str, str | None, dict]] = []
                async with agent.iter(user_input, message_history=message_history) as run:
                    async for node in run:
                        iteration_count += 1
                        node_type = type(node).__name__
                        # Print all node types for debugging
                        logger.debug("  [iter %s] %s", iteration_count, node_type)
                        
                        if node_type == 'CallToolsNode':
                            mr = getattr(node, 'model_response', None)
                            if mr and hasattr(mr, 'parts'):
                                for p in mr.parts:
                                    if hasattr(p, 'tool_name'):
                                        args = getattr(p, 'args', {})
                                        if isinstance(args, dict) and 'code' in args:
                                            code_preview = args['code'][:100].replace('\n', '\\n')
                                            logger.debug(
                                                "    -> %s(code=%s...)",
                                                p.tool_name,
                                                code_preview,
                                            )
                                        else:
                                            logger.debug("    -> %s(%s)", p.tool_name, args)
                        elif node_type == 'HandleResponseNode':
                            # Tool results might be here
                            data = getattr(node, 'data', None)
                            if data:
                                logger.debug("    -> data: %s", str(data)[:200])
                    run_result = run.result
                    run_usage = run.usage()
                    # Update message history with the conversation
                    message_history = run.all_messages()
                    
                    # Capture tool definitions while MCP servers are still connected
                    # This must happen inside the context before _cached_tools is cleared
                    if HAS_CONTEXT_SNAPSHOT:
                        for toolset in agent.toolsets:
                            # MCP servers have _cached_tools as list
                            if hasattr(toolset, "_cached_tools") and toolset._cached_tools:
                                for tool in toolset._cached_tools:
                                    name = getattr(tool, "name", None)
                                    if name:
                                        captured_tool_defs.append((
                                            name,
                                            getattr(tool, "description", None),
                                            getattr(tool, "inputSchema", {}),
                                        ))

                if run_result is None:
                    print("No result returned.")
                    continue

                reply = getattr(run_result, "output", None)
                if reply is None:
                    reply = getattr(run_result, "data", None)
                if reply is None:
                    reply = str(run_result)

                usage_data = _usage_to_dict(run_usage)
                if usage_data:
                    for key in session_usage:
                        if key in usage_data and isinstance(usage_data[key], (int, float)):
                            session_usage[key] += float(usage_data[key])
                        elif key in usage_data:
                            try:
                                session_usage[key] += float(usage_data[key])
                            except Exception:
                                pass

                prompt_usage_payload = dict(usage_data)
                if codemode and codemode_toolset is not None:
                    counts = {}
                    if hasattr(codemode_toolset, "get_call_counts"):
                        counts = codemode_toolset.get_call_counts()  # type: ignore[assignment]
                    if counts:
                        prompt_usage_payload["codemode_tool_calls"] = (
                            counts.get("codemode_tool_calls", 0) - previous_counts["codemode_tool_calls"]
                        )
                        prompt_usage_payload["mcp_tool_calls"] = (
                            counts.get("mcp_tool_calls", 0) - previous_counts["mcp_tool_calls"]
                        )
                        previous_counts["codemode_tool_calls"] = counts.get("codemode_tool_calls", 0)
                        previous_counts["mcp_tool_calls"] = counts.get("mcp_tool_calls", 0)
                        session_usage["codemode_tool_calls"] += float(prompt_usage_payload["codemode_tool_calls"])
                        session_usage["mcp_tool_calls"] += float(prompt_usage_payload["mcp_tool_calls"])

                if not codemode:
                    if "tool_calls" in prompt_usage_payload and "mcp_tool_calls" not in prompt_usage_payload:
                        prompt_usage_payload["mcp_tool_calls"] = prompt_usage_payload["tool_calls"]
                    if "tool_calls" in prompt_usage_payload:
                        prompt_usage_payload.pop("tool_calls", None)
                    prompt_usage_payload.setdefault("mcp_tool_calls", 0)
                    prompt_usage_payload["codemode_tool_calls"] = "N/A"
                    if "tool_calls" in usage_data and isinstance(usage_data["tool_calls"], (int, float)):
                        session_usage["mcp_tool_calls"] += float(usage_data["tool_calls"])
                    elif "tool_calls" in usage_data:
                        try:
                            session_usage["mcp_tool_calls"] += float(usage_data["tool_calls"])
                        except Exception:
                            pass

                if "tool_calls" in prompt_usage_payload:
                    prompt_usage_payload.pop("tool_calls", None)

                prompt_usage_keys = [
                    "input_tokens",
                    "output_tokens",
                    "total_tokens",
                    "requests",
                    "cached_tokens",
                    "billable_tokens",
                    "cache_write_tokens",
                    "cache_read_tokens",
                    "input_audio_tokens",
                    "cache_audio_read_tokens",
                    "output_audio_tokens",
                    "mcp_tool_calls",
                    "codemode_tool_calls",
                ]

                print(reply)

                if HAS_RICH:
                    console = Console()
                    console.print()
                    session_usage_payload = dict(session_usage)
                    if not codemode:
                        session_usage_payload["codemode_tool_calls"] = "N/A"
                    console.print(
                        _usage_to_table(prompt_usage_payload, session_usage_payload, prompt_usage_keys)
                    )
                    # Display context snapshot
                    if HAS_CONTEXT_SNAPSHOT:
                        try:
                            from agent_runtimes.context.snapshot import TurnUsage, SessionUsage
                            
                            # Get model's reported tokens from prompt usage (THIS TURN)
                            turn_input = int(prompt_usage_payload.get("input_tokens", 0) or 0)
                            turn_output = int(prompt_usage_payload.get("output_tokens", 0) or 0)
                            turn_requests = int(prompt_usage_payload.get("requests", 1) or 1)
                            
                            # Get tool calls - use mcp_tool_calls for non-codemode
                            if codemode:
                                turn_tool_calls_val = prompt_usage_payload.get("codemode_tool_calls", 0)
                                session_tool_calls_val = session_usage.get("codemode_tool_calls", 0)
                            else:
                                turn_tool_calls_val = prompt_usage_payload.get("mcp_tool_calls", 0)
                                session_tool_calls_val = session_usage.get("mcp_tool_calls", 0)
                            turn_tool_calls = int(turn_tool_calls_val) if isinstance(turn_tool_calls_val, (int, float)) else 0
                            session_tool_calls = int(session_tool_calls_val) if isinstance(session_tool_calls_val, (int, float)) else 0
                            
                            # Build turn usage (will get tool names from snapshot)
                            turn_usage = TurnUsage(
                                input_tokens=turn_input,
                                output_tokens=turn_output,
                                requests=turn_requests,
                                tool_calls=turn_tool_calls,
                                tool_names=[],  # Will be populated from per_request_usage
                            )
                            
                            # Build session usage
                            session_usage_obj = SessionUsage(
                                input_tokens=int(session_usage.get("input_tokens", 0)),
                                output_tokens=int(session_usage.get("output_tokens", 0)),
                                requests=int(session_usage.get("requests", 0)),
                                tool_calls=session_tool_calls,
                            )
                            
                            # Get context window for the model
                            context_window = get_model_context_window(model)
                            
                            snapshot = extract_context_snapshot(
                                agent, "agent_cli",
                                context_window=context_window,
                                message_history=message_history,
                                model_input_tokens=turn_input,
                                model_output_tokens=turn_output,
                                turn_usage=turn_usage,
                                session_usage=session_usage_obj,
                                tool_definitions=captured_tool_defs if captured_tool_defs else None,
                            )
                            
                            # Get tool names from per_request_usage (last N requests for this turn)
                            # Each request can have multiple tools, so flatten the lists
                            per_req = snapshot.per_request_usage if hasattr(snapshot, 'per_request_usage') else []
                            tool_names = []
                            for r in per_req[-turn_requests:]:
                                tool_names.extend(r.tool_names)
                            if tool_names and snapshot.turn_usage:
                                snapshot.turn_usage.tool_names = tool_names
                            
                            console.print(snapshot.to_table())
                        except Exception as e:
                            logger.debug("Could not display context snapshot: %s", e)
                    console.print()
                else:
                    print(f"\nToken usage (prompt): {_format_usage(run_usage)}")
                    print(
                        f"Token usage (session): {_format_usage(session_usage, prompt_usage_keys)}\n"
                    )
                    # Display context snapshot (plain text fallback)
                    if HAS_CONTEXT_SNAPSHOT:
                        try:
                            model_input_tokens = prompt_usage_payload.get("input_tokens")
                            model_output_tokens = prompt_usage_payload.get("output_tokens")
                            snapshot = extract_context_snapshot(
                                agent, "agent_cli", 
                                message_history=message_history,
                                model_input_tokens=model_input_tokens,
                                model_output_tokens=model_output_tokens,
                                tool_definitions=captured_tool_defs if captured_tool_defs else None,
                            )
                            model_str = f" (model: {snapshot.model_input_tokens})" if snapshot.model_input_tokens else ""
                            print(f"Context: {snapshot.total_tokens}{model_str}/{snapshot.context_window} tokens ({snapshot.total_tokens/snapshot.context_window*100:.1f}%)")
                        except Exception as e:
                            logger.debug("Could not display context snapshot: %s", e)

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
