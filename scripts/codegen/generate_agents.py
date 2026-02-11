#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Specification Code Generator.

Generates Python and TypeScript code from YAML agent specifications.
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def load_yaml_specs(specs_dir: Path) -> List[tuple[str, Dict[str, Any]]]:
    """
    Load all YAML agent specifications from directory and subdirectories.

    Returns list of tuples: (subfolder_name, spec_dict)
    where subfolder_name is the immediate parent folder name, or "" for root level.
    """
    specs = []

    # First, load specs from root level
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file, "r") as f:
            spec = yaml.safe_load(f)
            if spec:  # Skip empty files
                specs.append(("", spec))

    # Then, load specs from subdirectories (one level deep)
    for subdir in sorted(specs_dir.iterdir()):
        if subdir.is_dir() and not subdir.name.startswith("."):
            for yaml_file in sorted(subdir.glob("*.yaml")):
                with open(yaml_file, "r") as f:
                    spec = yaml.safe_load(f)
                    if spec:  # Skip empty files
                        specs.append((subdir.name, spec))

    return specs


def generate_python_code(specs: List[tuple[str, Dict[str, Any]]]) -> str:
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

    # Organize specs by subfolder
    from collections import defaultdict

    specs_by_folder: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for folder, spec in specs:
        specs_by_folder[folder].append(spec)

    # Generate agent spec constants organized by folder
    agent_ids = []

    # Sort folders: empty string (root) first, then alphabetically
    sorted_folders = sorted(
        specs_by_folder.keys(), key=lambda x: "" if x == "" else f"z{x}"
    )

    for folder in sorted_folders:
        folder_specs = specs_by_folder[folder]

        # Add folder header if not root
        if folder:
            code += f"\n# {folder.replace('-', ' ').title()} Agents\n"
            code += f"# {'=' * 76}\n\n"

        for spec in folder_specs:
            agent_id = spec["id"]
            # Prefix agent ID with folder name for uniqueness
            full_agent_id = f"{folder}/{agent_id}" if folder else agent_id
            # Create constant name: e.g., "data-acquisition" -> "DATA_ACQUISITION_AGENT_SPEC"
            # But if id already ends with "-agent", don't duplicate: "github-agent" -> "GITHUB_AGENT_SPEC"
            # NO folder prefix for Python constants
            base_name = agent_id.upper().replace("-", "_")

            if agent_id.endswith("-agent"):
                const_name = base_name + "_SPEC"
            else:
                const_name = base_name + "_AGENT_SPEC"
            agent_ids.append((full_agent_id, const_name, folder))

            # Get MCP servers
            mcp_server_ids = spec.get("mcp_servers", [])
            mcp_servers_str = ", ".join(
                f'MCP_SERVER_CATALOG["{sid}"]' for sid in mcp_server_ids
            )

            # Format optional fields
            icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
            emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"
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
            welcome = (
                spec.get("welcome_message", "").replace('"', '\\"').replace("\n", " ")
            )
            welcome_notebook = spec.get("welcome_notebook")
            welcome_document = spec.get("welcome_document")
            system_prompt = spec.get("system_prompt", "")
            system_prompt_codemode_addons = spec.get(
                "system_prompt_codemode_addons", ""
            )

            # Escape triple quotes in system prompts for Python triple-quoted strings
            if system_prompt:
                system_prompt = system_prompt.replace('"""', r"\"\"\"")
            if system_prompt_codemode_addons:
                system_prompt_codemode_addons = system_prompt_codemode_addons.replace(
                    '"""', r"\"\"\""
                )

            # Clean description for Python (single line)
            description = (
                spec["description"].replace("\n", " ").replace("  ", " ").strip()
            )

            # Use triple quotes for multiline system prompts
            system_prompt_str = f'"""{system_prompt}"""' if system_prompt else "None"
            system_prompt_codemode_addons_str = (
                f'"""{system_prompt_codemode_addons}"""'
                if system_prompt_codemode_addons
                else "None"
            )

            code += f'''{const_name} = AgentSpec(
    id="{full_agent_id}",
    name="{spec["name"]}",
    description="{description}",
    tags={_fmt_list(spec.get("tags", []))},
    enabled={spec.get("enabled", True)},
    mcp_servers=[{mcp_servers_str}],
    skills={_fmt_list(spec.get("skills", []))},
    environment_name="{spec.get("environment_name", "ai-agents-env")}",
    icon={icon},
    emoji={emoji},
    color={color},
    suggestions={suggestions_str},
    welcome_message="{welcome}",
    welcome_notebook={f'"{welcome_notebook}"' if welcome_notebook else "None"},
    welcome_document={f'"{welcome_document}"' if welcome_document else "None"},
    system_prompt={system_prompt_str},
    system_prompt_codemode_addons={system_prompt_codemode_addons_str},
)

'''

    # Generate registry organized by folder
    code += """
# ============================================================================
# Agent Specs Registry
# ============================================================================

AGENT_SPECS: Dict[str, AgentSpec] = {
"""

    # Sort by folder for organized registry
    for folder in sorted_folders:
        folder_agents = [(aid, cname) for aid, cname, f in agent_ids if f == folder]
        if folder_agents and folder:
            code += f"    # {folder.replace('-', ' ').title()}\n"
        for full_agent_id, const_name in folder_agents:
            code += f'    "{full_agent_id}": {const_name},\n'
        if folder_agents and folder:
            code += "\n"

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


