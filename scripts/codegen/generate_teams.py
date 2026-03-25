#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML team specifications.

Usage:
    python generate_teams.py \\
      --specs-dir agentspecs/agentspecs/teams \\
      --python-output agent_runtimes/specs/teams.py \\
      --typescript-output src/specs/teams.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

from versioning import ensure_spec_version, version_suffix, versioned_ref


def _make_const_name(team_id: str) -> str:
    """Convert a team ID to a constant name (e.g., 'analyze-campaign-performance' -> 'ANALYZE_CAMPAIGN_PERFORMANCE_TEAM_SPEC')."""
    return f"{team_id.upper().replace('-', '_')}_TEAM_SPEC"


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _fmt_py_literal(value: Any) -> str:
    """Format a Python literal value."""
    if value is None:
        return "None"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        # Escape backslashes and quotes
        escaped = (
            value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").strip()
        )
        return f'"{escaped}"'
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        items = [_fmt_py_literal(i) for i in value]
        return "[" + ", ".join(items) + "]"
    if isinstance(value, dict):
        items = [f'"{k}": {_fmt_py_literal(v)}' for k, v in value.items()]
        return "{" + ", ".join(items) + "}"
    return repr(value)


def _fmt_ts_literal(value: Any) -> str:
    """Format a TypeScript literal value."""
    if value is None:
        return "undefined"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return json.dumps(value, indent=2)
    if isinstance(value, dict):
        return json.dumps(value, indent=2)
    return json.dumps(value)


def load_yaml_specs(specs_dir: Path) -> List[tuple[str, Dict[str, Any]]]:
    """Load all team YAML specifications from a directory.

    Supports both flat (single directory) and subfolder structures.
    Returns a list of (subfolder_name, spec_dict) tuples.
    """
    specs = []

    # Load specs from root of the directory
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            if spec:
                ensure_spec_version(spec)
                specs.append(("", spec))

    # Load specs from subdirectories (one level deep)
    for subdir in sorted(specs_dir.iterdir()):
        if subdir.is_dir() and not subdir.name.startswith("."):
            for yaml_file in sorted(subdir.glob("*.yaml")):
                with open(yaml_file) as f:
                    spec = yaml.safe_load(f)
                    if spec:
                        ensure_spec_version(spec)
                        specs.append((subdir.name, spec))

    return specs


def _generate_team_agent_py(agent: Dict[str, Any]) -> str:
    """Generate Python code for a TeamAgentSpec."""
    lines = []
    lines.append("TeamAgentSpec(")
    lines.append(f'            id="{agent.get("id", "")}",')
    lines.append(f'            name="{agent.get("name", "")}",')
    lines.append(f'            role="{agent.get("role", "")}",')
    goal = agent.get("goal", "").replace('"', '\\"').replace("\n", " ").strip()
    lines.append(f'            goal="{goal}",')
    lines.append(f'            model="{agent.get("model", "")}",')
    lines.append(f'            mcp_server="{agent.get("mcp_server", "")}",')
    tools = agent.get("tools", [])
    lines.append(f"            tools={_fmt_list(tools)},")
    trigger = agent.get("trigger", "").replace('"', '\\"')
    lines.append(f'            trigger="{trigger}",')
    lines.append(f'            approval="{agent.get("approval", "auto")}",')
    lines.append("        )")
    return "\n".join(lines)


def _generate_team_agent_ts(agent: Dict[str, Any]) -> str:
    """Generate TypeScript code for a TeamAgentSpec."""
    goal = agent.get("goal", "").replace("`", "\\`").replace("\n", " ").strip()
    tools = json.dumps(agent.get("tools", []))
    trigger = agent.get("trigger", "").replace("'", "\\'")
    return f"""    {{
      id: '{agent.get("id", "")}',
      name: '{agent.get("name", "")}',
      role: '{agent.get("role", "")}',
      goal: `{goal}`,
      model: '{agent.get("model", "")}',
      mcpServer: '{agent.get("mcp_server", "")}',
      tools: {tools},
      trigger: '{trigger}',
      approval: '{agent.get("approval", "auto")}',
    }}"""


