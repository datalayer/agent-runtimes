#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML MCP server specifications.

Usage:
    python generate_mcp_servers.py \\
      --specs-dir specs/mcp-servers \\
      --python-output agent_runtimes/mcp/catalog_mcp_servers.py \\
      --typescript-output src/config/mcpServers.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


def load_mcp_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all MCP server YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from MCP server specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "MCP Server Catalog.",
        "",
        "Predefined MCP server configurations that can be used by agents.",
        "Credentials are configured via environment variables.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "import os",
        "import tempfile",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import MCPServer",
        "",
        "# " + "=" * 76,
        "# MCP Server Definitions",
        "# " + "=" * 76,
        "",
    ]

    # Generate server constants
    for spec in specs:
        server_id = spec["id"]
        const_name = f"{server_id.upper().replace('-', '_')}_MCP_SERVER"

        # Format args properly
        args_list = spec.get("args", [])
        if args_list:
            arg_items = []
            for arg in args_list:
                if arg == "$TMPDIR":
                    arg_items.append("        tempfile.gettempdir()")
                else:
                    arg_items.append(f'        "{arg}"')
            args_formatted = "[\n" + ",\n".join(arg_items) + ",\n    ]"
        else:
            args_formatted = "[]"

        # Format env dict
        env_dict = spec.get("env", {})
        if env_dict:
            env_formatted = (
                "{\n"
                + ",\n".join(
                    f'        "{key}": "{value}"' for key, value in env_dict.items()
                )
                + ",\n    }"
            )
        else:
            env_formatted = None

        # Format envvars
        envvars = spec.get("envvars", [])
        if envvars:
            envvars_formatted = "[" + ", ".join(f'"{v}"' for v in envvars) + "]"
        else:
            envvars_formatted = "[]"

        # Format optional fields
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"

        lines.extend(
            [
                f"{const_name} = MCPServer(",
                f'    id="{server_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec["description"]}",',
                f"    icon={icon},",
                f"    emoji={emoji},",
                f'    command="{spec["command"]}",',
                f"    args={args_formatted},",
                f'    transport="{spec.get("transport", "stdio")}",',
                f"    enabled={spec.get('enabled', True)},",
                "    tools=[],",
            ]
        )

        # Add env field if present
        if env_formatted:
            lines.append(f"    env={env_formatted},")

        lines.extend(
            [
                f"    required_env_vars={envvars_formatted},",
                ")",
                "",
            ]
        )

    # Generate catalog dictionary
    lines.extend(
        [
            "# " + "=" * 76,
            "# MCP Server Catalog",
            "# " + "=" * 76,
            "",
            "MCP_SERVER_CATALOG: Dict[str, MCPServer] = {",
        ]
    )

    for spec in specs:
        server_id = spec["id"]
        const_name = f"{server_id.upper().replace('-', '_')}_MCP_SERVER"
        lines.append(f'    "{server_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def check_env_vars_available(env_vars: list[str]) -> bool:",
            '    """',
            "    Check if all required environment variables are set.",
            "",
            "    Args:",
            "        env_vars: List of environment variable names to check.",
            "",
            "    Returns:",
            "        True if all env vars are set (non-empty), False otherwise.",
            '    """',
            "    if not env_vars:",
            "        return True  # No env vars required",
            "    return all(os.environ.get(var) for var in env_vars)",
            "",
            "",
            "def get_catalog_server(server_id: str) -> MCPServer | None:",
            '    """',
            "    Get a catalog MCP server by ID.",
            "",
            "    Args:",
            "        server_id: The unique identifier of the MCP server.",
            "",
            "    Returns:",
            "        The MCPServer configuration, or None if not found.",
            '    """',
            "    return MCP_SERVER_CATALOG.get(server_id)",
            "",
            "",
            "def list_catalog_servers() -> list[MCPServer]:",
            '    """',
            "    List all catalog MCP servers with availability status.",
            "",
            "    For each server, checks if the required environment variables are set",
            "    and updates the `is_available` field accordingly.",
            "",
            "    Returns:",
            "        List of all catalog MCPServer configurations with updated availability.",
            '    """',
            "    servers = []",
            "    for server in MCP_SERVER_CATALOG.values():",
            "        # Create a copy with updated availability",
            "        server_copy = server.model_copy()",
            "        server_copy.is_available = check_env_vars_available(server.required_env_vars)",
            "        servers.append(server_copy)",
            "    return servers",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from MCP server specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * MCP Server Catalog",
        " *",
        " * Predefined MCP server configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { MCPServer } from '../types/Types';",
        "",
        "// " + "=" * 76,
        "// MCP Server Definitions",
        "// " + "=" * 76,
        "",
    ]

    # Generate server constants
    for spec in specs:
        server_id = spec["id"]
        const_name = f"{server_id.upper().replace('-', '_')}_MCP_SERVER"

        # Format args
        args_list = spec.get("args", [])
        args_formatted = "[" + ", ".join(f"'{arg}'" for arg in args_list) + "]"

        # Format envvars
        envvars = spec.get("envvars", [])
        if envvars:
            envvars_formatted = "[" + ", ".join(f"'{v}'" for v in envvars) + "]"
        else:
            envvars_formatted = "[]"

        # Format optional fields
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"

        # Escape description for TypeScript
        description = spec.get("description", "").replace("'", "\\'")

        lines.extend(
            [
                f"export const {const_name}: MCPServer = {{",
                f"  id: '{server_id}',",
                f"  name: '{spec['name']}',",
                f"  description: '{description}',",
                f"  icon: {icon},",
                f"  emoji: {emoji},",
                "  url: '',",
                f"  command: '{spec['command']}',",
                f"  args: {args_formatted},",
                f"  transport: '{spec.get('transport', 'stdio')}',",
                f"  enabled: {str(spec.get('enabled', True)).lower()},",
                "  isAvailable: false,",
                "  tools: [],",
                f"  requiredEnvVars: {envvars_formatted},",
                "};",
                "",
            ]
        )

    # Generate library object
    lines.extend(
        [
            "// " + "=" * 76,
            "// MCP Server Library",
            "// " + "=" * 76,
            "",
            "export const MCP_SERVER_LIBRARY: Record<string, MCPServer> = {",
        ]
    )

    for spec in specs:
        server_id = spec["id"]
        const_name = f"{server_id.upper().replace('-', '_')}_MCP_SERVER"
        # Quote keys with hyphens for valid JavaScript syntax
        key = f"'{server_id}'" if "-" in server_id else server_id
        lines.append(f"  {key}: {const_name},")

    lines.extend(
        [
            "};",
            "",
        ]
    )

    return "\n".join(lines)


