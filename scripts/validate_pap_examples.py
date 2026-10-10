# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Build every Agent Runtimes PAP example and reject duplicate identifiers."""

from __future__ import annotations

import sys
from pathlib import Path

from agent_runtimes.loop.apps.build import build

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
    "session_token",
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
        sys.stdout.write(
            f"{path.relative_to(ROOT)}: {app_id} "
            f"({len(built.application.spec.tools)} tool)\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
