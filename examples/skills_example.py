#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example: Using agent-skills for Reusable Agent Skills.

This example demonstrates how to use agent-skills to:
1. Create skills using SKILL.md format (Claude Code compatible)
2. Discover and search for skills
3. Execute skills in sandboxes
4. Version and manage skills

Key Concept: Skills
Skills are reusable, code-based tool compositions that agents can:
- Discover based on context
- Activate when needed
- Execute with parameters
- Share and version

Based on:
- Claude Code Skills (SKILL.md format)
- Anthropic SDK Skills API
"""

import asyncio
from pathlib import Path
import shutil


async def example_skill_creation():
    """Example 1: Creating Skills Programmatically."""
    from agent_skills import SkillManager, SkillContext
    
    print("=" * 60)
    print("Example 1: Creating Skills Programmatically")
    print("=" * 60)
    
    # Create a skills directory
    skills_path = Path("./example_skills")
    skills_path.mkdir(exist_ok=True)
    
    # Initialize the skill manager
    manager = SkillManager(str(skills_path))
    
    # Create a skill using the API
    skill = manager.create(
        name="data_analyzer",
        description="Analyze data from a file and generate summary statistics",
        content="""# Data Analyzer Skill

This skill reads data and generates summary statistics.

## Usage

Provide a `file_path` variable with the path to analyze.

## Output

Returns a dictionary with:
- row_count: Number of rows
- column_count: Number of columns
- summary: Basic statistics
""",
        python_code='''
import os

# Default file path (can be overridden by arguments)
file_path = file_path if "file_path" in dir() else "/tmp/data.txt"

# Check if file exists
if os.path.exists(file_path):
    with open(file_path, "r") as f:
        lines = f.readlines()
    
    result = {
        "file": file_path,
        "line_count": len(lines),
        "char_count": sum(len(line) for line in lines),
        "word_count": sum(len(line.split()) for line in lines),
    }
else:
    result = {"error": f"File not found: {file_path}"}

print(f"Analysis result: {result}")
''',
        allowed_tools=["filesystem__read_file", "filesystem__list_directory"],
        tags=["data", "analysis", "files"],
        context=SkillContext.FORK,
    )
    
    print(f"\nCreated skill: {skill.name}")
    print(f"  ID: {skill.skill_id}")
    print(f"  Tags: {skill.metadata.tags}")
    
    return manager, skills_path


async def example_skill_md_format():
    """Example 2: Using SKILL.md Format (Claude Code Compatible)."""
    from agent_skills import Skill, SkillMetadata, SkillContext
    
    print("\n" + "=" * 60)
    print("Example 2: SKILL.md Format")
    print("=" * 60)
    
    # Create a skill from SKILL.md content
    skill_md_content = """---
name: web_scraper
description: Scrape and extract data from web pages
version: 1.0.0
allowed-tools:
  - http__fetch
  - html__parse
model: claude-sonnet-4-20250514
context: sandbox
user-invocable: true
tags:
  - web
  - scraping
  - data-extraction
hooks:
  before-invoke: echo "Starting web scraper..."
  after-invoke: echo "Web scraping complete"
  on-error: echo "Scraping failed: $SKILL_ERROR"
author: Datalayer Team
---

# Web Scraper Skill

This skill fetches a web page and extracts structured data.

## Parameters

- `url`: The URL to scrape
- `selectors`: CSS selectors for data extraction

## Example

