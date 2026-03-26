#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Specification Code Generator.

Generates Python and TypeScript code from YAML agent specifications.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

from versioning import (
    ensure_spec_version,
    split_spec_ref,
    version_suffix,
    versioned_ref,
)


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _fmt_py_literal(value: Any) -> str:
    """Format a value as a Python literal for code generation."""
    if value is None:
        return "None"
    return repr(value)


def _fmt_ts_literal(value: Any) -> str:
    """Format a value as a TypeScript/JSON literal for code generation."""
    if value is None:
        return "undefined"
    return json.dumps(value, ensure_ascii=False)


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
                ensure_spec_version(spec)
                specs.append(("", spec))

    # Then, load specs from subdirectories (one level deep)
    for subdir in sorted(specs_dir.iterdir()):
        if subdir.is_dir() and not subdir.name.startswith("."):
            for yaml_file in sorted(subdir.glob("*.yaml")):
                with open(yaml_file, "r") as f:
                    spec = yaml.safe_load(f)
                    if spec:  # Skip empty files
                        ensure_spec_version(spec)
                        specs.append((subdir.name, spec))

    return specs


def generate_python_code(specs: List[tuple[str, Dict[str, Any]]]) -> str:
    """Generate Python code from agent specifications."""
    # Header
    code = '''# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library.

Predefined agent specifications that can be instantiated as Agent Runtimes.
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
            version = spec["version"]
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
            const_name += version_suffix(version)
            agent_ids.append((full_agent_id, const_name, folder))

            # Get MCP servers
            mcp_server_refs = [
                split_spec_ref(sid)[0] for sid in spec.get("mcp_servers", [])
            ]
            mcp_servers_str = ", ".join(
                f'MCP_SERVER_CATALOG["{sid}"]' for sid in mcp_server_refs
            )

            skill_refs = [
                versioned_ref(*split_spec_ref(skill)) for skill in spec.get("skills", [])
            ]
            tool_refs = [
                versioned_ref(*split_spec_ref(tool)) for tool in spec.get("tools", [])
            ]
            frontend_tool_refs = [
                versioned_ref(*split_spec_ref(ft)) for ft in spec.get("frontend_tools", [])
            ]

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

            # Model field
            model_id = spec.get("model")
            model_str = f'"{model_id}"' if model_id else "None"

            # Sandbox variant field
            sandbox_variant = spec.get("sandbox_variant")
            sandbox_variant_str = f'"{sandbox_variant}"' if sandbox_variant else "None"

            # New flow-level fields
            goal_raw = spec.get("goal")
            goal_str = (
                f'"{goal_raw.replace(chr(10), " ").replace("  ", " ").strip()}"'
                if goal_raw
                else "None"
            )
            protocol_val = spec.get("protocol")
            protocol_str = f'"{protocol_val}"' if protocol_val else "None"
            ui_ext = spec.get("ui_extension")
            ui_ext_str = f'"{ui_ext}"' if ui_ext else "None"
            trigger_val = spec.get("trigger")
            model_cfg = spec.get("model_config")
            mcp_srv_tools = spec.get("mcp_server_tools")
            guardrails_val = spec.get("guardrails")
            evals_val = spec.get("evals")
            codemode_val = spec.get("codemode")
            output_val = spec.get("output")
            advanced_val = spec.get("advanced")
            auth_policy = spec.get("authorization_policy")
            auth_policy_str = f'"{auth_policy}"' if auth_policy is not None else "None"
            notifs = spec.get("notifications")
            memory_val = spec.get("memory")
            memory_str = f'"{memory_val}"' if memory_val else "None"

            code += f'''{const_name} = AgentSpec(
    id="{full_agent_id}",
    version="{version}",
    name="{spec["name"]}",
    description="{description}",
    tags={_fmt_list(spec.get("tags", []))},
    enabled={spec.get("enabled", True)},
    model={model_str},
    mcp_servers=[{mcp_servers_str}],
    skills={_fmt_list(skill_refs)},
    tools={_fmt_list(tool_refs)},
    frontend_tools={_fmt_list(frontend_tool_refs)},
    environment_name="{spec.get("environment_name", "ai-agents-env")}",
    icon={icon},
    emoji={emoji},
    color={color},
    suggestions={suggestions_str},
    welcome_message="{welcome}",
    welcome_notebook={f'"{welcome_notebook}"' if welcome_notebook else "None"},
    welcome_document={f'"{welcome_document}"' if welcome_document else "None"},
    sandbox_variant={sandbox_variant_str},
    system_prompt={system_prompt_str},
    system_prompt_codemode_addons={system_prompt_codemode_addons_str},
    goal={goal_str},
    protocol={protocol_str},
    ui_extension={ui_ext_str},
    trigger={_fmt_py_literal(trigger_val)},
    model_configuration={_fmt_py_literal(model_cfg)},
    mcp_server_tools={_fmt_py_literal(mcp_srv_tools)},
    guardrails={_fmt_py_literal(guardrails_val)},
    evals={_fmt_py_literal(evals_val)},
    codemode={_fmt_py_literal(codemode_val)},
    output={_fmt_py_literal(output_val)},
    advanced={_fmt_py_literal(advanced_val)},
    authorization_policy={auth_policy_str},
    notifications={_fmt_py_literal(notifs)},
    memory={memory_str},
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
    Get an agent specification by ID (accepts both bare and versioned refs).

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        The AgentSpec configuration, or None if not found.
    \"\"\"
    spec = AGENT_SPECS.get(agent_id)
    if spec is not None:
        return spec
    base, _, ver = agent_id.rpartition(':')
    if base and '.' in ver:
        return AGENT_SPECS.get(base)
    return None


def list_agent_specs(prefix: str | None = None) -> list[AgentSpec]:
    \"\"\"
    List all available agent specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.

    Returns:
        List of all AgentSpec configurations.
    \"\"\"
    specs = list(AGENT_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs
"""

    return code


def generate_typescript_code(
    specs: List[tuple[str, Dict[str, Any]]],
    mcp_specs_dir: str,
    skills_specs_dir: str,
    tools_specs_dir: str,
) -> str:
    """Generate TypeScript code from agent specifications."""
    # Load available MCP servers from specs
    import glob
    import os

    mcp_server_files = glob.glob(os.path.join(mcp_specs_dir, "*.yaml"))
    mcp_specs = []
    for fpath in mcp_server_files:
        with open(fpath, "r") as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            mcp_specs.append(spec)
    mcp_specs.sort(key=lambda s: s["id"])

    # Load available skills from specs
    skill_files = glob.glob(os.path.join(skills_specs_dir, "*.yaml"))
    skill_specs = []
    for fpath in skill_files:
        with open(fpath, "r") as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            skill_specs.append(spec)
    skill_specs.sort(key=lambda s: s["id"])

    # Load available tools from specs
    tool_files = glob.glob(os.path.join(tools_specs_dir, "*.yaml"))
    tool_specs = []
    for fpath in tool_files:
        with open(fpath, "r") as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            tool_specs.append(spec)
    tool_specs.sort(key=lambda s: s["id"])

    # Determine which MCP servers and skills are actually used in these specs
    used_mcp_servers = set()
    used_skills = set()
    used_tools = set()
    used_frontend_tools = set()
    for _, spec in specs:
        for server in spec.get("mcp_servers", []):
            used_mcp_servers.add(versioned_ref(*split_spec_ref(server)))
        for skill in spec.get("skills", []):
            used_skills.add(versioned_ref(*split_spec_ref(skill)))
        for tool in spec.get("tools", []):
            used_tools.add(versioned_ref(*split_spec_ref(tool)))
        for ft in spec.get("frontend_tools", []):
            used_frontend_tools.add(versioned_ref(*split_spec_ref(ft)))

    # Only import what's actually used
    mcp_imports = []
    mcp_map_entries = []
    for spec in mcp_specs:
        server_id = spec["id"]
        server_ref = versioned_ref(server_id, spec["version"])
        if server_ref in used_mcp_servers:
            const_name = server_id.upper().replace("-", "_") + "_MCP_SERVER" + version_suffix(spec["version"])
            mcp_imports.append(const_name)
            mcp_map_entries.append(f"  '{server_ref}': {const_name},")
            mcp_map_entries.append(f"  '{server_id}': {const_name},")

    # Generate skill import names and map entries
    skill_imports = []
    skill_map_entries = []
    for spec in skill_specs:
        sid = spec["id"]
        sref = versioned_ref(sid, spec["version"])
        if sref in used_skills:
            const_name = sid.upper().replace("-", "_") + "_SKILL_SPEC" + version_suffix(spec["version"])
            skill_imports.append(const_name)
            skill_map_entries.append(f"  '{sref}': {const_name},")
            skill_map_entries.append(f"  '{sid}': {const_name},")

    # Generate tool import names and map entries
    tool_imports = []
    tool_map_entries = []
    for spec in tool_specs:
        tid = spec["id"]
        tref = versioned_ref(tid, spec["version"])
        if tref in used_tools:
            const_name = tid.upper().replace("-", "_") + "_TOOL_SPEC" + version_suffix(spec["version"])
            tool_imports.append(const_name)
            tool_map_entries.append(f"  '{tref}': {const_name},")
            tool_map_entries.append(f"  '{tid}': {const_name},")

    # Generate frontend tool import names and map entries
    frontend_tool_imports = []
    frontend_tool_map_entries = []
    frontend_tools_specs_dir = Path(tools_specs_dir).parent / "frontend-tools"
    frontend_tool_specs = []
    if frontend_tools_specs_dir.exists():
        frontend_tool_files = sorted(frontend_tools_specs_dir.glob("*.yaml"))
        for fpath in frontend_tool_files:
            with open(fpath, "r") as f:
                ft_spec = yaml.safe_load(f)
                ensure_spec_version(ft_spec)
                frontend_tool_specs.append(ft_spec)
        for ft_spec in frontend_tool_specs:
            ftid = ft_spec["id"]
            ftref = versioned_ref(ftid, ft_spec["version"])
            if ftref in used_frontend_tools:
                const_name = ftid.upper().replace("-", "_") + "_FRONTEND_TOOL_SPEC" + version_suffix(ft_spec["version"])
                frontend_tool_imports.append(const_name)
                frontend_tool_map_entries.append(f"  '{ftref}': {const_name},")
                frontend_tool_map_entries.append(f"  '{ftid}': {const_name},")

    # Determine if we need any helper code
    has_mcp = len(mcp_imports) > 0
    has_skills = len(skill_imports) > 0
    has_tools = len(tool_imports) > 0
    has_frontend_tools = len(frontend_tool_imports) > 0

    # Root-level specs produce src/specs/agents/agents.ts, while nested specs
    # produce src/specs/agents/<folder>/agents.ts. Import paths differ.
    is_root_layout = all(folder == "" for folder, _ in specs)
    types_import_path = (
        "../../types" if is_root_layout else "../../../types"
    )
    mcp_import_path = "../mcpServers" if is_root_layout else "../../mcpServers"
    skills_import_path = "../skills" if is_root_layout else "../../skills"
    tools_import_path = "../tools" if is_root_layout else "../../tools"
    frontend_tools_import_path = "../frontendTools" if is_root_layout else "../../frontendTools"

    # Header
    code = """/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library.
 *
 * Predefined agent specifications that can be instantiated as Agent Runtimes.
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 * Generated from YAML specifications in specs/agents/
 */

import type { AgentSpec } from '"""
    code += types_import_path
    code += """';
"""

    # Only add MCP server imports if needed
    if has_mcp:
        code += "import {\n"
        code += "  " + ",\n  ".join(mcp_imports) + ",\n"
        code += "} from '"
        code += mcp_import_path
        code += "';\n"

    # Only add skill imports if needed
    if has_skills:
        code += "import {\n"
        code += "  " + ",\n  ".join(skill_imports) + ",\n"
        code += "} from '"
        code += skills_import_path
        code += "';\n"
        code += "import type { SkillSpec } from '"
        code += types_import_path
        code += "';\n"

    # Only add tool imports if needed
    if has_tools:
        code += "import {\n"
        code += "  " + ",\n  ".join(tool_imports) + ",\n"
        code += "} from '"
        code += tools_import_path
        code += "';\n"

    # Only add frontend tool imports if needed
    if has_frontend_tools:
        code += "import {\n"
        code += "  " + ",\n  ".join(frontend_tool_imports) + ",\n"
        code += "} from '"
        code += frontend_tools_import_path
        code += "';\n"

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
        version: skill.version ?? '0.0.1',
    tags: skill.tags,
    enabled: skill.enabled,
    requiredEnvVars: skill.requiredEnvVars,
  };
}
"""

    # Only add tool lookup if used
    if has_tools:
        code += """
