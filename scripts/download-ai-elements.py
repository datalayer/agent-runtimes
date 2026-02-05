#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Download AI Elements components directly from the registry.
"""

import json
import os
import sys
import urllib.request
from urllib.parse import urlparse

BASE_URL = "https://registry.ai-sdk.dev"
COMPONENTS_DIR = "src/components/ai-elements"

# Components to download
COMPONENTS = [
    "message",
    "conversation",
    "prompt-input",
    "model-selector",
    "artifact",
    "code-block",
    "suggestion",
    "sources",
    "reasoning",
    "tool",
    "loader",
    "shimmer",
]


def download_component(component_name):
    """
    Download a component from the registry.
    """
    url = f"{BASE_URL}/{component_name}.json"
    print(f"Downloading {component_name}...")

    # Validate URL scheme to prevent B310 security issue
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"Invalid URL scheme: {parsed.scheme}. Only http and https are allowed."
        )

    try:
        with urllib.request.urlopen(url) as response:  # nosec B310
            data = json.loads(response.read())

        # Get the first file (main component file)
        if "files" in data and len(data["files"]) > 0:
            file_data = data["files"][0]
            content = file_data.get("content", "")
            target = file_data.get(
                "target", f"components/ai-elements/{component_name}.tsx"
            )

            # Adjust target path
            target_path = os.path.join(COMPONENTS_DIR, f"{component_name}.tsx")

            # Ensure directory exists
            os.makedirs(os.path.dirname(target_path), exist_ok=True)

            # Write file
            with open(target_path, "w") as f:
                f.write(content)

            print(f"✓ Downloaded {component_name} to {target_path}")
            return True
        else:
            print(f"✗ No files found for {component_name}")
            return False

    except Exception as e:
        print(f"✗ Error downloading {component_name}: {e}")
        return False


def main():
    print(f"Downloading AI Elements components to {COMPONENTS_DIR}")
    print(f"Components: {', '.join(COMPONENTS)}\n")

    # Create components directory
    os.makedirs(COMPONENTS_DIR, exist_ok=True)

    success_count = 0
    for component in COMPONENTS:
        if download_component(component):
            success_count += 1

    print(f"\n✓ Successfully downloaded {success_count}/{len(COMPONENTS)} components")

    if success_count < len(COMPONENTS):
        sys.exit(1)


if __name__ == "__main__":
    main()