```python
url = "https://example.com"
selectors = {"title": "h1", "links": "a[href]"}

# Fetch the page
response = await http__fetch({"url": url})

# Parse and extract data
data = await html__parse({
    "content": response["body"],
    "selectors": selectors
})

print(data)
```
"""
    
    print("\nParsing SKILL.md content...")
    skill = Skill.from_skill_md(skill_md_content)
    
    print(f"Parsed skill: {skill.name}")
    print(f"  Description: {skill.description}")
    print(f"  Version: {skill.metadata.version}")
    print(f"  Allowed tools: {skill.metadata.allowed_tools}")
    print(f"  Context: {skill.metadata.context.value}")
    print(f"  User invocable: {skill.metadata.user_invocable}")
    print(f"  Tags: {skill.metadata.tags}")
    
    if skill.metadata.hooks:
        print(f"  Hooks:")
        print(f"    before-invoke: {skill.metadata.hooks.before_invoke}")
        print(f"    after-invoke: {skill.metadata.hooks.after_invoke}")
    
    # Convert back to SKILL.md format
    print("\nConverting back to SKILL.md format:")
    print("-" * 40)
    skill_md_output = skill.to_skill_md()
    print(skill_md_output[:500] + "...")


async def example_skill_discovery(manager, skills_path):
    """Example 3: Discovering and Searching Skills."""
    from agent_skills import Skill, SkillMetadata
    
    print("\n" + "=" * 60)
    print("Example 3: Skill Discovery and Search")
    print("=" * 60)
    
    # Create additional skills for discovery demo
    manager.create(
        name="csv_processor",
        description="Process CSV files and generate reports",
        content="Process CSV data...",
        python_code='print("Processing CSV...")',
        tags=["data", "csv", "processing"],
    )
    
    manager.create(
        name="json_validator",
        description="Validate JSON files against a schema",
        content="Validate JSON structure...",
        python_code='print("Validating JSON...")',
        tags=["data", "json", "validation"],
    )
    
    # Discover skills from the directory
    print("\nDiscovering skills from directory...")
    discovered = manager.discover()
    print(f"Discovered {len(discovered)} skills")
    
    # List all skills
    print("\nAll available skills:")
    for skill in manager.list():
        print(f"  - {skill.name}: {skill.description}")
    
    # Search for skills
    print("\nSearching for 'data processing' skills...")
    result = manager.search("data processing", limit=5)
    
    print(f"Found {result.total} matching skills:")
    for skill in result.skills:
        print(f"  - {skill.name}: {skill.description}")
    
    # Filter by tags
    print("\nFiltering by tag 'data'...")
    data_skills = manager.list(tags=["data"])
    print(f"Skills with 'data' tag: {len(data_skills)}")
    for skill in data_skills:
        print(f"  - {skill.name}")


async def example_skill_execution(manager, skills_path):
    """Example 4: Executing Skills."""
    
    print("\n" + "=" * 60)
    print("Example 4: Skill Execution")
    print("=" * 60)
    
    # Get a skill
    skill = manager.get("data_analyzer")
    
    if skill:
        print(f"\nExecuting skill: {skill.name}")
        
        # Create a test file
        test_file = Path("/tmp/test_data.txt")
        test_file.write_text("Line 1: Hello World\nLine 2: Test data\nLine 3: More content\n")
        
        # Execute the skill with arguments
        execution = await manager.execute(
            skill,
            arguments={"file_path": str(test_file)},
            timeout=10.0,
        )
        
        print(f"\nExecution result:")
        print(f"  Success: {execution.success}")
        print(f"  Time: {execution.execution_time:.3f}s")
        
        if execution.logs:
            print(f"  Output:\n    {execution.logs}")
        
        if execution.error:
            print(f"  Error: {execution.error}")
        
        # Clean up test file
        test_file.unlink(missing_ok=True)
    else:
        print("Skill not found!")


async def example_skill_versioning(manager, skills_path):
    """Example 5: Skill Versioning."""
    
    print("\n" + "=" * 60)
    print("Example 5: Skill Versioning")
    print("=" * 60)
    
    # Get a skill
    skill = manager.get("data_analyzer")
    
    if skill:
        # Create a version
        print(f"\nCreating version 1.0.0 of '{skill.name}'...")
        version = manager.create_version(skill.skill_id, "1.0.0")
        
        if version:
            print(f"  Version ID: {version.version_id}")
            print(f"  Version: {version.version}")
            print(f"  Is Current: {version.is_current}")
        
        # Modify the skill
        manager.update(
            skill.skill_id,
            description="Analyze data with enhanced statistics",
        )
        
        # Create another version
        print(f"\nCreating version 1.1.0...")
        version2 = manager.create_version(skill.skill_id, "1.1.0")
        
        # List versions
        print(f"\nVersions of '{skill.name}':")
        versions = manager.list_versions(skill.skill_id)
        for v in versions:
            current = " (current)" if v.is_current else ""
            print(f"  - {v.version}{current}")


async def example_mcp_server():
    """Example 6: Agent Skills MCP Server."""
    
    print("\n" + "=" * 60)
    print("Example 6: Agent Skills MCP Server")
    print("=" * 60)
    
    print("""
The Agent Skills MCP Server exposes these tools to AI agents:

1. search_skills(query) - Find relevant skills
   Search for skills based on description or tags.

2. list_skills() - List all available skills
   Get an overview of all skills.

3. get_skill(skill_id) - Get skill details
   Retrieve full skill definition.

4. run_skill(skill_id, arguments) - Execute a skill
   Run a skill with the provided arguments.

5. create_skill(...) - Create a new skill
   Define a reusable skill.

6. discover_skills(path) - Import SKILL.md files
   Scan a directory for skill definitions.

To start the server:

    from agent_skills import skills_server, configure_server
    
    # Configure the skill manager
    configure_server(skills_path="./skills")
    
    # Run the MCP server
    skills_server.run()

Or from the command line:

    python -m agent_skills.server
""")


async def main():
    """Run all examples."""
    print("\n" + "=" * 60)
    print("Agent Skills Examples")
    print("=" * 60)
    
    # Run examples
    manager, skills_path = await example_skill_creation()
    
    await example_skill_md_format()
    await example_skill_discovery(manager, skills_path)
    await example_skill_execution(manager, skills_path)
    await example_skill_versioning(manager, skills_path)
    await example_mcp_server()
    
    # Clean up
    shutil.rmtree(skills_path, ignore_errors=True)
    
    print("\n" + "=" * 60)
    print("Examples Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
