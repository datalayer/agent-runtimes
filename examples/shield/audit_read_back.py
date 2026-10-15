#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the Shield wrote in the application's record, read back (SHIELD §6.4, SH-34; SH-23 d).

The runtime's harness agent (``ACPAgent``) on the fake agent, with the
application's recorder (``AppRecorder``) — the one a shipped application's
runtime sends to ai-agents. Here its ``send`` keeps what would be sent, so
the record can be read back on this machine. One turn edits ``hello.txt``
(*do it*, shown as a diff) and runs a command naming a key (*ask me first*:
the person approves); the record's ``include`` names ``diffs`` and
``terminals``, so the diff is kept whole and the command's output too — and
the key is redacted in every entry before anything keeps it.

Run it from this folder::

    python audit_read_back.py

No key, no account: the approval is answered by the script, as a person
would answer it in *Waiting for you*.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from fake_harness import FAKE_COMMAND, a_workspace, fake_harness  # noqa: E402

from agent_runtimes.adapters.acp_agent import ACPAgent  # noqa: E402
from agent_runtimes.adapters.base import AgentContext  # noqa: E402
from agent_runtimes.guardrails.shield_policy import policies_of  # noqa: E402
from agent_runtimes.loop.apps.loading import load_app  # noqa: E402
from agent_runtimes.loop.apps.record import AppRecorder  # noqa: E402

#: A key-shaped value in a command: what the record must never keep.
KEY = "sk-ant-api03-" + "x" * 24

APP = {
    "schema": "loop.app/v1",
    "id": "shield-example",
    "name": "Shield example",
    "kind": "chat",
    "agent": "example-harness-claude-code",
    "record": {
        "include": [
            "conversations",
            "actions",
            "approvals",
            "decisions",
            "diffs",
            "terminals",
        ]
    },
}


class Person:
    """The person answering in *Waiting for you*: yes to what is asked."""

    async def request_and_wait(
        self, tool_name: str, tool_args: dict[str, Any], tool_call_id: str | None = None
    ) -> dict[str, Any]:
        print(f"  asked      {tool_name} -> approved")
        return {"status": "approved", "id": "approval-1", "tool_name": tool_name}


async def main() -> int:
    """One turn, then the record as ai-agents would receive it.

    Returns
    -------
    int
        0 when the record holds the decisions and no key, 1 otherwise.
    """
    sent: list[dict[str, Any]] = []

    async def keep(body: dict[str, Any]) -> None:
        sent.append(body)

    recorder = AppRecorder(app=load_app(APP), app_uid="app-example", send=keep)
    agent = ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=FAKE_COMMAND,
        workspace=a_workspace(),
        policies=policies_of(None),
        approvals=Person(),  # type: ignore[arg-type]
        recorder=recorder,
    )
    await agent.initialize()
    prompt = f"edit and run echo {KEY}"
    print(f"> {prompt}")
    try:
        async for event in agent.stream(
            prompt, AgentContext(session_id="session-0001")
        ):
            if event.type == "text":
                print(f"  agent      {event.data}")
        await recorder.settled("session-0001")
    finally:
        await agent.cleanup()

    entries = [entry for body in sent for entry in body["entries"]]
    print(
        f"\nThe record of {sent[0]['app_uid'] if sent else '?'}: {len(entries)} entries"
    )
    for entry in entries:
        payload = entry["payload"]
        extra = ""
        shown = (payload.get("display") or {}).get("data") or {}
        if "new_text" in shown:
            extra = f"  [kept whole: {shown['path']} now {shown['new_text']!r}]"
        elif "terminal_id" in shown:
            extra = f"  [kept: exit {shown['exit_code']}, output {shown['output']!r}]"
        print(f"  {entry['kind']:<9} {entry['summary'][:110]}{extra}")
    leaked = KEY in str(sent)
    print(
        "\nThe key appears nowhere in the record."
        if not leaked
        else "\nThe key is in the record!"
    )
    kinds = {entry["kind"] for entry in entries}
    return 0 if not leaked and {"decision", "approval"} <= kinds else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