def generate_python_code(specs: List[tuple[str, Dict[str, Any]]]) -> str:
    """Generate Python code from team specifications."""
    code = '''# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Team Specifications.

THIS FILE IS AUTO-GENERATED from YAML team specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, Optional

from agent_runtimes.types import (
    TeamAgentSpec,
    TeamHealthMonitoring,
    TeamOutputSpec,
    TeamReactionRule,
    TeamSpec,
    TeamSupervisorSpec,
    TeamValidationSpec,
)


# ============================================================================
# Team Definitions
# ============================================================================

'''

    team_ids = []  # (full_id, const_name, folder)

    # Organize by folder
    folders = {}
    for folder, spec in specs:
        if folder not in folders:
            folders[folder] = []
        folders[folder].append(spec)

    sorted_folders = sorted(folders.keys())

    for folder in sorted_folders:
        folder_specs = folders[folder]
        if folder:
            code += f"# {'=' * 76}\n"
            code += f"# {folder.replace('-', ' ').title()}\n"
            code += f"# {'=' * 76}\n\n"

        for spec in folder_specs:
            team_id = spec["id"]
            version = spec["version"]
            if folder:
                full_team_id = f"{folder}/{team_id}"
                const_name = _make_const_name(f"{folder}_{team_id}") + version_suffix(version)
            else:
                full_team_id = team_id
                const_name = _make_const_name(team_id) + version_suffix(version)

            team_ids.append((full_team_id, const_name, folder))

            description = (
                spec.get("description", "")
                .replace("\n", " ")
                .replace("  ", " ")
                .replace('"', '\\"')
                .strip()
            )
            tags = _fmt_list(spec.get("tags", []))

            # Supervisor
            supervisor = spec.get("supervisor")
            if supervisor and isinstance(supervisor, dict):
                sup_name = supervisor.get("name", "").replace('"', '\\"')
                sup_model = supervisor.get("model", "")
                supervisor_code = (
                    f'TeamSupervisorSpec(name="{sup_name}", model="{sup_model}")'
                )
            else:
                supervisor_code = "None"

            # Validation
            validation = spec.get("validation")
            if validation and isinstance(validation, dict):
                timeout = validation.get("timeout")
                retry = validation.get("retry_on_failure", False)
                max_retries = validation.get("max_retries", 0)
                timeout_str = f'"{timeout}"' if timeout else "None"
                validation_code = f"TeamValidationSpec(timeout={timeout_str}, retry_on_failure={retry}, max_retries={max_retries})"
            else:
                validation_code = "None"

            # Team agents
            agents = spec.get("agents", [])
            if agents:
                agents_code = "[\n"
                for agent in agents:
                    agents_code += f"        {_generate_team_agent_py(agent)},\n"
                agents_code += "    ]"
            else:
                agents_code = "[]"

            routing = (
                spec.get("routing_instructions", "")
                .replace("\n", " ")
                .replace("  ", " ")
                .replace('"', '\\"')
                .strip()
            )

            # Reaction rules
            reaction_rules = spec.get("reaction_rules", [])
            if reaction_rules:
                rr_items = []
                for rr in reaction_rules:
                    rr_items.append(
                        f'TeamReactionRule(id="{rr.get("id", "")}", '
                        f'trigger="{rr.get("trigger", "")}", '
                        f'action="{rr.get("action", "")}", '
                        f"auto={rr.get('auto', True)}, "
                        f"max_retries={rr.get('max_retries', 0)}, "
                        f"escalate_after_retries={rr.get('escalate_after_retries', 0)}, "
                        f'priority="{rr.get("priority", "medium")}")'
                    )
                reaction_rules_code = (
                    "[\n        " + ",\n        ".join(rr_items) + ",\n    ]"
                )
            else:
                reaction_rules_code = "None"

            # Health monitoring
            health_monitoring = spec.get("health_monitoring")
            if health_monitoring and isinstance(health_monitoring, dict):
                hm = health_monitoring
                health_monitoring_code = (
                    f"TeamHealthMonitoring("
                    f'heartbeat_interval="{hm.get("heartbeat_interval", "30s")}", '
                    f'stale_threshold="{hm.get("stale_threshold", "120s")}", '
                    f'unresponsive_threshold="{hm.get("unresponsive_threshold", "300s")}", '
                    f'stuck_threshold="{hm.get("stuck_threshold", "600s")}", '
                    f"max_restart_attempts={hm.get('max_restart_attempts', 3)})"
                )
            else:
                health_monitoring_code = "None"

            # Notifications
            notifications = spec.get("notifications")
            if notifications and isinstance(notifications, dict):
                notifications_code = _fmt_py_literal(notifications)
            else:
                notifications_code = "None"

            # Output
            output = spec.get("output")
            if output and isinstance(output, dict):
                formats = _fmt_list(output.get("formats", []))
                template = output.get("template", "")
                storage = output.get("storage", "")
                output_code = (
                    f"TeamOutputSpec(formats={formats}, "
                    f'template="{template}", '
                    f'storage="{storage}")'
                )
            else:
                output_code = "None"

            code += f"{const_name} = TeamSpec(\n"
            code += f'    id="{full_team_id}",\n'
            code += f'    version="{version}",\n'
            code += f'    name="{spec["name"]}",\n'
            code += f'    description="{description}",\n'
            code += f"    tags={tags},\n"
            code += f"    enabled={spec.get('enabled', False)},\n"
            code += f'    icon="{spec.get("icon", "people")}",\n'
            code += f'    emoji="{spec.get("emoji", "👥")}",\n'
            code += f'    color="{spec.get("color", "#8250df")}",\n'
            code += f'    agent_spec_id="{spec.get("agent_spec_id", "")}",\n'
            code += f'    orchestration_protocol="{spec.get("orchestration_protocol", "datalayer")}",\n'
            code += (
                f'    execution_mode="{spec.get("execution_mode", "sequential")}",\n'
            )
            code += f"    supervisor={supervisor_code},\n"
            code += f'    routing_instructions="{routing}",\n'
            code += f"    validation={validation_code},\n"
            code += f"    agents={agents_code},\n"
            if reaction_rules_code != "None":
                code += f"    reaction_rules={reaction_rules_code},\n"
            if health_monitoring_code != "None":
                code += f"    health_monitoring={health_monitoring_code},\n"
            if notifications_code != "None":
                code += f"    notifications={notifications_code},\n"
            if output_code != "None":
                code += f"    output={output_code},\n"
            code += f")\n\n"

    # Generate registry
    code += """# ============================================================================
# Team Specs Registry
# ============================================================================

TEAM_SPECS: Dict[str, TeamSpec] = {
"""

    for folder in sorted_folders:
        folder_teams = [(tid, cname) for tid, cname, f in team_ids if f == folder]
        if folder_teams and folder:
            code += f"    # {folder.replace('-', ' ').title()}\n"
        for full_team_id, const_name in folder_teams:
            code += f'    "{full_team_id}": {const_name},\n'
        if folder_teams and folder:
            code += "\n"

    code += """}


def get_team_spec(team_id: str) -> TeamSpec | None:
    \"\"\"Get a team specification by ID.\"\"\"
    spec = TEAM_SPECS.get(team_id)
    if spec is not None:
        return spec
    base, _, ver = team_id.rpartition(':')
    if base and '.' in ver:
        return TEAM_SPECS.get(base)
    return None


def list_team_specs(prefix: str | None = None) -> list[TeamSpec]:
    \"\"\"List all available team specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    \"\"\"
    specs = list(TEAM_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs
"""

    return code