def generate_typescript_code(
    specs: List[tuple[str, Dict[str, Any]]], mcp_specs_dir: str, skills_specs_dir: str
) -> str:
    """Generate TypeScript code from agent specifications."""
    # Load available MCP servers from specs
    import glob
    import os

    mcp_server_files = glob.glob(os.path.join(mcp_specs_dir, "*.yaml"))
    mcp_server_ids = [
        os.path.basename(f).replace(".yaml", "") for f in mcp_server_files
    ]
    mcp_server_ids.sort()

    # Load available skills from specs
    skill_files = glob.glob(os.path.join(skills_specs_dir, "*.yaml"))
    skill_ids = [os.path.basename(f).replace(".yaml", "") for f in skill_files]
    skill_ids.sort()

    # Determine which MCP servers and skills are actually used in these specs
    used_mcp_servers = set()
    used_skills = set()
    for _, spec in specs:
        for server in spec.get("mcp_servers", []):
            used_mcp_servers.add(server)
        for skill in spec.get("skills", []):
            used_skills.add(skill)

    # Only import what's actually used
    mcp_imports = []
    mcp_map_entries = []
    for server_id in mcp_server_ids:
        if server_id in used_mcp_servers:
            const_name = server_id.upper().replace("-", "_") + "_MCP_SERVER"
            mcp_imports.append(const_name)
            mcp_map_entries.append(f"  '{server_id}': {const_name},")

    # Generate skill import names and map entries
    skill_imports = []
    skill_map_entries = []
    for sid in skill_ids:
        if sid in used_skills:
            const_name = sid.upper().replace("-", "_") + "_SKILL_SPEC"
            skill_imports.append(const_name)
            skill_map_entries.append(f"  '{sid}': {const_name},")

    # Determine if we need any helper code
    has_mcp = len(mcp_imports) > 0
    has_skills = len(skill_imports) > 0

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

import type { AgentSpec } from '../../../types';
"""

    # Only add MCP server imports if needed
    if has_mcp:
        code += "import {\n"
        code += "  " + ",\n  ".join(mcp_imports) + ",\n"
        code += "} from '../../mcpServers';\n"

    # Only add skill imports if needed
    if has_skills:
        code += "import {\n"
        code += "  " + ",\n  ".join(skill_imports) + ",\n"
        code += "} from '../../skills';\n"
        code += "import type { SkillSpec } from '../../skills';\n"

    # Only add MCP server lookup if used
    if has_mcp:
        code += """
// ============================================================================
// MCP Server Lookup
// ============================================================================

const MCP_SERVER_MAP: Record<string, any> = {
"""
        code += "\n".join(mcp_map_entries) + "\n"
        code += "};\n"

    # Only add skill lookup if used
    if has_skills:
        code += """
/**
 * Map skill IDs to SkillSpec objects, converting to AgentSkillSpec shape.
 */
const SKILL_MAP: Record<string, any> = {
"""
        code += "\n".join(skill_map_entries) + "\n"
        code += "};\n"
        code += """
function toAgentSkillSpec(skill: SkillSpec) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: '1.0.0',
    tags: skill.tags,
    enabled: skill.enabled,
    requiredEnvVars: skill.requiredEnvVars,
  };
}
"""

    code += """
