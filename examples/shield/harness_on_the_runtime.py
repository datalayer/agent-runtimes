#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A coding agent behind the Shield, on the local runtime (SH-23 a).

What ``loop --harness <id>`` starts, started here in the same way: the
runtime's server on this machine, the harness made at startup through the
create route (``AGENT_RUNTIMES_HARNESS``), the directory it guards as its
workspace (``AGENT_RUNTIMES_WORKSPACE_ROOT``). The script then talks to it the
way the terminal and the web chat do — one AG-UI turn over HTTP — and prints
what the runtime streamed: the agent's words, each tool call with the Shield's
decision as its title, and the change as a ``diff`` display.

On the fake agent (the default) it needs nothing::

    python harness_on_the_runtime.py

Claude Code is the same script with its adapter installed
(``agent-shield setup --harness claude-code``) and a funded
``ANTHROPIC_API_KEY`` in the environment::

    python harness_on_the_runtime.py --harness claude-code \\
        --prompt "Add a line to README.md saying hello"

For the web chat (``ShieldHarnessExample`` in the examples app), serve the
runtime on port 8765 until interrupted instead of sending a turn::

    python harness_on_the_runtime.py --serve

No Datalayer account: with no token the runtime decides by Datalayer's
default policy (decision 5); on Datalayer, the runtime reads your
organization's rules from IAM first, and refuses to start the harness when
it cannot.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import sys
import uuid
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from fake_harness import a_workspace, fake_harness  # noqa: E402


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _say(event: dict[str, Any]) -> str | None:
    """One line for an AG-UI event worth reading; None for the rest."""
    kind = event.get("type")
    if kind == "TEXT_MESSAGE_CONTENT":
        return f"  agent      {event['delta']}"
    if kind == "CUSTOM" and event.get("name") == "datalayer.harness.tool_call":
        # The harness's own tool call, as it told it, with the Shield's decision.
        call = event.get("value") or {}
        decided = f" — decided: {call['decision']}" if call.get("decision") else ""
        return f"  tool call  {call.get('name')} ({call.get('kind')}){decided}"
    if kind == "TOOL_CALL_RESULT":
        result = json.loads(event.get("content") or "{}")
        lines = []
        for display in result.get("display") or []:
            if display.get("display") == "diff":
                lines.append(
                    f"  diff       {display['path']}: {display.get('old_text')!r} -> {display['new_text']!r}"
                )
            elif display.get("display") == "terminal":
                lines.append(
                    f"  terminal   {display.get('command')} -> exit {display.get('exit_code')}"
                )
        return "\n".join(lines) or None
    if kind == "RUN_ERROR":
        return f"  refused    {event.get('message')}"
    if kind == "RUN_FINISHED":
        return "  finished"
    return None


async def main(argv: list[str] | None = None) -> int:
    """Start the runtime with a harness, send one turn, print what came back.

    Returns
    -------
    int
        0 when the turn finished, 1 otherwise.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--harness", default="fake", help="fake (default), or a catalogue harness"
    )
    parser.add_argument(
        "--prompt", default="edit and read README.md", help="What to ask it."
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Serve the runtime until interrupted, for the web chat (ShieldHarnessExample).",
    )
    parser.add_argument(
        "--port", type=int, default=0, help="The port; 8765 with --serve."
    )
    arguments = parser.parse_args(argv)

    import uvicorn

    from agent_runtimes.app import ServerConfig, create_app
    from agent_runtimes.specs import harnesses

    if arguments.harness == "fake":
        # The fake agent is not in the catalogue: it is added the way an
        # organization's own harness would be described.
        harnesses.HARNESS_CATALOGUE["fake"] = fake_harness()
    from agent_runtimes.adapters.acp_agent import (
        HarnessRefused,
        harness_environment,
        launch_command,
    )

    # What the runtime would refuse at startup, refused here first in its
    # sentence, as `loop --harness` does: no such harness, its adapter not
    # installed, its key missing.
    spec = harnesses.HARNESS_CATALOGUE.get(arguments.harness)
    if spec is None:
        print(
            f"There is no harness named {arguments.harness!r}: `loop harnesses` lists them."
        )
        return 2
    try:
        launch_command(spec)
        harness_environment(spec)
    except HarnessRefused as refused:
        print(refused)
        return 2
    workspace = a_workspace()
    port = arguments.port or (8765 if arguments.serve else _free_port())
    os.environ["AGENT_RUNTIMES_HARNESS"] = arguments.harness
    os.environ["AGENT_RUNTIMES_WORKSPACE_ROOT"] = str(workspace)
    os.environ["AGENT_RUNTIMES_AGENT_NAME"] = "chat"
    os.environ["AGENT_RUNTIMES_PORT"] = str(port)
    print(f"Harness    {arguments.harness}")
    print(f"Workspace  {workspace}")

    server = uvicorn.Server(
        uvicorn.Config(
            create_app(ServerConfig()), host="127.0.0.1", port=port, log_level="warning"
        )
    )
    serving = asyncio.create_task(server.serve())
    while not server.started:
        if serving.done():
            await serving
            print("The runtime did not start: see above.")
            return 1
        await asyncio.sleep(0.05)
    base = f"http://127.0.0.1:{port}/api/v1"
    if arguments.serve:
        print(f"\nServing    {base}/ag-ui/chat/ — interrupt to stop")
        await serving
        return 0
    finished = False
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            print(f"\n> {arguments.prompt}")
            async with client.stream(
                "POST",
                f"{base}/ag-ui/chat/",
                json={
                    "threadId": f"example-{uuid.uuid4().hex[:8]}",
                    "runId": "run-1",
                    "messages": [
                        {"id": "m1", "role": "user", "content": arguments.prompt}
                    ],
                },
            ) as answer:
                async for line in answer.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    event = json.loads(line[6:])
                    said = _say(event)
                    if said:
                        print(said)
                    finished = finished or event.get("type") == "RUN_FINISHED"
            # Ending the agent ends the harness's process (DELETE /agents/{id}).
            await client.delete(f"{base}/agents/chat")
    finally:
        server.should_exit = True
        await serving
    changed = workspace / "hello.txt"
    if changed.is_file():
        print(f"\nIn the workspace: hello.txt says {changed.read_text()!r}")
    return 0 if finished else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