def generate_typescript_code(
    specs: List[tuple[str, Dict[str, Any]]], types_import_path: str = "../types"
) -> str:
    """Generate TypeScript code from team specifications."""
    code = f"""/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Team Specifications.
 *
 * THIS FILE IS AUTO-GENERATED from YAML team specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type {{ TeamSpec }} from '{types_import_path}';

// ============================================================================
// Team Definitions
// ============================================================================

"""

    team_ids = []  # (full_id, const_name, folder)

    # Organize by folder
    folders: Dict[str, list] = {}
    for folder, spec in specs:
        if folder not in folders:
            folders[folder] = []
        folders[folder].append(spec)

    sorted_folders = sorted(folders.keys())

    for folder in sorted_folders:
        folder_specs = folders[folder]
        if folder:
            code += f"// {'=' * 76}\n"
            code += f"// {folder.replace('-', ' ').title()}\n"
            code += f"// {'=' * 76}\n\n"

        for spec in folder_specs:
            team_id = spec["id"]
            version = spec["version"]
            if folder:
                full_team_id = f"{folder}/{team_id}"
                const_name = _make_const_name(f"{folder}_{team_id}") + version_suffix(version)
            else:
                full_team_id = team_id
                const_name = _make_const_name(team_id) + version_suffix(version)

            team_ids.append((full_team_id, const_name, folder))

            description = (
                spec.get("description", "")
                .replace("`", "\\`")
                .replace("\n", " ")
                .replace("  ", " ")
                .strip()
            )
            tags = json.dumps(spec.get("tags", []))

            # Supervisor
            supervisor = spec.get("supervisor")
            if supervisor and isinstance(supervisor, dict):
                sup_name = supervisor.get("name", "").replace("'", "\\'")
                sup_model = supervisor.get("model", "")
                supervisor_ts = f"{{ name: '{sup_name}', model: '{sup_model}' }}"
            else:
                supervisor_ts = "undefined"

            # Validation
            validation = spec.get("validation")
            if validation and isinstance(validation, dict):
                timeout = validation.get("timeout")
                retry = "true" if validation.get("retry_on_failure", False) else "false"
                max_retries = validation.get("max_retries", 0)
                timeout_ts = f"'{timeout}'" if timeout else "undefined"
                validation_ts = f"{{ timeout: {timeout_ts}, retryOnFailure: {retry}, maxRetries: {max_retries} }}"
            else:
                validation_ts = "undefined"

            # Team agents
            agents = spec.get("agents", [])
            if agents:
                agents_parts = [_generate_team_agent_ts(a) for a in agents]
                agents_ts = "[\n" + ",\n".join(agents_parts) + ",\n  ]"
            else:
                agents_ts = "[]"

            routing = (
                spec.get("routing_instructions", "")
                .replace("`", "\\`")
                .replace("\n", " ")
                .replace("  ", " ")
                .strip()
            )

            # Reaction rules
            reaction_rules = spec.get("reaction_rules", [])
            if reaction_rules:
                rr_ts = json.dumps(
                    [
                        {
                            "id": rr.get("id", ""),
                            "trigger": rr.get("trigger", ""),
                            "action": rr.get("action", ""),
                            "auto": rr.get("auto", True),
                            "maxRetries": rr.get("max_retries", 0),
                            "escalateAfterRetries": rr.get("escalate_after_retries", 0),
                            "priority": rr.get("priority", "medium"),
                        }
                        for rr in reaction_rules
                    ],
                    indent=2,
                )
            else:
                rr_ts = None

            # Health monitoring
            health_monitoring = spec.get("health_monitoring")
            if health_monitoring and isinstance(health_monitoring, dict):
                hm = health_monitoring
                hm_ts = json.dumps(
                    {
                        "heartbeatInterval": hm.get("heartbeat_interval", "30s"),
                        "staleThreshold": hm.get("stale_threshold", "120s"),
                        "unresponsiveThreshold": hm.get(
                            "unresponsive_threshold", "300s"
                        ),
                        "stuckThreshold": hm.get("stuck_threshold", "600s"),
                        "maxRestartAttempts": hm.get("max_restart_attempts", 3),
                    },
                    indent=2,
                )
            else:
                hm_ts = None

            # Notifications
            notifications = spec.get("notifications")
            if notifications and isinstance(notifications, dict):
                notif_ts = json.dumps(
                    {k.replace("_", ""): v for k, v in notifications.items()}
                    if False
                    else notifications,
                    indent=2,
                )
            else:
                notif_ts = None

            # Output
            output = spec.get("output")
            if output and isinstance(output, dict):
                output_ts = json.dumps(
                    {
                        "formats": output.get("formats", []),
                        "template": output.get("template", ""),
                        "storage": output.get("storage", ""),
                    },
                    indent=2,
                )
            else:
                output_ts = None

            code += f"export const {const_name}: TeamSpec = {{\n"
            code += f"  id: '{full_team_id}',\n"
            code += f"  version: '{version}',\n"
            code += f"  name: '{spec['name']}',\n"
            code += f"  description: `{description}`,\n"
            code += f"  tags: {tags},\n"
            code += f"  enabled: {str(spec.get('enabled', False)).lower()},\n"
            code += f"  icon: '{spec.get('icon', 'people')}',\n"
            code += f"  emoji: '{spec.get('emoji', '👥')}',\n"
            code += f"  color: '{spec.get('color', '#8250df')}',\n"
            code += f"  agentSpecId: '{spec.get('agent_spec_id', '')}',\n"
            code += f"  orchestrationProtocol: '{spec.get('orchestration_protocol', 'datalayer')}',\n"
            code += f"  executionMode: '{spec.get('execution_mode', 'sequential')}',\n"
            code += f"  supervisor: {supervisor_ts},\n"
            code += f"  routingInstructions: `{routing}`,\n"
            code += f"  validation: {validation_ts},\n"
            code += f"  agents: {agents_ts},\n"
            if rr_ts is not None:
                code += f"  reactionRules: {rr_ts},\n"
            if hm_ts is not None:
                code += f"  healthMonitoring: {hm_ts},\n"
            if notif_ts is not None:
                code += f"  notifications: {notif_ts},\n"
            if output_ts is not None:
                code += f"  output: {output_ts},\n"
            code += f"}};\n\n"

    # Registry
    code += """// ============================================================================
// Team Specs Registry
// ============================================================================

export const TEAM_SPECS: Record<string, TeamSpec> = {
"""

    for folder in sorted_folders:
        folder_teams = [(tid, cname) for tid, cname, f in team_ids if f == folder]
        if folder_teams and folder:
            code += f"  // {folder.replace('-', ' ').title()}\n"
        for full_team_id, const_name in folder_teams:
            code += f"  '{full_team_id}': {const_name},\n"
        if folder_teams and folder:
            code += "\n"

    code += """};

function resolveTeamId(teamId: string): string {
  if (teamId in TEAM_SPECS) return teamId;
  const idx = teamId.lastIndexOf(':');
  if (idx > 0) {
    const base = teamId.slice(0, idx);
    if (base in TEAM_SPECS) return base;
  }
  return teamId;
}

/**
 * Get a team specification by ID.
 */
export function getTeamSpec(teamId: string): TeamSpec | undefined {
  return TEAM_SPECS[resolveTeamId(teamId)];
}

/**
 * List all available team specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listTeamSpecs(prefix?: string): TeamSpec[] {
  const specs = Object.values(TEAM_SPECS);
  return prefix !== undefined ? specs.filter(s => s.id.startsWith(prefix)) : specs;
}
"""

    return code


