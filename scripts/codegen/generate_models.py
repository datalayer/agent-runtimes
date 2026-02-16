#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML AI model specifications.

Usage:
    python generate_models.py \\
      --specs-dir agentspecs/agentspecs/models \\
      --python-output agent_runtimes/config/models.py \\
      --typescript-output src/config/models.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


def load_model_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all AI model YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            specs.append(spec)
    return specs


def _make_const_name(model_id: str) -> str:
    """
    Convert a model ID to a Python/TypeScript constant name.

    E.g. 'anthropic:claude-sonnet-4-5-20250514' -> 'ANTHROPIC_CLAUDE_SONNET_4_5_20250514'
    """
    return model_id.upper().replace(":", "_").replace("-", "_").replace(".", "_")


def _make_enum_name(model_id: str) -> str:
    """Convert a model ID to an enum member name (same as const name)."""
    return _make_const_name(model_id)


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from AI model specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "AI Model Catalog.",
        "",
        "Predefined AI model configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "import os",
        "from enum import Enum",
        "from typing import Dict, List, Optional",
        "",
        "from pydantic import BaseModel, Field",
        "",
        "",
        "# " + "=" * 76,
        "# AIModel Pydantic class",
        "# " + "=" * 76,
        "",
        "",
        "class AIModel(BaseModel):",
        '    """Specification for an AI model."""',
        "",
        '    id: str = Field(..., description="Unique model identifier")',
        '    name: str = Field(..., description="Display name")',
        '    description: str = Field(default="", description="Model description")',
        '    provider: str = Field(..., description="Provider name")',
        '    default: bool = Field(default=False, description="Whether this is the default model")',
        "    required_env_vars: List[str] = Field(",
        "        default_factory=list,",
        '        description="Required environment variable names",',
        "    )",
        "",
        "",
        "# " + "=" * 76,
        "# AIModels Enum",
        "# " + "=" * 76,
        "",
        "",
        "class AIModels(str, Enum):",
        '    """Enumeration of all available AI model IDs."""',
        "",
    ]

    # Generate enum members
    for spec in specs:
        enum_name = _make_enum_name(spec["id"])
        lines.append(f'    {enum_name} = "{spec["id"]}"')

    lines.extend(
        [
            "",
            "",
            "# " + "=" * 76,
            "# AI Model Definitions",
            "# " + "=" * 76,
            "",
        ]
    )

    # Generate model constants
    for spec in specs:
        const_name = _make_const_name(spec["id"])

        # Format required_env_vars
        env_vars = spec.get("required_env_vars", [])
        if env_vars:
            env_vars_formatted = "[" + ", ".join(f'"{v}"' for v in env_vars) + "]"
        else:
            env_vars_formatted = "[]"

        lines.extend(
            [
                f"{const_name} = AIModel(",
                f'    id="{spec["id"]}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec.get("description", "")}",',
                f'    provider="{spec["provider"]}",',
                f"    default={spec.get('default', False)},",
                f"    required_env_vars={env_vars_formatted},",
                ")",
                "",
            ]
        )

    # Generate catalog dictionary
    lines.extend(
        [
            "# " + "=" * 76,
            "# AI Model Catalog",
            "# " + "=" * 76,
            "",
            "AI_MODEL_CATALOGUE: Dict[str, AIModel] = {",
        ]
    )

    for spec in specs:
        model_id = spec["id"]
        const_name = _make_const_name(model_id)
        lines.append(f'    "{model_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
        ]
    )

    # Find default model
    default_specs = [s for s in specs if s.get("default", False)]
    if default_specs:
        default_id = default_specs[0]["id"]
        default_enum = _make_enum_name(default_id)
        lines.extend(
            [
                "",
                f"DEFAULT_MODEL: AIModels = AIModels.{default_enum}",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "DEFAULT_MODEL: Optional[AIModels] = None",
                "",
            ]
        )

    # Generate helper functions
    lines.extend(
        [
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
            "        return True",
            "    return all(os.environ.get(var) for var in env_vars)",
            "",
            "",
            "def get_model(model_id: str) -> Optional[AIModel]:",
            '    """',
            "    Get an AI model by ID.",
            "",
            "    Args:",
            "        model_id: The unique identifier of the AI model.",
            "",
            "    Returns:",
            "        The AIModel specification, or None if not found.",
            '    """',
            "    return AI_MODEL_CATALOGUE.get(model_id)",
            "",
            "",
            "def get_default_model() -> Optional[AIModel]:",
            '    """',
            "    Get the default AI model.",
            "",
            "    Returns:",
            "        The default AIModel, or None if no default is set.",
            '    """',
            "    if DEFAULT_MODEL is None:",
            "        return None",
            "    return AI_MODEL_CATALOGUE.get(DEFAULT_MODEL.value)",
            "",
            "",
            "def list_models() -> list[AIModel]:",
            '    """',
            "    List all AI models with availability status.",
            "",
            "    For each model, checks if the required environment variables are set.",
            "",
            "    Returns:",
            "        List of all AIModel specifications.",
            '    """',
            "    return list(AI_MODEL_CATALOGUE.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from AI model specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * AI Model Catalog",
        " *",
        " * Predefined AI model configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "// " + "=" * 76,
        "// AIModel Type",
        "// " + "=" * 76,
        "",
        "export interface AIModel {",
        "  /** Unique model identifier (e.g., 'anthropic:claude-sonnet-4-5-20250514') */",
        "  id: string;",
        "  /** Display name for the model */",
        "  name: string;",
        "  /** Model description */",
        "  description: string;",
        "  /** Provider name (anthropic, openai, bedrock, azure-openai) */",
        "  provider: string;",
        "  /** Whether this is the default model */",
        "  default: boolean;",
        "  /** Required environment variable names */",
        "  requiredEnvVars: string[];",
        "}",
        "",
        "// " + "=" * 76,
        "// AIModels Enum",
        "// " + "=" * 76,
        "",
        "export const AIModels = {",
    ]

    # Generate enum-like const object
    for spec in specs:
        enum_name = _make_enum_name(spec["id"])
        lines.append(f"  {enum_name}: '{spec['id']}',")

    lines.extend(
        [
            "} as const;",
            "",
            "export type AIModelId = (typeof AIModels)[keyof typeof AIModels];",
            "",
            "// " + "=" * 76,
            "// AI Model Definitions",
            "// " + "=" * 76,
            "",
        ]
    )

    # Generate model constants
    for spec in specs:
        const_name = _make_const_name(spec["id"])

        # Format required_env_vars
        env_vars = spec.get("required_env_vars", [])
        if env_vars:
            env_vars_formatted = "[" + ", ".join(f"'{v}'" for v in env_vars) + "]"
        else:
            env_vars_formatted = "[]"

        # Escape description for TypeScript
        description = spec.get("description", "").replace("'", "\\'")

        lines.extend(
            [
                f"export const {const_name}: AIModel = {{",
                f"  id: '{spec['id']}',",
                f"  name: '{spec['name']}',",
                f"  description: '{description}',",
                f"  provider: '{spec['provider']}',",
                f"  default: {str(spec.get('default', False)).lower()},",
                f"  requiredEnvVars: {env_vars_formatted},",
                "};",
                "",
            ]
        )

    # Generate catalog object
    lines.extend(
        [
            "// " + "=" * 76,
            "// AI Model Catalog",
            "// " + "=" * 76,
            "",
            "export const AI_MODEL_CATALOGUE: Record<string, AIModel> = {",
        ]
    )

    for spec in specs:
        model_id = spec["id"]
        const_name = _make_const_name(model_id)
        lines.append(f"  '{model_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
        ]
    )

    # Default model
    default_specs = [s for s in specs if s.get("default", False)]
    if default_specs:
        default_id = default_specs[0]["id"]
        default_const = _make_const_name(default_id)
        lines.extend(
            [
                f"export const DEFAULT_MODEL: AIModelId = AIModels.{_make_enum_name(default_id)};",
                f"export const DEFAULT_MODEL_SPEC: AIModel = {default_const};",
                "",
            ]
        )

    return "\n".join(lines)


