#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Specification Code Generator.

Generates Python and TypeScript code from YAML agent specifications.
"""

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml


def load_yaml_specs(specs_dir: Path) -> List[Dict[str, Any]]:
    """Load all YAML agent specifications from directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file, "r") as f:
            spec = yaml.safe_load(f)
            if spec:  # Skip empty files
                specs.append(spec)
    return specs


def generate_python_code(specs: List[Dict[str, Any]]) -> str:
    """Generate Python code from agent specifications."""
    # Header
    code = '''# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library.

Predefined agent specifications that can be instantiated as AgentSpaces.
THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
Generated from YAML specifications in specs/agents/
"""

from typing import Dict

from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.types import AgentSpec

# ============================================================================
# Agent Specs
# ============================================================================

'''

    # Generate agent spec constants
    agent_ids = []
    for spec in specs:
        agent_id = spec["id"]
        # Create constant name: e.g., "data-acquisition" -> "DATA_ACQUISITION_AGENT_SPEC"
        # But if id already ends with "-agent", don't duplicate: "github-agent" -> "GITHUB_AGENT_SPEC"
        if agent_id.endswith("-agent"):
            const_name = agent_id.upper().replace("-", "_") + "_SPEC"
        else:
            const_name = agent_id.upper().replace("-", "_") + "_AGENT_SPEC"
        agent_ids.append((agent_id, const_name))

        # Get MCP servers
        mcp_server_ids = spec.get("mcp_servers", [])
        mcp_servers_str = ", ".join(
            f"MCP_SERVER_CATALOG['{sid}']" for sid in mcp_server_ids
        )

        # Format optional fields
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        color = f'"{spec.get("color")}"' if spec.get("color") else "None"
        suggestions = spec.get("suggestions", [])
        suggestions_str = (
            "[\n        "
            + ",\n        ".join(f'"{s}"' for s in suggestions)
            + ",\n    ]"
            if suggestions
            else "[]"
        )
        # Escape multi-line strings properly
        welcome = spec.get("welcome_message", "").replace('"', '\\"').replace("\n", " ")
        welcome_notebook = spec.get("welcome_notebook")
        welcome_document = spec.get("welcome_document")
        system_prompt = spec.get("system_prompt", "")
        system_prompt_codemode = spec.get("system_prompt_codemode", "")

        # Escape triple quotes in system prompts for Python triple-quoted strings
        if system_prompt:
            system_prompt = system_prompt.replace('"""', r"\"\"\"")
        if system_prompt_codemode:
            system_prompt_codemode = system_prompt_codemode.replace('"""', r"\"\"\"")

        # Clean description for Python (single line)
        description = spec["description"].replace("\n", " ").replace("  ", " ").strip()

        # Use triple quotes for multiline system prompts
        system_prompt_str = f'"""{system_prompt}"""' if system_prompt else "None"
        system_prompt_codemode_str = (
            f'"""{system_prompt_codemode}"""' if system_prompt_codemode else "None"
        )

        code += f'''{const_name} = AgentSpec(
    id="{spec["id"]}",
    name="{spec["name"]}",
    description="{description}",
    tags={spec.get("tags", [])},
    enabled={spec.get("enabled", True)},
    mcp_servers=[{mcp_servers_str}],
    skills={spec.get("skills", [])},
    environment_name="{spec.get("environment_name", "ai-agents")}",
    icon={icon},
    color={color},
    suggestions={suggestions_str},
    welcome_message="{welcome}",
    welcome_notebook={f'"{welcome_notebook}"' if welcome_notebook else "None"},
    welcome_document={f'"{welcome_document}"' if welcome_document else "None"},
    system_prompt={system_prompt_str},
    system_prompt_codemode={system_prompt_codemode_str},
)

'''

    # Generate registry
    code += """
# ============================================================================
# Agent Specs Registry
# ============================================================================

AGENT_SPECS: Dict[str, AgentSpec] = {
"""
    for agent_id, const_name in agent_ids:
        code += f'    "{agent_id}": {const_name},\n'

    code += """}


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    \"\"\"
    Get an agent specification by ID.

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        The AgentSpec configuration, or None if not found.
    \"\"\"
    return AGENT_SPECS.get(agent_id)


def list_agent_specs() -> list[AgentSpec]:
    \"\"\"
    List all available agent specifications.

    Returns:
        List of all AgentSpec configurations.
    \"\"\"
    return list(AGENT_SPECS.values())
"""

    return code