def generate_subfolder_structure(specs: List[tuple[str, Dict[str, Any]]], args):
    """Generate separate team files per subfolder."""
    from collections import defaultdict

    # Organize specs by folder
    specs_by_folder: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for folder, spec in specs:
        specs_by_folder[folder].append(spec)

    # Determine base directories
    python_base = args.python_output.parent / "teams"
    typescript_base = args.typescript_output.parent / "teams"
    python_base.mkdir(parents=True, exist_ok=True)
    typescript_base.mkdir(parents=True, exist_ok=True)

    print(f"Generating subfolder structure in {python_base} and {typescript_base}...")

    all_python_imports = []
    all_typescript_imports = []

    for folder, folder_specs in sorted(specs_by_folder.items()):
        is_root = not folder
        if is_root:
            print("  Generating teams for root level")
        else:
            print(f"  Generating teams for subfolder: {folder}")

        folder_python_name = folder.replace("-", "_") if folder else "teams"

        # Create Python output file
        if is_root:
            python_file = python_base / "teams.py"
        else:
            python_folder_dir = python_base / folder_python_name
            python_folder_dir.mkdir(parents=True, exist_ok=True)
            python_file = python_folder_dir / "teams.py"

        python_code = generate_python_code([(folder, spec) for spec in folder_specs])
        with open(python_file, "w") as f:
            f.write(python_code)

        if not is_root:
            python_init = python_folder_dir / "__init__.py"
            with open(python_init, "w") as f:
                f.write("""# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from .teams import *

__all__ = ["TEAM_SPECS", "get_team_spec", "list_team_specs"]
""")

        if is_root:
            all_python_imports.append("from .teams import TEAM_SPECS as ROOT_TEAMS")
        else:
            all_python_imports.append(
                f"from .{folder_python_name} import TEAM_SPECS as {folder_python_name.upper()}_TEAMS"
            )

        # Create TypeScript output file
        if is_root:
            typescript_file = typescript_base / "teams.ts"
        else:
            typescript_folder_dir = typescript_base / folder
            typescript_folder_dir.mkdir(parents=True, exist_ok=True)
            typescript_file = typescript_folder_dir / "teams.ts"

        typescript_code = generate_typescript_code(
            [(folder, spec) for spec in folder_specs],
            types_import_path="../../types"
            if is_root
            else "../../../types",
        )
        with open(typescript_file, "w") as f:
            f.write(typescript_code)

        if not is_root:
            typescript_index = typescript_folder_dir / "index.ts"
            with open(typescript_index, "w") as f:
                f.write("""/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export * from './teams';
""")

        if is_root:
            all_typescript_imports.append("export * from './teams';")
        else:
            all_typescript_imports.append(f"export * from './{folder}';")

    # Create main Python index file
    python_index = python_base / "__init__.py"
    python_index_content = """# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

\"\"\"
Team Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
\"\"\"

from typing import Dict
from agent_runtimes.types import TeamSpec

"""

    for imp in all_python_imports:
        python_index_content += f"{imp}\n"

    python_index_content += """
# Merge all team specs from subfolders
TEAM_SPECS: Dict[str, TeamSpec] = {}
"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_python_name = folder.replace("-", "_")
            python_index_content += (
                f"TEAM_SPECS.update({folder_python_name.upper()}_TEAMS)\n"
            )
        else:
            python_index_content += "TEAM_SPECS.update(ROOT_TEAMS)\n"

    python_index_content += """