// ============================================================================
// Agent Specs
// ============================================================================

"""

    # Organize specs by subfolder for TypeScript
    from collections import defaultdict

    specs_by_folder: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for folder, spec in specs:
        specs_by_folder[folder].append(spec)

    # Sort folders: empty string (root) first, then alphabetically
    sorted_folders = sorted(
        specs_by_folder.keys(), key=lambda x: "" if x == "" else f"z{x}"
    )

    # Generate agent spec constants organized by folder
    agent_ids = []

    for folder in sorted_folders:
        folder_specs = specs_by_folder[folder]

        # Add folder header if not root
        if folder:
            code += f"// {folder.replace('-', ' ').title()} Agents\n"
            code += f"// {'=' * 76}\n\n"

        for spec in folder_specs:
            agent_id = spec["id"]
            # Prefix agent ID with folder name for uniqueness
            full_agent_id = f"{folder}/{agent_id}" if folder else agent_id
            # Create constant name: e.g., "data-acquisition" -> "DATA_ACQUISITION_AGENT_SPEC"
            # But if id already ends with "-agent", don't duplicate: "github-agent" -> "GITHUB_AGENT_SPEC"
            # NO folder prefix for TypeScript constants
            base_name = agent_id.upper().replace("-", "_")

            if agent_id.endswith("-agent"):
                const_name = base_name + "_SPEC"
            else:
                const_name = base_name + "_AGENT_SPEC"
            agent_ids.append((full_agent_id, const_name, folder))

            # Get MCP servers
            mcp_server_ids = spec.get("mcp_servers", [])
            if has_mcp and mcp_server_ids:
                mcp_servers_str = ", ".join(
                    f"MCP_SERVER_MAP['{sid}']" for sid in mcp_server_ids
                )
            else:
                mcp_servers_str = ""

            # Get skills - resolve to AgentSkillSpec via toAgentSkillSpec
            skill_ids_list = spec.get("skills", [])
            if has_skills and skill_ids_list:
                skills_str = ", ".join(
                    f"toAgentSkillSpec(SKILL_MAP['{sid}'])" for sid in skill_ids_list
                )
            else:
                skills_str = ""

            # Format tags and suggestions as arrays
            tags = spec.get("tags", [])
            tags_str = "[" + ", ".join(f"'{t}'" for t in tags) + "]"

            suggestions = spec.get("suggestions", [])
            # Escape single quotes in suggestions for TypeScript
            escaped_suggestions = [s.replace("'", "\\'") for s in suggestions]
            suggestions_str = (
                "[\n    "
                + ",\n    ".join(f"'{s}'" for s in escaped_suggestions)
                + ",\n  ]"
                if suggestions
                else "[]"
            )

            # Format optional fields
            icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
            emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"
            color = f"'{spec.get('color')}'" if spec.get("color") else "undefined"
            system_prompt = spec.get("system_prompt")
            system_prompt_codemode_addons = spec.get("system_prompt_codemode_addons")

            # Escape backticks for TypeScript template literals
            if system_prompt:
                system_prompt = system_prompt.replace("`", "\\`")
            if system_prompt_codemode_addons:
                system_prompt_codemode_addons = system_prompt_codemode_addons.replace(
                    "`", "\\`"
                )

            # Clean description for TypeScript (multi-line template literal)
            description = (
                spec["description"].replace("\n", " ").replace("  ", " ").strip()
            )

            code += f"""export const {const_name}: AgentSpec = {{
  id: '{full_agent_id}',
  name: '{spec["name"]}',
  description: `{description}`,
  tags: {tags_str},
  enabled: {str(spec.get("enabled", True)).lower()},
  mcpServers: [{mcp_servers_str}],
  skills: [{skills_str}],
  environmentName: '{spec.get("environment_name", "ai-agents-env")}',
  icon: {icon},
  emoji: {emoji},
  color: {color},
  suggestions: {suggestions_str},
  systemPrompt: {f"`{system_prompt}`" if system_prompt else "undefined"},
  systemPromptCodemodeAddons: {f"`{system_prompt_codemode_addons}`" if system_prompt_codemode_addons else "undefined"},
}};

"""

    # Generate registry organized by folder
    code += """// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