def update_init_file(specs: list[dict[str, Any]], init_file: Path) -> None:
    """Update the __init__.py file with correct imports based on generated specs."""
    # Generate list of MCP server constant names
    server_constants = []
    for spec in specs:
        server_id = spec["id"]
        const_name = server_id.upper().replace("-", "_") + "_MCP_SERVER"
        server_constants.append(const_name)

    # Read the current __init__.py
    init_content = init_file.read_text()

    # Find the catalog_mcp_servers import section
    import_start = init_content.find("from .catalog_mcp_servers import (")
    if import_start == -1:
        print(f"Warning: Could not find catalog_mcp_servers import in {init_file}")
        return

    # Find the end of the import statement
    import_end = init_content.find(")", import_start)
    if import_end == -1:
        print(
            f"Warning: Could not find end of catalog_mcp_servers import in {init_file}"
        )
        return

    # Generate new import lines - all names sorted alphabetically (ruff/isort order)
    all_names = sorted(
        server_constants
        + [
            "MCP_SERVER_CATALOG",
            "check_env_vars_available",
            "get_catalog_server",
            "list_catalog_servers",
        ],
        key=str.casefold,
    )
    new_imports = ["from .catalog_mcp_servers import ("]
    for name in all_names:
        new_imports.append(f"    {name},")
    new_imports.append(")")

    # Replace the import section
    new_content = (
        init_content[:import_start]
        + "\n".join(new_imports)
        + init_content[import_end + 1 :]
    )

    # Update the __all__ list - find the catalog_mcp_servers.py exports section
    all_start = new_content.find("# catalog_mcp_servers.py exports")
    if all_start != -1:
        # Find the end of this section (next closing bracket or end of __all__)
        all_section_start = all_start
        all_end = new_content.find("]", all_section_start)

        # Generate new __all__ entries for MCP servers
        all_entries = [
            "    # catalog_mcp_servers.py exports",
            '    "MCP_SERVER_CATALOG",',
            '    "check_env_vars_available",',
            '    "get_catalog_server",',
            '    "list_catalog_servers",',
        ]
        for const in sorted(server_constants):
            all_entries.append(f'    "{const}",')
        all_entries.append("]")

        # Replace the section
        new_content = new_content[:all_section_start] + "\n".join(all_entries)

    # Write updated content
    init_file.write_text(new_content)
    print(f"✓ Updated {init_file}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML MCP server specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML specification files",
    )
    parser.add_argument(
        "--python-output",
        type=Path,
        required=True,
        help="Output path for generated Python file",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        required=True,
        help="Output path for generated TypeScript file",
    )

    args = parser.parse_args()

    # Validate specs directory
    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    # Load specifications
    print(f"Loading MCP server specs from {args.specs_dir}...")
    specs = load_mcp_specs(args.specs_dir)
    print(f"Loaded {len(specs)} MCP server specifications")

    # Generate Python code
    print("Generating Python code...")
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(python_code)
    print(f"✓ Generated {args.python_output}")

    # Generate TypeScript code
    print("Generating TypeScript code...")
    typescript_code = generate_typescript_code(specs)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(typescript_code)
    print(f"✓ Generated {args.typescript_output}")

    # Update __init__.py with correct imports
    init_file = args.python_output.parent / "__init__.py"
    if init_file.exists():
        print("Updating imports in __init__.py...")
        update_init_file(specs, init_file)

    print(f"\n✓ Successfully generated code from {len(specs)} MCP server specs")


if __name__ == "__main__":
    main()
