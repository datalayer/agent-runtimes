#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example: Using mcp-codemode for Code-First Tool Composition.

This example demonstrates how to use mcp-codemode to:
1. Discover tools from MCP servers
2. Generate Python bindings for tools
3. Execute code that composes multiple tools
4. Save reusable tool compositions as skills

Key Concept: Code Mode
Instead of calling tools one-by-one through LLM inference, Code Mode
allows agents to write Python code that orchestrates multiple tool calls.
This is more efficient and allows for complex logic, error handling,
and parallel execution.

Based on:
- Cloudflare Code Mode: https://blog.cloudflare.com/introducing-code-mode
- Anthropic Programmatic Tool Calling
"""

import asyncio
from pathlib import Path


async def example_tool_discovery():
    """Example 1: Progressive Tool Discovery.
    
    Instead of loading all tools upfront, use the Tool Search Tool
    to discover relevant tools based on the task at hand.
    """
    from mcp_codemode import ToolRegistry, MCPServerConfig
    
    print("=" * 60)
    print("Example 1: Progressive Tool Discovery")
    print("=" * 60)
    
    # Create a registry and add MCP servers
    registry = ToolRegistry()
    
    # Add an example server (filesystem operations)
    # In production, this would be a real MCP server
    registry.add_server(MCPServerConfig(
        name="filesystem",
        transport="stdio",
        command="npx",
        args=["-y", "@anthropic/mcp-server-filesystem", "/tmp"],
    ))
    
    # Discover all tools from configured servers
    print("\nDiscovering tools from MCP servers...")
    await registry.discover_all()
    
    # List all available tools
    all_tools = registry.list_tools()
    print(f"Discovered {len(all_tools)} tools")
    
    # Search for specific tools (progressive discovery)
    print("\nSearching for 'file' operations...")
    result = await registry.search_tools("file operations", limit=5)
    
    for tool in result.tools:
        print(f"  - {tool.name}: {tool.description}")
    
    return registry


async def example_code_execution():
    """Example 2: Code-Based Tool Composition.
    
    Execute Python code that calls multiple tools. The code runs
    in an isolated sandbox with generated Python bindings for all tools.
    """
    from mcp_codemode import ToolRegistry, CodeModeExecutor, CodeModeConfig
    
    print("\n" + "=" * 60)
    print("Example 2: Code-Based Tool Composition")
    print("=" * 60)
    
    # Set up the registry
    registry = ToolRegistry()
    
    # Configure the executor
    config = CodeModeConfig(
        sandbox_variant="local-eval",  # For development
        generated_path="./generated",
        skills_path="./skills",
    )
    
    # Use the executor as an async context manager
    async with CodeModeExecutor(registry, config) as executor:
        
        # Example: Execute code that would call tools
        # (This is a simplified example - real code would import generated bindings)
        code = '''
# This code runs in an isolated sandbox
import os

# In production, you would import generated tool bindings:
# from generated.servers.filesystem import read_file, write_file

# Create a sample data processing workflow
data = {"files_processed": 0, "total_size": 0}

# Simulated file processing
for filename in ["file1.txt", "file2.txt", "file3.txt"]:
    data["files_processed"] += 1
    data["total_size"] += 100  # Simulated file size

# Return the result
result = f"Processed {data['files_processed']} files, total size: {data['total_size']} bytes"
print(result)
'''
        
        print("\nExecuting code in sandbox...")
        execution = await executor.execute(code)
        
        if execution.error:
            print(f"Error: {execution.error}")
        else:
            print(f"Output:\n{execution.logs.stdout if execution.logs else 'No output'}")
        
        # Show tool call history
        print(f"\nTool calls made: {len(executor.tool_call_history)}")


async def example_skills():
    """Example 3: Creating and Running Skills.
    
    Skills are reusable code compositions that can be saved,
    discovered, and executed.
    """
    from mcp_codemode import ToolRegistry, CodeModeExecutor, CodeModeConfig
    from mcp_codemode.skills.manager import SkillsManager
    from mcp_codemode.models import Skill
    
    print("\n" + "=" * 60)
    print("Example 3: Creating and Running Skills")
    print("=" * 60)
    
    # Create a skills directory
    skills_path = Path("./example_skills")
    skills_path.mkdir(exist_ok=True)
    
    # Initialize the skill manager
    manager = SkillsManager(str(skills_path))
    
    # Create a sample skill
    skill = Skill(
        name="file_summary",
        description="Summarize files in a directory",
        code='''
# Skill: File Summary
# This skill counts files in a directory and reports their total size

import os

def summarize_directory(path="/tmp"):
    """Summarize files in a directory."""
    files = os.listdir(path)
    total_size = 0
    
    for f in files[:10]:  # Limit to first 10 files
        filepath = os.path.join(path, f)
        if os.path.isfile(filepath):
            total_size += os.path.getsize(filepath)
    
    return {
        "directory": path,
        "file_count": len(files),
        "sample_size_bytes": total_size,
    }

# Execute the skill
result = summarize_directory(path if 'path' in dir() else "/tmp")
print(f"Summary: {result}")
''',
        tags=["filesystem", "analysis"],
    )
    
    # Save the skill
    print("\nSaving skill 'file_summary'...")
    manager.save_skill(skill)
    
    # List available skills
    print("\nAvailable skills:")
    for s in manager.list_skills():
        print(f"  - {s.name}: {s.description}")
    
    # Set up executor to run the skill
    registry = ToolRegistry()
    config = CodeModeConfig(skills_path=str(skills_path))
    
    async with CodeModeExecutor(registry, config) as executor:
        print("\nRunning skill 'file_summary'...")
        
        execution = await executor.execute_skill(
            "file_summary",
            arguments={"path": "/tmp"},
        )
        
        if execution.error:
            print(f"Error: {execution.error}")
        else:
            print(f"Result: {execution.logs.stdout if execution.logs else 'No output'}")
    
    # Clean up
    import shutil
    shutil.rmtree(skills_path, ignore_errors=True)


async def example_mcp_server():
    """Example 4: Running the Codemode MCP Server.
    
    Shows how to configure and run the Codemode MCP server
    which exposes code execution capabilities to AI agents.
    """
    print("\n" + "=" * 60)
    print("Example 4: Codemode MCP Server")
    print("=" * 60)
    
    print("""
The Codemode MCP Server exposes these tools to AI agents:

1. search_tools(query) - Progressive tool discovery
   Find relevant tools based on natural language description.

2. execute_code(code) - Code-based tool composition
   Run Python code that can call multiple tools.

3. save_skill(name, code, description) - Create reusable skills
   Save code compositions for later use.

4. run_skill(name, arguments) - Execute saved skills
   Run a previously saved skill.

To start the server:

    from mcp_codemode import codemode_server, configure_server
    from mcp_codemode import MCPServerConfig
    
    # Configure with MCP servers
    configure_server()
    
    # Run the MCP server (uses FastMCP under the hood)
    codemode_server.run()

Or from the command line:

    python -m codemode.server
""")


async def main():
    """Run all examples."""
    print("\n" + "=" * 60)
    print("MCP Codemode Examples")
    print("=" * 60)
    
    # Run examples
    await example_tool_discovery()
    await example_code_execution()
    await example_skills()
    await example_mcp_server()
    
    print("\n" + "=" * 60)
    print("Examples Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
