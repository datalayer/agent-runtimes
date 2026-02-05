#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Example: Integrating agent-codemode and agent-skills with agent-runtimes.

This example demonstrates how to use the integration module to:
1. Connect agent-runtimes with agent-codemode and agent-skills
2. Use Code Mode for efficient tool composition
3. Discover and execute skills through the integration layer

Key Concept: Unified Integration
The integration layer allows agents running on agent-runtimes to
seamlessly use both Code Mode (for tool composition) and Skills
(for reusable patterns).
"""

import asyncio
import shutil
from pathlib import Path


async def example_integration_setup():
    """
    Example 1: Setting up the Integration.
    """

    print("=" * 60)
    print("Example 1: Integration Setup")
    print("=" * 60)

    print("""
The CodemodeIntegration class connects agent-runtimes with:
- agent-codemode: For code-based tool composition
- agent-skills: For skill management and execution

Setup code:

    from agent_runtimes.integrations import CodemodeIntegration

    # Create the integration
    integration = CodemodeIntegration(
        skills_path="./skills",
        sandbox_variant="local-eval",  # or "datalayer" for cloud
    )

    # Set up (discovers tools and skills)
    await integration.setup()

    # Use as context manager for automatic cleanup
    async with CodemodeIntegration() as integration:
        # Use integration here
        pass
""")


async def example_code_execution():
    """
    Example 2: Executing Code via Integration.
    """
    from agent_runtimes.integrations import CodemodeIntegration

    print("\n" + "=" * 60)
    print("Example 2: Code Execution via Integration")
    print("=" * 60)

    # Create the integration
    integration = CodemodeIntegration(
        skills_path="./integration_skills",
        sandbox_variant="local-eval",
    )

    try:
        # Note: This will fail gracefully if agent-codemode is not installed
        await integration.setup()

        # Execute code
        result = await integration.execute_code("""
# This code runs in an isolated sandbox
import os
import json

# Example: Process environment
env_info = {
    "user": os.environ.get("USER", "unknown"),
    "path_count": len(os.environ.get("PATH", "").split(":")),
    "home": os.environ.get("HOME", "unknown"),
}

# Print result
print(json.dumps(env_info, indent=2))
""")

        print(f"\nExecution result:")
        print(f"  Success: {result['success']}")
        print(f"  Output:\n{result.get('output', 'No output')}")

        if result.get("error"):
            print(f"  Error: {result['error']}")

        await integration.cleanup()

    except ImportError:
        print("\nNote: agent-codemode not installed. Install with:")
        print("  pip install agent-codemode")


async def example_tool_search():
    """
    Example 3: Searching for Tools via Integration.
    """
    from agent_runtimes.integrations import CodemodeIntegration

    print("\n" + "=" * 60)
    print("Example 3: Tool Search via Integration")
    print("=" * 60)

    print("""
Search for tools using natural language:

    async with CodemodeIntegration() as integration:
        # Search for file-related tools
        tools = await integration.search_tools("file operations")

        for tool in tools:
            print(f"{tool['name']}: {tool['description']}")

        # Call a specific tool
        result = await integration.call_tool(
            "filesystem__read_file",
            {"path": "/tmp/data.txt"}
        )
""")


async def example_skill_integration():
    """
    Example 4: Using Skills via Integration.
    """
    from agent_runtimes.integrations import CodemodeIntegration

    print("\n" + "=" * 60)
    print("Example 4: Skills via Integration")
    print("=" * 60)

    print("""
Access skills through the integration layer:

    async with CodemodeIntegration(skills_path="./skills") as integration:
        # Search for skills
        skills = await integration.search_skills("data analysis")

        for skill in skills:
            print(f"{skill['name']}: {skill['description']}")

        # Run a skill
        result = await integration.run_skill(
            "analyze_csv",
            arguments={"file_path": "data.csv"}
        )

        print(f"Result: {result}")
""")


async def example_agent_workflow():
    """
    Example 5: Complete Agent Workflow.
    """

    print("\n" + "=" * 60)
    print("Example 5: Complete Agent Workflow")
    print("=" * 60)

    print("""
A complete agent workflow combining all features:

    from agent_runtimes.integrations import CodemodeIntegration

    async def agent_task(task_description: str):
        async with CodemodeIntegration() as integration:
            # 1. Search for relevant tools
            tools = await integration.search_tools(task_description)

            if not tools:
                # 2. Try finding a skill instead
                skills = await integration.search_skills(task_description)

                if skills:
                    # 3. Execute the best matching skill
                    result = await integration.run_skill(skills[0]['name'])
                    return result

            # 4. Generate and execute code to compose tools
            tool_names = [t['name'] for t in tools[:3]]

            code = f'''
# Auto-generated code to use tools: {tool_names}
# Import generated bindings
# from generated.servers.* import ...

# Execute the task
result = "Task completed using tools"
print(result)
'''

            result = await integration.execute_code(code)
            return result

    # Run the agent task
    result = await agent_task("process data files")
    print(result)
""")


async def example_mcp_server_integration():
    """
    Example 6: MCP Server Integration with agent-runtimes.
    """

    print("\n" + "=" * 60)
    print("Example 6: MCP Server Integration")
    print("=" * 60)

    print("""
The integration works with agent-runtimes' MCP infrastructure:

    from agent_runtimes import get_mcp_manager
    from agent_runtimes.integrations import CodemodeIntegration

    # Get the agent-runtimes MCP manager
    mcp_manager = get_mcp_manager()

    # Add MCP servers
    from agent_runtimes.types import MCPServer

    mcp_manager.add_server(MCPServer(
        id="filesystem",
        name="Filesystem Tools",
        url="http://localhost:8080/mcp",
    ))

    # Create integration with the MCP manager
    integration = CodemodeIntegration(mcp_manager=mcp_manager)

    # The integration will use servers from agent-runtimes
    await integration.setup()

    # Now tools from those servers are available
    tools = await integration.search_tools("list files")

    # And can be called via code execution
    result = await integration.execute_code('''
from generated.servers.filesystem import list_directory
files = await list_directory({"path": "/tmp"})
print(files)
''')
""")


async def main():
    """
    Run all examples.
    """
    print("\n" + "=" * 60)
    print("Integration Examples")
    print("=" * 60)
    print("Demonstrating agent-codemode and agent-skills integration")
    print("with agent-runtimes")

    # Run examples
    await example_integration_setup()
    await example_code_execution()
    await example_tool_search()
    await example_skill_integration()
    await example_agent_workflow()
    await example_mcp_server_integration()

    # Clean up
    shutil.rmtree("./integration_skills", ignore_errors=True)

    print("\n" + "=" * 60)
    print("Examples Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
