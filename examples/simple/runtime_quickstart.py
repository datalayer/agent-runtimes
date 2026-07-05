#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
# BSD 3-Clause License

"""
Simple Datalayer runtime example.

Creates a Datalayer client, lists environments, creates a runtime from the
first environment, executes `1+1`, prints the result, then terminates.
"""

from __future__ import annotations

from agent_runtimes.client import RuntimeClient


def main() -> None:
    client = RuntimeClient()

    environments = client.list_environments()
    if not environments:
        raise RuntimeError("No environments available.")

    print("Available environments:")
    for env in environments:
        print(f"- {env.name} ({env.title})")

    first_env = environments[0]
    with client.create_runtime(environment=first_env.name) as runtime:
        response = runtime.execute("result = 1 + 1\nprint(result)")
        print("Execution output:")
        print(response.stdout or response.text or response)


if __name__ == "__main__":
    main()
