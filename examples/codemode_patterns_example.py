#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example: Code Mode Patterns from TypeScript POC.

This example demonstrates the key patterns from mcp-codemode-claude-poc:

1. Progressive Tool Discovery
   - list_tool_names: Fast listing when simple filtering works
   - search_tools: AI-powered tool discovery with full definitions
   - get_tool_definition: Get schema for a specific tool

2. Programmatic Tool Composition
   - Write Python code that imports generated tool bindings
   - Execute code in sandbox to call tools directly
   - Avoid LLM inference overhead for multi-step operations

3. Skills as Callable Code Files
   - Generate standalone Python skill files
   - Run skills directly: python skills/analyze_file.py data.csv
   - Import and compose skills in other code

4. Helper Utilities
   - wait_for: Wait for async conditions with polling
   - retry: Retry operations on failure with backoff
   - parallel: Run multiple async operations concurrently

Key Insight from Code Mode:
Instead of calling many tools one-by-one through LLM inference, agents
write code that orchestrates multiple tool calls. This is:
- More efficient (fewer LLM calls)
- More reliable (exact data handling, no LLM "fixing" mistakes)
- More powerful (loops, conditionals, error handling)

Based on:
- mcp-codemode-claude-poc TypeScript implementation
- Cloudflare Code Mode: https://blog.cloudflare.com/introducing-code-mode
- Anthropic Programmatic Tool Calling
"""

import asyncio
from pathlib import Path


# =============================================================================
# Example 1: Progressive Tool Discovery (Meta-Tool Pattern)
# =============================================================================

async def example_meta_tools():
    """Demonstrate the meta-tool proxy pattern.
    
    The agent uses 4 meta-tools:
    1. list_tool_names - Fast listing of tool names
    2. search_tools - AI-powered tool discovery
    3. get_tool_definition - Get full schema for a tool
    4. execute_code - Run Python code in sandbox
    
    All actual tool execution goes through execute_code, which runs
    Python code using the generated tool bindings.
    """
    from mcp_codemode import ToolRegistry
    from mcp_codemode.proxy.meta_tools import MetaToolProvider
    
    print("=" * 70)
    print("Example 1: Meta-Tool Proxy Pattern")
    print("=" * 70)
    
    # Create registry with mock tools for demonstration
    registry = ToolRegistry()
    
    # In production, you'd add real MCP servers:
    # registry.add_server(MCPServerConfig(name="filesystem", ...))
    # await registry.discover_all()
    
    # Create the meta-tool provider
    provider = MetaToolProvider(registry)
    
    # Get the meta-tool schemas (these are what the agent sees)
    meta_tools = provider.get_meta_tools()
    print("\nMeta-tools available to agent:")
    for tool in meta_tools:
        print(f"  - {tool['name']}: {tool['description'][:60]}...")
    
    # Example: Fast tool name listing
    print("\n1. list_tool_names (fast, no full schemas):")
    result = provider.list_tool_names(keywords=["file", "read"], limit=10)
    print(f"   Found {result['total']} tools, returned {result['returned']}")
    
    # Example: AI-powered search (if AI selector configured)
    print("\n2. search_tools (with full schemas):")
    result = await provider.search_tools("read CSV files and analyze data", limit=5)
    print(f"   Found {result['total']} tools")
    for tool in result.get("tools", []):
        print(f"   - {tool['name']}: {tool.get('description', '')[:50]}...")
    
    # Example: Get specific tool definition
    print("\n3. get_tool_definition:")
    # result = await provider.get_tool_definition("filesystem__read_file")
    # print(f"   {result}")


# =============================================================================
# Example 2: Code Execution (Tools as Code Pattern)
# =============================================================================

async def example_code_execution():
    """Demonstrate code-based tool composition.
    
    The agent writes Python code that:
    1. Imports from generated tool bindings
    2. Calls multiple tools with regular Python
    3. Uses loops, conditionals, error handling
    4. Returns results
    
    This avoids LLM inference for each tool call!
    """
    print("\n" + "=" * 70)
    print("Example 2: Code-Based Tool Composition")
    print("=" * 70)
    
    # Example code the agent would write and execute
    example_code = '''
# The agent writes code like this:
from generated.servers.filesystem import read_file, write_file, list_directory

async def process_files():
    """Process multiple files efficiently."""
    
    # List files in a directory
    entries = await list_directory({"path": "/tmp/data"})
    
    results = []
    for entry in entries.get("entries", []):
        if entry.endswith(".csv"):
            # Read each CSV file
            content = await read_file({"path": f"/tmp/data/{entry}"})
            
            # Process it (in code, not LLM!)
            lines = content.split("\\n")
            row_count = len(lines)
            
            # Save result
            results.append({
                "file": entry,
                "rows": row_count,
            })
    
    # Write summary
    import json
    await write_file({
        "path": "/tmp/summary.json",
        "content": json.dumps(results, indent=2)
    })
    
    return results

# Execute
await process_files()
'''
    
    print("\nExample code the agent would write:")
    print("-" * 60)
    print(example_code)
    print("-" * 60)
    
    print("\nBenefits of Code Mode:")
    print("  ✓ One LLM call generates code that does many tool calls")
    print("  ✓ No LLM inference between each tool call")
    print("  ✓ Exact data handling (no LLM 'fixing' mistakes)")
    print("  ✓ Complex logic with loops, conditionals, error handling")
    print("  ✓ Parallel execution with asyncio.gather")


# =============================================================================
# Example 3: Code Mode + Agent Skills (combined)
# =============================================================================

async def example_codemode_with_skills():
    """Show how to combine mcp-codemode with agent-skills.

    Pattern (mirrors the TypeScript POC):
    1. Skills live as code files in a skills/ directory
    2. Agent writes Python code that imports skills AND generated tool bindings
    3. Code runs through CodeModeExecutor (execute_code meta-tool)
    """
    from agent_skills import SkillDirectory, setup_skills_directory
    from mcp_codemode.composition.executor import CodeModeExecutor
    from mcp_codemode import ToolRegistry

    print("\n" + "=" * 70)
    print("Example 3: Code Mode + Agent Skills")
    print("=" * 70)

    # 1) Set up skills directory (primary pattern: skills are code files)
    skills_dir = setup_skills_directory("./example_skills")

    # 2) Create a simple skill that uses only Python (no external tools needed
    #    for this demo so it runs even without MCP servers).
    skill = skills_dir.create(
        name="greet_user",
        description="Return a greeting for the provided name.",
        code='''
async def greet_user(name: str) -> dict:
    return {"message": f"Hello, {name}!"}


if __name__ == "__main__":
    import asyncio, sys, json
    result = asyncio.run(greet_user(sys.argv[1]))
    print(json.dumps(result, indent=2))
''',
    )

    # 3) Show the code the agent would run via the execute_code meta-tool.
    #    This mirrors the TypeScript POC: the agent writes code, then the
    #    meta-tool executes it in a sandbox (CodeModeExecutor).
    execution_snippet = f'''
# Auto-generated tool bindings would be imported like:
# from generated.servers.filesystem import read_file

# Import a saved skill from the skills directory
from skills.{skill.name} import {skill.name}

result = await {skill.name}("Claude")
print(result)
'''

    print("\nCode the agent would send to execute_code:")
    print("-" * 60)
    print(execution_snippet)
    print("-" * 60)

    # 4) Optionally run the snippet using CodeModeExecutor. This will work
    #    without external MCP servers because the skill is pure Python.
    registry = ToolRegistry()
    try:
        async with CodeModeExecutor(registry) as executor:
            result = await executor.execute(execution_snippet)
            print("Execution output:")
            print(result.output or result.logs)
    except Exception as exc:  # Guard so the example doesn't crash in minimal envs
        print(f"(Skipped execution: {exc})")


# =============================================================================
# Example 4: Skills as Code Files (Primary Pattern)
# =============================================================================

async def example_skills_as_code():
    """Demonstrate the skills-as-code-files pattern.
    
    Skills are Python files in a skills/ directory that can be:
    1. Discovered by listing the directory
    2. Created by writing Python files
    3. Executed by importing and calling them
    4. Composed by importing multiple skills together
    
    This is the primary pattern for skill building.
    """
    from agent_skills import SkillDirectory, setup_skills_directory
    
    print("\n" + "=" * 70)
    print("Example 3: Skills as Code Files (Primary Pattern)")
    print("=" * 70)
    
    # Create skills directory
    skills_dir = Path("./example_skills")
    skills = SkillDirectory(str(skills_dir))
    
    # Create a skill by writing a Python file
    print("\n1. Creating a skill: analyze_csv")
    
    skill = skills.create(
        name="analyze_csv",
        description="Analyze a CSV file and return statistics.",
        code='''
async def analyze_csv(file_path: str) -> dict:
    """Analyze a CSV file.
    
    Args:
        file_path: Path to the CSV file.
    
    Returns:
        Statistics about the file.
    """
    # In real usage, import from generated tool bindings:
    # from generated.servers.filesystem import read_file
    
    # For demo, read file directly
    with open(file_path) as f:
        content = f.read()
    
    lines = content.split("\\n")
    headers = lines[0].split(",") if lines else []
    
    return {
        "file": file_path,
        "rows": len(lines) - 1,
        "columns": len(headers),
        "headers": headers,
    }


if __name__ == "__main__":
    import asyncio, sys, json
    result = asyncio.run(analyze_csv(sys.argv[1]))
    print(json.dumps(result, indent=2))
''',
    )
    
    print(f"   Created: {skill.path}")
    print(f"   Functions: {skill.functions}")
    print(f"   Run with: python {skill.path} data.csv")
    
    # Create another skill that composes the first
    print("\n2. Creating a composing skill: batch_analyze")
    
    skill = skills.create(
        name="batch_analyze",
        description="Analyze all CSV files in a directory.",
        code='''
async def batch_analyze(directory: str) -> list:
    """Analyze all CSV files in a directory.
    
    Args:
        directory: Directory containing CSV files.
    
    Returns:
        List of analysis results.
    """
    import os
    from example_skills.analyze_csv import analyze_csv
    
    results = []
    for entry in os.listdir(directory):
        if entry.endswith(".csv"):
            result = await analyze_csv(f"{directory}/{entry}")
            results.append(result)
    
    return results


if __name__ == "__main__":
    import asyncio, sys, json
    result = asyncio.run(batch_analyze(sys.argv[1]))
    print(json.dumps(result, indent=2))
''',
    )
    
    print(f"   Created: {skill.path}")
    print(f"   Composes: analyze_csv")
    
    # Discover skills
    print("\n3. Discovering skills:")
    for skill in skills.list():
        print(f"   - {skill.name}: {skill.description}")
        print(f"     Functions: {', '.join(skill.functions)}")
    
    # Search for skills
    print("\n4. Searching for 'CSV' skills:")
    matches = skills.search("CSV")
    for skill in matches:
        print(f"   - {skill.name}")
    
    # Execute a skill
    print("\n5. Executing a skill programmatically:")
    skill = skills.get("analyze_csv")
    if skill:
        func = skill.get_function()
        # Create a test file
        test_file = skills_dir / "test.csv"
        test_file.write_text("name,age,city\\nAlice,30,NYC\\nBob,25,LA\\n")
        
        result = await func(str(test_file))
        print(f"   Result: {result}")
        
        # Cleanup
        test_file.unlink()


# =============================================================================
# Example 5: Skills with Code Generation Templates
# =============================================================================

async def example_skill_templates():
    """Demonstrate generating skills from templates.
    
    Templates provide common patterns for skills like:
    - file_processor: Process files with a transform
    - api_fetcher: Fetch data from an API
    - wait_for_condition: Poll until condition is met
    """
    from agent_skills import generate_skill_file, generate_skill_from_template
    
    print("\n" + "=" * 70)
    print("Example 4: Skills with Code Generation Templates")
    print("=" * 70)
    
    skills_dir = Path("./example_skills")
    skills_dir.mkdir(exist_ok=True)
    
    # Generate from template
    print("\n1. Generating skill from template: wait_for_file")
    
    skill_path = generate_skill_from_template(
        name="wait_for_file",
        template="wait_for_condition",
        output_dir=skills_dir,
    )
    
    print(f"   Generated: {skill_path}")
    
    # Generate custom skill with codegen
    print("\n2. Generating custom skill with code generation:")
    
    skill_path = generate_skill_file(
        name="process_json",
        description="Process a JSON file and extract data",
        code='''
import json

# Read and parse the file
with open(file_path) as f:
    data = json.load(f)

# Process it
if isinstance(data, list):
    return {"count": len(data), "type": "array"}
elif isinstance(data, dict):
    return {"keys": list(data.keys()), "type": "object"}
else:
    return {"type": type(data).__name__}
''',
        parameters=[
            {"name": "file_path", "type": "str", "description": "Path to JSON file", "required": True},
        ],
        output_dir=skills_dir,
    )
    
    print(f"   Generated: {skill_path}")
    
    # Show template file content
    if skill_path.exists():
        print("\n3. Generated skill file preview:")
        print("-" * 60)
        content = skill_path.read_text()
        lines = content.split("\n")[:25]
        print("\n".join(lines))
        print("...")
        print("-" * 60)


# =============================================================================
# Example 6: Helper Utilities (Control Flow Patterns)
# =============================================================================

async def example_helpers():
    """Demonstrate helper utilities for code compositions.
    
    These utilities enable the "More Powerful Control" pattern
    where code can wait, retry, and run operations in parallel.
    """
    from mcp_codemode.skills import wait_for, retry, parallel, RateLimiter
    
    print("\n" + "=" * 70)
    print("Example 5: Helper Utilities")
    print("=" * 70)
    
    # Example: wait_for - Wait for a condition
    print("\n1. wait_for - Wait for async conditions:")
    print('''
    # Instead of burning tokens polling in LLM...
    counter = [0]
    
    async def check_ready():
        counter[0] += 1
        return counter[0] >= 3
    
    await wait_for(
        condition=check_ready,
        interval_seconds=1,
        timeout_seconds=10,
    )
    ''')
    
    # Demo wait_for
    counter = [0]
    async def check_ready():
        counter[0] += 1
        print(f"   Checking... attempt {counter[0]}")
        return counter[0] >= 3
    
    try:
        await wait_for(check_ready, interval_seconds=0.5, timeout_seconds=5)
        print("   ✓ Condition met!")
    except TimeoutError:
        print("   ✗ Timeout")
    
    # Example: retry - Retry on failure
    print("\n2. retry - Retry operations with backoff:")
    print('''
    result = await retry(
        fn=lambda: api_call(),
        max_attempts=5,
        delay_seconds=1,
        backoff_factor=2,  # 1s, 2s, 4s, 8s
    )
    ''')
    
    # Demo retry
    attempts = [0]
    async def flaky_operation():
        attempts[0] += 1
        print(f"   Attempt {attempts[0]}...")
        if attempts[0] < 3:
            raise Exception("Transient failure")
        return "Success!"
    
    result = await retry(flaky_operation, max_attempts=5, delay_seconds=0.1)
    print(f"   ✓ Result: {result}")
    
    # Example: parallel - Run concurrently
    print("\n3. parallel - Run operations concurrently:")
    print('''
    results = await parallel(
        lambda: fetch_file("a.txt"),
        lambda: fetch_file("b.txt"),
        lambda: fetch_file("c.txt"),
    )
    ''')
    
    # Demo parallel
    async def slow_op(name, delay):
        await asyncio.sleep(delay)
        return f"{name} done"
    
    import time
    start = time.time()
    results = await parallel(
        lambda: slow_op("A", 0.1),
        lambda: slow_op("B", 0.1),
        lambda: slow_op("C", 0.1),
    )
    elapsed = time.time() - start
    print(f"   Results: {results}")
    print(f"   ✓ Completed in {elapsed:.2f}s (parallel, not 0.3s sequential)")
    
    # Example: RateLimiter
    print("\n4. RateLimiter - Throttle API calls:")
    print('''
    limiter = RateLimiter(calls_per_second=5)
    for url in urls:
        await limiter.acquire()
        result = await fetch(url)
    ''')


# =============================================================================
# Example 7: System Prompt for Code Mode Agent
# =============================================================================

def example_system_prompt():
    """Show the recommended system prompt for Code Mode agents.
    
    Based on the TypeScript POC's system prompt.
    """
    print("\n" + "=" * 70)
    print("Example 5: System Prompt for Code Mode Agents")
    print("=" * 70)
    
    system_prompt = '''
You are an AI assistant with access to tools via MCP.

## Available Tools
You have direct access to these 4 tools:
1. **list_tool_names** - Fast listing of tool names (use get_tool_details to get schemas)
2. **search_tools** - Tool discovery (returns key fields for matching tools)
3. **get_tool_details** - Get full schema, output shape, and examples for a tool
4. **execute_code** - Execute Python code in a sandboxed environment

## Tool Execution Model
ALL actual tool execution (bash commands, file operations, etc.) must be done by writing Python code that runs in the sandbox.
You CANNOT directly call tools - you must write code that imports and uses the generated tool bindings.

## Workflow
1. **Discover tools** using search_tools, list_tool_names, or get_tool_details
2. **Write Python code** that imports tools from generated bindings
3. **Execute your code** using execute_code

Example:
```python
from generated.servers.filesystem import read_file, write_file
from generated.servers.bash import execute

# Read a file
content = await read_file({"path": "/tmp/data.txt"})

# Process it
result = content.upper()

# Write output
await write_file({"path": "/tmp/output.txt", "content": result})

print(f"Processed {len(content)} bytes")
```

## Building Skills
You can save Python files to the skills directory.
This allows you to create reusable scripts which we call 'skills'.
You can then call them later or import and compose them.

Skills can be invoked directly:
    python skills/analyze_csv.py data.csv

Or imported and composed:
    from skills.analyze_csv import analyze_csv
    result = await analyze_csv("data.csv")
'''
    
    print(system_prompt)


# =============================================================================
# Main
# =============================================================================

async def main():
    """Run all examples."""
    print("\n" + "=" * 70)
    print("MCP Code Mode Patterns - Skills as Code Files")
    print("=" * 70)
    
    await example_meta_tools()
    await example_code_execution()
    await example_skills_as_code()
    await example_skill_templates()
    await example_helpers()
    example_system_prompt()
    
    print("\n" + "=" * 70)
    print("All examples completed!")
    print("=" * 70)
    
    # Cleanup
    import shutil
    if Path("./example_skills").exists():
        shutil.rmtree("./example_skills")


if __name__ == "__main__":
    asyncio.run(main())