def update_init_file(specs: list[dict[str, Any]], init_file: Path) -> None:
    """Update the __init__.py file with correct imports based on generated specs."""
    # Generate list of model constant names
    model_constants = []
    for spec in specs:
        const_name = _make_const_name(spec["id"])
        model_constants.append(const_name)

    # Read the current __init__.py
    init_content = init_file.read_text()

    # Find the catalog_models import section
    import_start = init_content.find("from .models import (")
    if import_start == -1:
        print(f"Warning: Could not find models import in {init_file}")
        return

    # Find the end of the import statement
    import_end = init_content.find(")", import_start)
    if import_end == -1:
        print(f"Warning: Could not find end of models import in {init_file}")
        return

    # Generate new import lines - all names sorted alphabetically
    all_names = sorted(
        model_constants
        + [
            "AIModel",
            "AIModels",
            "AI_MODEL_CATALOGUE",
            "DEFAULT_MODEL",
            "check_env_vars_available",
            "get_default_model",
            "get_model",
            "list_models",
        ],
        key=str.casefold,
    )
    new_imports = ["from .models import ("]
    for name in all_names:
        new_imports.append(f"    {name},")
    new_imports.append(")")

    # Replace the import section
    new_content = (
        init_content[:import_start]
        + "\n".join(new_imports)
        + init_content[import_end + 1 :]
    )

    # Write updated content
    init_file.write_text(new_content)
    print(f"✓ Updated {init_file}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML AI model specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML model specification files",
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
    print(f"Loading AI model specs from {args.specs_dir}...")
    specs = load_model_specs(args.specs_dir)
    print(f"Loaded {len(specs)} AI model specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} AI model specs")


if __name__ == "__main__":
    main()
