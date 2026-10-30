# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Build every Agent Runtimes PAP example, run its read tools, and reject duplicate identifiers.

Each example's argument-free ``read`` tool is run once: the demo worlds are in
process, with no network and no model. An application that is a company
(``pap.company``) must declare each operation on a tool of its own.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from agent_runtimes.apps.build import build

ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "examples" / "personal-agent-protocol"
HOST_ONLY_TOOL_ARGUMENTS = {
    "access_token",
    "authorization_code",
    "callback_url",
    "client_assertion",
    "code_verifier",
    "local_user_id",
    "pairwise_user_id",
    "redirect_uri",
    "session_jwt",
}


def main() -> int:
    """Validate each PAP application definition."""

    app_ids: set[str] = set()
    tool_names: set[tuple[str, str]] = set()
    paths = sorted(EXAMPLES.glob("*/app.py"))
    if not paths:
        raise RuntimeError("No Agent Runtimes PAP examples were found")
    for path in paths:
        built = build(str(path))
        app_id = built.application.spec.id
        if app_id in app_ids:
            raise RuntimeError(f"Duplicate example application id: {app_id}")
        app_ids.add(app_id)
        for tool in built.application.spec.tools:
            key = (app_id, tool.name)
            if key in tool_names:
                raise RuntimeError(f"Duplicate example tool: {app_id}/{tool.name}")
            tool_names.add(key)
            properties = tool.parameters.get("properties", {})
            unsafe = HOST_ONLY_TOOL_ARGUMENTS.intersection(properties)
            if unsafe:
                names = ", ".join(sorted(unsafe))
                raise RuntimeError(
                    f"Host-only PAP values exposed by {app_id}/{tool.name}: {names}"
                )
        declared = {tool.name for tool in built.application.spec.tools}
        for operation in built.application.spec.pap.company.operations:
            if operation.tool not in declared:
                raise RuntimeError(
                    f"{app_id} declares {operation.action} on {operation.tool}, "
                    "which is not one of its tools"
                )
        ran = 0
        handlers = built.application.tools
        for tool in built.application.spec.tools:
            if tool.does != ["read"] or tool.parameters.get("required"):
                continue
            result = asyncio.run(handlers[tool.name]())
            if not isinstance(result, dict):
                raise RuntimeError(f"{app_id}/{tool.name} returned {type(result)!r}")
            json.dumps(result)
            ran += 1
        count = len(built.application.spec.tools)
        sys.stdout.write(
            f"{path.relative_to(ROOT)}: {app_id} "
            f"({count} tool{'s' if count != 1 else ''}, {ran} run)\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