"""

    # Sort by folder for organized registry
    for folder in sorted_folders:
        folder_agents = [(aid, cname) for aid, cname, f in agent_ids if f == folder]
        if folder_agents and folder:
            code += f"  // {folder.replace('-', ' ').title()}\n"
        for full_agent_id, const_name in folder_agents:
            code += f"  '{full_agent_id}': {const_name},\n"
        if folder_agents and folder:
            code += "\n"

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

/**
 * Collect all required environment variables for an agent spec.
 *
 * Iterates over the spec's MCP servers and skills and returns the
 * deduplicated union of their `requiredEnvVars` arrays.
 */
export function getAgentSpecRequiredEnvVars(spec: AgentSpec): string[] {
  const vars = new Set<string>();
  for (const server of spec.mcpServers) {
    for (const v of server.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  for (const skill of spec.skills) {
    for (const v of skill.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  return Array.from(vars);
}
"""

    return code


def update_init_file(
    specs: List[tuple[str, Dict[str, Any]]], init_file_path: Path
) -> None:
    """Update __init__.py with the new agent spec constants."""
    # Collect all constant names
    const_names = []
    for folder, spec in specs:
        agent_id = spec["id"]
        if folder:
            base_name = (
                f"{folder}_{agent_id}".upper().replace("-", "_").replace("/", "_")
            )
        else:
            base_name = agent_id.upper().replace("-", "_")

        if agent_id.endswith("-agent"):
            const_name = base_name + "_SPEC"
        else:
            const_name = base_name + "_AGENT_SPEC"
        const_names.append(const_name)

    # Sort for consistent ordering
    const_names.sort()

    # Read the current __init__.py
    with open(init_file_path, "r") as f:
        content = f.read()

    # Find the agents import block and replace it
    import re

    # Pattern to match the entire from .agents import block
    pattern = r"(from \.agents import \(\n)(.*?)(\n\))"

    # Build new imports
    new_imports = "    AGENT_SPECS,\n"
    for const_name in const_names:
        new_imports += f"    {const_name},\n"
    new_imports += "    get_agent_spec,\n"
    new_imports += "    list_agent_specs,"

    # Replace the imports
    new_content = re.sub(pattern, r"\1" + new_imports + r"\3", content, flags=re.DOTALL)

    # Write back
    with open(init_file_path, "w") as f:
        f.write(new_content)


def generate_subfolder_structure(specs: List[tuple[str, Dict[str, Any]]], args):
    """Generate separate agent files per subfolder."""
    from collections import defaultdict

    # Organize specs by folder
    specs_by_folder: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for folder, spec in specs:
        specs_by_folder[folder].append(spec)

    # Get MCP and skills specs directories
    mcp_specs_dir = args.specs_dir.parent / "mcp-servers"
    skills_specs_dir = args.specs_dir.parent / "skills"

    # Determine base directories
    python_base = args.python_output.parent / "agents"
    typescript_base = args.typescript_output.parent / "agents"

    print(f"Generating subfolder structure in {python_base} and {typescript_base}...")

    # Generate files for each folder
    all_python_imports = []
    all_typescript_imports = []

    for folder, folder_specs in sorted(specs_by_folder.items()):
        if not folder:  # Skip root level for now
            continue

        print(f"  Generating agents for subfolder: {folder}")

        # Convert folder name to valid Python module name (replace hyphens with underscores)
        folder_python_name = folder.replace("-", "_")

        # Create Python subfolder file
        python_folder_dir = python_base / folder_python_name
        python_folder_dir.mkdir(parents=True, exist_ok=True)
        python_file = python_folder_dir / "agents.py"

        # Generate Python code for this folder
        python_code = generate_python_code([(folder, spec) for spec in folder_specs])
        with open(python_file, "w") as f:
            f.write(python_code)

        # Create __init__.py for Python subfolder
        python_init = python_folder_dir / "__init__.py"
        with open(python_init, "w") as f:
            f.write(f"""# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from .agents import *

__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
""")

        # Collect imports for main index
        all_python_imports.append(
            f"from .{folder_python_name} import AGENT_SPECS as {folder_python_name.upper()}_AGENTS"
        )

        # Create TypeScript subfolder file
        typescript_folder_dir = typescript_base / folder
        typescript_folder_dir.mkdir(parents=True, exist_ok=True)
        typescript_file = typescript_folder_dir / "agents.ts"

        # Generate TypeScript code for this folder
        typescript_code = generate_typescript_code(
            [(folder, spec) for spec in folder_specs],
            str(mcp_specs_dir),
            str(skills_specs_dir),
        )
        with open(typescript_file, "w") as f:
            f.write(typescript_code)

        # Create index.ts for TypeScript subfolder
        typescript_index = typescript_folder_dir / "index.ts"
        with open(typescript_index, "w") as f:
            f.write(f"""/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export * from './agents';
""")

        # Collect imports for main index
        all_typescript_imports.append(f"export * from './{folder}';")

    # Create main Python index file
    python_index = python_base / "__init__.py"
    python_index_content = """# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

\"\"\"
Agent Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
\"\"\"

from typing import Dict
from agent_runtimes.types import AgentSpec

"""

    # Add imports
    for imp in all_python_imports:
        python_index_content += f"{imp}\n"

    # Merge all agent specs
    python_index_content += """
# Merge all agent specs from subfolders
AGENT_SPECS: Dict[str, AgentSpec] = {}
"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_python_name = folder.replace("-", "_")
            python_index_content += (
                f"AGENT_SPECS.update({folder_python_name.upper()}_AGENTS)\n"
            )

    python_index_content += """

