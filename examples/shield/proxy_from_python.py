#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's proxy, driven from Python (SH-23 b).

``agent-shield run -- <an ACP agent>`` stands in front of the agent as an ACP
agent itself; this script is the ACP client an editor would be. It starts the
proxy over stdio with the fake agent behind it, a policy file (the platform's default
default) and an audit file of its own, and sends three prompts:

1. ``edit`` — editing inside the workspace is *do it*: the agent's permission
   request is answered by the Shield, and never reaches this client.
2. ``push`` — a ``git push`` is *ask me first*: the question reaches this
   client with the agent's options, and this client answers no.
3. ``outside`` — a read of ``/etc/hostname``, outside the workspace: refused
   by the Shield in a sentence before any rule.

Then it reads the audit back, row by row, the way ``agent-shield log`` does.

Run it from this folder::

    python proxy_from_python.py

It needs ``datalayer-agent-shield`` (the ``agent-shield`` command on the
PATH) and nothing else: no key, no Datalayer account.
"""

from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path
from typing import Any

from acp import text_block
from acp.schema import AllowedOutcome, RequestPermissionResponse
from agent_shield.acp import StdioACPChannel
from agent_shield.audit import AuditLog
from agent_shield.policy import default_policy, dump_policy

sys.path.insert(0, str(Path(__file__).parent))

from fake_harness import FAKE_COMMAND, a_workspace  # noqa: E402


class Editor:
    """What an editor does as the proxy's ACP client: show, and answer what is asked."""

    def __init__(self) -> None:
        self.asked: list[str] = []

    async def session_update(self, session_id: str, update: Any, **_: Any) -> None:
        kind = update.session_update
        if kind == "agent_message_chunk":
            print(f"  agent      {update.content.text}")
        elif kind == "tool_call":
            print(f"  tool call  {update.title} ({update.kind}, {update.status})")
        elif kind == "tool_call_update" and update.status:
            print(f"  tool call  {update.tool_call_id} {update.status}")

    async def request_permission(
        self, options: list[Any], session_id: str, tool_call: Any, **_: Any
    ) -> RequestPermissionResponse:
        self.asked.append(tool_call.title or "")
        names = ", ".join(option.name for option in options)
        print(f"  asked      {tool_call.title}? ({names}) -> Reject")
        reject = next(option for option in options if option.kind == "reject_once")
        return RequestPermissionResponse(
            outcome=AllowedOutcome(outcome="selected", option_id=reject.option_id)
        )


async def main() -> int:
    """Run the proxy, three prompts, and read the audit back.

    Returns
    -------
    int
        0 when the Shield decided as the policy says, 1 otherwise.
    """
    shield = shutil.which("agent-shield")
    if shield is None:
        print("agent-shield is not on the PATH: pip install datalayer-agent-shield")
        return 1
    workspace = a_workspace()
    policy = workspace / "agent-shield.yaml"
    policy.write_text(dump_policy(default_policy()), encoding="utf-8")
    audit = workspace.parent / f"{workspace.name}-audit.jsonl"
    editor = Editor()
    print(f"Workspace  {workspace}")
    print("Policy     Datalayer's default\n")
    async with StdioACPChannel.launch(
        editor,
        shield,
        "run",
        "--workspace",
        str(workspace),
        "--policy",
        str(policy),
        "--audit",
        str(audit),
        "--",
        *FAKE_COMMAND,
        cwd=workspace,
    ) as channel:
        answer = await channel.initialize()
        print(f"Connected  {answer.agent_info.name} {answer.agent_info.version}")
        session = await channel.new_session(workspace)
        for prompt in ("edit", "push", "outside"):
            print(f"\n> {prompt}")
            turn = await channel.prompt(session.session_id, [text_block(prompt)])
            print(f"  ended      {turn.stop_reason}")

    print("\nThe audit, read back")
    for row in AuditLog(audit).rows():
        what = row.get("sentence") or " ".join(
            str(row[key])
            for key in ("what", "title", "path", "command", "status", "exit")
            if row.get(key) not in (None, "")
        )
        by = f"  [{row['by']}]" if row.get("by") else ""
        print(f"  {row['event']:<11} {what}{by}")

    written = (workspace / "hello.txt").read_text(encoding="utf-8")
    ok = written == "hello, shield\n" and editor.asked == ["git push origin main"]
    print(
        "\nThe edit was done without asking, the push was asked and refused."
        if ok
        else "\nThe Shield did not decide as the policy says: see above."
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