/**
 * Map tool IDs to ToolSpec objects.
 */
const TOOL_MAP: Record<string, any> = {
"""
        code += "\n".join(tool_map_entries) + "\n"
        code += "};\n"

    # Only add frontend tool lookup if used
    if has_frontend_tools:
        code += """
/**
 * Map frontend tool IDs to FrontendToolSpec objects.
 */
const FRONTEND_TOOL_MAP: Record<string, any> = {
"""
        code += "\n".join(frontend_tool_map_entries) + "\n"
        code += "};\n"


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
            version = spec["version"]
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
            const_name += version_suffix(version)
            agent_ids.append((full_agent_id, const_name, folder))

            # Get MCP servers
            mcp_server_ids = [versioned_ref(*split_spec_ref(sid)) for sid in spec.get("mcp_servers", [])]
            if has_mcp and mcp_server_ids:
                mcp_servers_str = ", ".join(
                    f"MCP_SERVER_MAP['{sid}']" for sid in mcp_server_ids
                )
            else:
                mcp_servers_str = ""

            # Get skills - resolve to AgentSkillSpec via toAgentSkillSpec
            skill_ids_list = [versioned_ref(*split_spec_ref(sid)) for sid in spec.get("skills", [])]
            if has_skills and skill_ids_list:
                skills_str = ", ".join(
                    f"toAgentSkillSpec(SKILL_MAP['{sid}'])" for sid in skill_ids_list
                )
            else:
                skills_str = ""

            # Get tools - resolve to ToolSpec via TOOL_MAP
            tool_ids_list = [versioned_ref(*split_spec_ref(sid)) for sid in spec.get("tools", [])]
            if has_tools and tool_ids_list:
                tools_str = ", ".join(
                    f"TOOL_MAP['{tid}']" for tid in tool_ids_list
                )
            else:
                tools_str = ""

            # Get frontend tools - resolve to FrontendToolSpec via FRONTEND_TOOL_MAP
            frontend_tool_ids_list = [versioned_ref(*split_spec_ref(sid)) for sid in spec.get("frontend_tools", [])]
            if has_frontend_tools and frontend_tool_ids_list:
                frontend_tools_str = ", ".join(
                    f"FRONTEND_TOOL_MAP['{ftid}']" for ftid in frontend_tool_ids_list
                )
            else:
                frontend_tools_str = ""

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

            welcome_message = spec.get("welcome_message")
            welcome_notebook = spec.get("welcome_notebook")
            welcome_document = spec.get("welcome_document")

            # Clean description for TypeScript (multi-line template literal)
            description = (
                spec["description"].replace("\n", " ").replace("  ", " ").strip()
            )

            # Model field
            model_id = spec.get("model")
            model_ts = f"'{model_id}'" if model_id else "undefined"

            # Sandbox variant field
            sandbox_variant = spec.get("sandbox_variant")
            sandbox_variant_ts = (
                f"'{sandbox_variant}'" if sandbox_variant else "undefined"
            )

            # New flow-level fields
            goal_raw = spec.get("goal")
            goal_ts = (
                f"`{goal_raw.replace(chr(10), ' ').replace('  ', ' ').strip().replace('`', chr(92) + '`')}`"
                if goal_raw
                else "undefined"
            )
            protocol_val = spec.get("protocol")
            protocol_ts = f"'{protocol_val}'" if protocol_val else "undefined"
            ui_ext = spec.get("ui_extension")
            ui_ext_ts = f"'{ui_ext}'" if ui_ext else "undefined"
            trigger_val = spec.get("trigger")
            model_cfg = spec.get("model_config")
            mcp_srv_tools = spec.get("mcp_server_tools")
            guardrails_val = spec.get("guardrails")
            evals_val = spec.get("evals")
            codemode_val = spec.get("codemode")
            output_val = spec.get("output")
            advanced_val = spec.get("advanced")
            auth_policy = spec.get("authorization_policy")
            auth_policy_ts = (
                f"'{auth_policy}'" if auth_policy is not None else "undefined"
            )
            notifs = spec.get("notifications")
            memory_val = spec.get("memory")
            memory_ts = f"'{memory_val}'" if memory_val else "undefined"

            code += f"""export const {const_name}: AgentSpec = {{
  id: '{full_agent_id}',
    version: '{version}',
  name: '{spec["name"]}',
  description: `{description}`,
  tags: {tags_str},
  enabled: {str(spec.get("enabled", True)).lower()},
  model: {model_ts},
  mcpServers: [{mcp_servers_str}],
  skills: [{skills_str}],
    tools: [{tools_str}],
    frontendTools: [{frontend_tools_str}],
  environmentName: '{spec.get("environment_name", "ai-agents-env")}',
  icon: {icon},
  emoji: {emoji},
  color: {color},
  suggestions: {suggestions_str},
    welcomeMessage: {_fmt_ts_literal(welcome_message)},
    welcomeNotebook: {_fmt_ts_literal(welcome_notebook)},
    welcomeDocument: {_fmt_ts_literal(welcome_document)},
  sandboxVariant: {sandbox_variant_ts},
  systemPrompt: {f"`{system_prompt}`" if system_prompt else "undefined"},
  systemPromptCodemodeAddons: {f"`{system_prompt_codemode_addons}`" if system_prompt_codemode_addons else "undefined"},
  goal: {goal_ts},
  protocol: {protocol_ts},
  uiExtension: {ui_ext_ts},
  trigger: {_fmt_ts_literal(trigger_val)},
  modelConfig: {_fmt_ts_literal(model_cfg)},
  mcpServerTools: {_fmt_ts_literal(mcp_srv_tools)},
  guardrails: {_fmt_ts_literal(guardrails_val)},
  evals: {_fmt_ts_literal(evals_val)},
  codemode: {_fmt_ts_literal(codemode_val)},
  output: {_fmt_ts_literal(output_val)},
  advanced: {_fmt_ts_literal(advanced_val)},
  authorizationPolicy: {auth_policy_ts},
  notifications: {_fmt_ts_literal(notifs)},
  memory: {memory_ts},
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

function resolveAgentId(agentId: string): string {
  if (agentId in AGENT_SPECS) return agentId;
  const idx = agentId.lastIndexOf(':');
  if (idx > 0) {
    const base = agentId.slice(0, idx);
    if (base in AGENT_SPECS) return base;
  }
  return agentId;
}

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[resolveAgentId(agentId)];
}

/**
 * List all available agent specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listAgentSpecs(prefix?: string): AgentSpec[] {
  const specs = Object.values(AGENT_SPECS);
  return prefix !== undefined ? specs.filter(s => s.id.startsWith(prefix)) : specs;
}

/**
 * Collect all required environment variables for an agent spec.
 *
 * Iterates over the spec's MCP servers and skills and returns the
 * deduplicated union of their `requiredEnvVars` arrays.
 */
export function getAgentSpecRequiredEnvVars(spec: AgentSpec): string[] {
  const vars = new Set<string>();
    const baseEnvVar = (v: string): string => v.split(':')[0] ?? v;
  for (const server of spec.mcpServers) {
    for (const v of server.requiredEnvVars ?? []) {
            vars.add(baseEnvVar(v));
    }
  }
  for (const skill of spec.skills) {
    for (const v of skill.requiredEnvVars ?? []) {
            vars.add(baseEnvVar(v));
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
    tools_specs_dir = args.specs_dir.parent / "tools"

    # Determine base directories
    python_base = args.python_output.parent / "agents"
    typescript_base = args.typescript_output.parent / "agents"
    python_base.mkdir(parents=True, exist_ok=True)
    typescript_base.mkdir(parents=True, exist_ok=True)

    print(f"Generating subfolder structure in {python_base} and {typescript_base}...")

    # Generate files for each folder
    all_python_imports = []
    all_typescript_imports = []

    for folder, folder_specs in sorted(specs_by_folder.items()):
        is_root = not folder
        if is_root:
            print("  Generating agents for root level")
        else:
            print(f"  Generating agents for subfolder: {folder}")

        # Convert folder name to valid Python module name (replace hyphens with underscores)
        folder_python_name = folder.replace("-", "_") if folder else "agents"

        # Create Python output file
        if is_root:
            python_file = python_base / "agents.py"
        else:
            python_folder_dir = python_base / folder_python_name
            python_folder_dir.mkdir(parents=True, exist_ok=True)
            python_file = python_folder_dir / "agents.py"

        # Generate Python code for this folder
        python_code = generate_python_code([(folder, spec) for spec in folder_specs])
        with open(python_file, "w") as f:
            f.write(python_code)

        # Create __init__.py for Python subfolder
        if not is_root:
            python_init = python_folder_dir / "__init__.py"
            with open(python_init, "w") as f:
                f.write("""# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from .agents import *

__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
""")

        # Collect imports for main index
        if is_root:
            all_python_imports.append("from .agents import AGENT_SPECS as ROOT_AGENTS")
        else:
            all_python_imports.append(
                f"from .{folder_python_name} import AGENT_SPECS as {folder_python_name.upper()}_AGENTS"
            )

        # Create TypeScript output file
        if is_root:
            typescript_file = typescript_base / "agents.ts"
        else:
            typescript_folder_dir = typescript_base / folder
            typescript_folder_dir.mkdir(parents=True, exist_ok=True)
            typescript_file = typescript_folder_dir / "agents.ts"

        # Generate TypeScript code for this folder
        typescript_code = generate_typescript_code(
            [(folder, spec) for spec in folder_specs],
            str(mcp_specs_dir),
            str(skills_specs_dir),
            str(tools_specs_dir),
        )
        with open(typescript_file, "w") as f:
            f.write(typescript_code)

        # Create index.ts for TypeScript subfolder
        if not is_root:
            typescript_index = typescript_folder_dir / "index.ts"
            with open(typescript_index, "w") as f:
                f.write("""/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export * from './agents';
""")

        # Collect imports for main index
        if is_root:
            all_typescript_imports.append("export * from './agents';")
        else:
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
        else:
            python_index_content += "AGENT_SPECS.update(ROOT_AGENTS)\n"

    python_index_content += """

def get_agent_spec(agent_id: str) -> AgentSpec | None:
    \"\"\"Get an agent specification by ID.\"\"\"
    spec = AGENT_SPECS.get(agent_id)
    if spec is not None:
        return spec
    base, _, ver = agent_id.rpartition(':')
    if base and '.' in ver:
        return AGENT_SPECS.get(base)
    return None


def list_agent_specs(prefix: str | None = None) -> list[AgentSpec]:
    \"\"\"List all available agent specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    \"\"\"
    specs = list(AGENT_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs

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
        else:
            typescript_index_content += (
                "import { AGENT_SPECS as ROOT_AGENTS } from './agents';\n"
            )

    typescript_index_content += """
// Merge all agent specs from subfolders
export const AGENT_SPECS: Record<string, AgentSpec> = {
"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_const = folder.replace("-", "_").upper()
            typescript_index_content += f"  ...{folder_const}_AGENTS,\n"
        else:
            typescript_index_content += "  ...ROOT_AGENTS,\n"

    typescript_index_content += """};

function resolveAgentId(agentId: string): string {
  if (agentId in AGENT_SPECS) return agentId;
  const idx = agentId.lastIndexOf(':');
  if (idx > 0) {
    const base = agentId.slice(0, idx);
    if (base in AGENT_SPECS) return base;
  }
  return agentId;
}

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[resolveAgentId(agentId)];
}

/**
 * List all available agent specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listAgentSpecs(prefix?: string): AgentSpec[] {
  const specs = Object.values(AGENT_SPECS);
  return prefix !== undefined ? specs.filter(s => s.id.startsWith(prefix)) : specs;
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


def ensure_specs_barrel(specs_dir: Path) -> None:
    """Ensure top-level TypeScript specs barrel file exists.

    This keeps imports like ``from './specs'`` valid even when regenerating
    from an empty ``src/specs`` tree.
    """
    specs_dir.mkdir(parents=True, exist_ok=True)
    index_path = specs_dir / "index.ts"
    index_path.write_text(
        """/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specs exports.
 *
 * This file is AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

export * from './agents';
export * from './teams';
export * from './envvars';
export * from './evals';
export * from './guardrails';
export * from './mcpServers';
export * from './memory';
export * from './models';
export * from './notifications';
export * from './outputs';
export * from './skills';
export * from './tools';
export * from './triggers';
"""
    )


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
        ensure_specs_barrel(args.typescript_output.parent)
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
        tools_specs_dir = args.specs_dir.parent / "tools"
        typescript_code = generate_typescript_code(
            specs,
            str(mcp_specs_dir),
            str(skills_specs_dir),
            str(tools_specs_dir),
        )
        args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.typescript_output, "w") as f:
            f.write(typescript_code)

        ensure_specs_barrel(args.typescript_output.parent)

        # Update __init__.py with new agent spec constants
        init_file_path = args.python_output.parent / "__init__.py"
        if init_file_path.exists():
            print(f"Updating {init_file_path}...")
            update_init_file(specs, init_file_path)

    print("✅ Code generation complete!")


if __name__ == "__main__":
    main()