def get_agent_spec(agent_id: str) -> AgentSpec | None:
    \"\"\"Get an agent specification by ID.\"\"\"
    return AGENT_SPECS.get(agent_id)


def list_agent_specs() -> list[AgentSpec]:
    \"\"\"List all available agent specifications.\"\"\"
    return list(AGENT_SPECS.values())

__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
"""

    with open(python_index, "w") as f:
        f.write(python_index_content)

    # Create main TypeScript index file
    typescript_index = typescript_base / "index.ts"
    typescript_index_content = """/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library - Subfolder Organization.
 *
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

import type { AgentSpec } from '../../types';

"""

    # Import AGENT_SPECS from each subfolder
    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_const = folder.replace("-", "_").upper()
            typescript_index_content += f"import {{ AGENT_SPECS as {folder_const}_AGENTS }} from './{folder}';\n"

    typescript_index_content += """
// Merge all agent specs from subfolders
export const AGENT_SPECS: Record<string, AgentSpec> = {
"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_const = folder.replace("-", "_").upper()
            typescript_index_content += f"  ...{folder_const}_AGENTS,\n"

    typescript_index_content += """};

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

/**
 * Collect all required environment variables for an agent spec.
 */
export function getAgentSpecRequiredEnvVars(spec: AgentSpec): string[] {
  const vars = new Set<string>();
  for (const server of spec.mcpServers) {
    for (const v of server.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  for (const skill of spec.skills) {
    for (const v of skill.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  return Array.from(vars);
}
"""

    with open(typescript_index, "w") as f:
        f.write(typescript_index_content)

    print(f"✓ Generated {len(specs_by_folder)} subfolder(s)")


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
        help="Output path for generated Python code (if using --subfolder-structure, this will be the parent directory)",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        default=Path("src/config/agents.ts"),
        help="Output path for generated TypeScript code (if using --subfolder-structure, this will be the parent directory)",
    )
    parser.add_argument(
        "--subfolder-structure",
        action="store_true",
        help="Generate separate files per subfolder instead of one combined file",
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

    if args.subfolder_structure:
        # Generate separate files per subfolder
        generate_subfolder_structure(specs, args)
    else:
        # Generate Python code (single file)
        print(f"Generating Python code to {args.python_output}...")
        python_code = generate_python_code(specs)
        args.python_output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.python_output, "w") as f:
            f.write(python_code)

        # Generate TypeScript code (single file)
        print(f"Generating TypeScript code to {args.typescript_output}...")
        # Get MCP and skills specs directories (siblings to agents directory)
        mcp_specs_dir = args.specs_dir.parent / "mcp-servers"
        skills_specs_dir = args.specs_dir.parent / "skills"
        typescript_code = generate_typescript_code(
            specs, str(mcp_specs_dir), str(skills_specs_dir)
        )
        args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.typescript_output, "w") as f:
            f.write(typescript_code)

        # Update __init__.py with new agent spec constants
        init_file_path = args.python_output.parent / "__init__.py"
        if init_file_path.exists():
            print(f"Updating {init_file_path}...")
            update_init_file(specs, init_file_path)

    print("✅ Code generation complete!")


if __name__ == "__main__":
    main()