def get_team_spec(team_id: str) -> TeamSpec | None:
    \"\"\"Get a team specification by ID.\"\"\"
    spec = TEAM_SPECS.get(team_id)
    if spec is not None:
        return spec
    base, _, ver = team_id.rpartition(':')
    if base and '.' in ver:
        return TEAM_SPECS.get(base)
    return None


def list_team_specs(prefix: str | None = None) -> list[TeamSpec]:
    \"\"\"List all available team specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    \"\"\"
    specs = list(TEAM_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs

__all__ = ["TEAM_SPECS", "get_team_spec", "list_team_specs"]
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
 * Team Library - Subfolder Organization.
 *
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

import type { TeamSpec } from '../../types';

"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_const = folder.replace("-", "_").upper()
            typescript_index_content += (
                f"import {{ TEAM_SPECS as {folder_const}_TEAMS }} from './{folder}';\n"
            )
        else:
            typescript_index_content += (
                "import { TEAM_SPECS as ROOT_TEAMS } from './teams';\n"
            )

    typescript_index_content += """
// Merge all team specs from subfolders
export const TEAM_SPECS: Record<string, TeamSpec> = {
"""

    for folder in sorted(specs_by_folder.keys()):
        if folder:
            folder_const = folder.replace("-", "_").upper()
            typescript_index_content += f"  ...{folder_const}_TEAMS,\n"
        else:
            typescript_index_content += "  ...ROOT_TEAMS,\n"

    typescript_index_content += """};

function resolveTeamId(teamId: string): string {
  if (teamId in TEAM_SPECS) return teamId;
  const idx = teamId.lastIndexOf(':');
  if (idx > 0) {
    const base = teamId.slice(0, idx);
    if (base in TEAM_SPECS) return base;
  }
  return teamId;
}

/**
 * Get a team specification by ID.
 */
export function getTeamSpec(teamId: string): TeamSpec | undefined {
  return TEAM_SPECS[resolveTeamId(teamId)];
}

/**
 * List all available team specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listTeamSpecs(prefix?: string): TeamSpec[] {
  const specs = Object.values(TEAM_SPECS);
  return prefix !== undefined ? specs.filter(s => s.id.startsWith(prefix)) : specs;
}
"""

    with open(typescript_index, "w") as f:
        f.write(typescript_index_content)

    print(f"✓ Generated {len(specs_by_folder)} subfolder(s)")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML team specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        default=Path("specs/teams"),
        help="Directory containing YAML team specifications",
    )
    parser.add_argument(
        "--python-output",
        type=Path,
        default=Path("agent_runtimes/specs/teams.py"),
        help="Output path for generated Python code",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        default=Path("src/specs/teams.ts"),
        help="Output path for generated TypeScript code",
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
    print(f"Loading team specifications from {args.specs_dir}...")
    specs = load_yaml_specs(args.specs_dir)
    print(f"Loaded {len(specs)} team specification(s)")

    if args.subfolder_structure:
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
        typescript_code = generate_typescript_code(specs)
        args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.typescript_output, "w") as f:
            f.write(typescript_code)

    print("✅ Team code generation complete!")


if __name__ == "__main__":
    main()