def generate_typescript_code(specs: List[Dict[str, Any]], mcp_specs_dir: str) -> str:
    """Generate TypeScript code from agent specifications."""
    # Load available MCP servers from specs
    import glob
    import os

    mcp_server_files = glob.glob(os.path.join(mcp_specs_dir, "*.yaml"))
    mcp_server_ids = [
        os.path.basename(f).replace(".yaml", "") for f in mcp_server_files
    ]
    mcp_server_ids.sort()

    # Generate import names and map entries dynamically
    mcp_imports = []
    mcp_map_entries = []
    for server_id in mcp_server_ids:
        const_name = server_id.upper().replace("-", "_") + "_MCP_SERVER"
        mcp_imports.append(const_name)
        mcp_map_entries.append(f"  '{server_id}': {const_name},")

    # Header
    code = """/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library.
 *
 * Predefined agent specifications that can be instantiated as AgentSpaces.
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 * Generated from YAML specifications in specs/agents/
 */

import type { AgentSpec } from '../types';
import {
"""
    code += "  " + ",\n  ".join(mcp_imports) + ",\n"
    code += """} from './mcpServers';

// ============================================================================
// MCP Server Lookup
// ============================================================================

const MCP_SERVER_MAP: Record<string, any> = {
"""
    code += "\n".join(mcp_map_entries) + "\n"
    code += """};

// ============================================================================
// Agent Specs
// ============================================================================

"""

    # Generate agent spec constants
    agent_ids = []
    for spec in specs:
        agent_id = spec["id"]
        # Create constant name: e.g., "data-acquisition" -> "DATA_ACQUISITION_AGENT_SPEC"
        # But if id already ends with "-agent", don't duplicate: "github-agent" -> "GITHUB_AGENT_SPEC"
        if agent_id.endswith("-agent"):
            const_name = agent_id.upper().replace("-", "_") + "_SPEC"
        else:
            const_name = agent_id.upper().replace("-", "_") + "_AGENT_SPEC"
        agent_ids.append((agent_id, const_name))

        # Get MCP servers
        mcp_server_ids = spec.get("mcp_servers", [])
        mcp_servers_str = ", ".join(
            f"MCP_SERVER_MAP['{sid}']" for sid in mcp_server_ids
        )

        # Format tags and suggestions as arrays
        tags = spec.get("tags", [])
        tags_str = "[" + ", ".join(f"'{t}'" for t in tags) + "]"

        suggestions = spec.get("suggestions", [])
        # Escape single quotes in suggestions for TypeScript
        escaped_suggestions = [s.replace("'", "\\'") for s in suggestions]
        suggestions_str = (
            "[\n    " + ",\n    ".join(f"'{s}'" for s in escaped_suggestions) + ",\n  ]"
            if suggestions
            else "[]"
        )

        # Format optional fields
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        color = f"'{spec.get('color')}'" if spec.get("color") else "undefined"
        system_prompt = spec.get("system_prompt")
        system_prompt_codemode = spec.get("system_prompt_codemode")

        # Escape backticks for TypeScript template literals
        if system_prompt:
            system_prompt = system_prompt.replace("`", "\\`")
        if system_prompt_codemode:
            system_prompt_codemode = system_prompt_codemode.replace("`", "\\`")

        # Clean description for TypeScript (multi-line template literal)
        description = spec["description"].replace("\n", " ").replace("  ", " ").strip()

        code += f"""export const {const_name}: AgentSpec = {{
  id: '{spec["id"]}',
  name: '{spec["name"]}',
  description: `{description}`,
  tags: {tags_str},
  enabled: {str(spec.get("enabled", True)).lower()},
  mcpServers: [{mcp_servers_str}],
  skills: [],
  environmentName: '{spec.get("environment_name", "ai-agents-env")}',
  icon: {icon},
  color: {color},
  suggestions: {suggestions_str},
  systemPrompt: {f"`{system_prompt}`" if system_prompt else "undefined"},
  systemPromptCodemode: {f"`{system_prompt_codemode}`" if system_prompt_codemode else "undefined"},
}};

"""

    # Generate registry
    code += """// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
"""
    for agent_id, const_name in agent_ids:
        code += f"  '{agent_id}': {const_name},\n"

    code += """};

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[agentId];
}

/**
 * List all available agent specifications.
 */
export function listAgentSpecs(): AgentSpec[] {
  return Object.values(AGENT_SPECS);
}
"""

    return code


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML agent specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        default=Path("specs/agents"),
        help="Directory containing YAML agent specifications",
    )
    parser.add_argument(
        "--python-output",
        type=Path,
        default=Path("agent_runtimes/config/agents.py"),
        help="Output path for generated Python code",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        default=Path("src/config/agents.ts"),
        help="Output path for generated TypeScript code",
    )

    args = parser.parse_args()

    # Check specs directory exists
    if not args.specs_dir.exists():
        print(f"Error: Specs directory not found: {args.specs_dir}", file=sys.stderr)
        sys.exit(1)

    # Load YAML specifications
    print(f"Loading agent specifications from {args.specs_dir}...")
    specs = load_yaml_specs(args.specs_dir)
    print(f"Loaded {len(specs)} agent specification(s)")

    # Generate Python code
    print(f"Generating Python code to {args.python_output}...")
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.python_output, "w") as f:
        f.write(python_code)

    # Generate TypeScript code
    print(f"Generating TypeScript code to {args.typescript_output}...")
    # Get MCP specs directory (sibling to agents directory)
    mcp_specs_dir = args.specs_dir.parent / "mcp-servers"
    typescript_code = generate_typescript_code(specs, str(mcp_specs_dir))
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.typescript_output, "w") as f:
        f.write(typescript_code)

    print("✅ Code generation complete!")


if __name__ == "__main__":
    main()
