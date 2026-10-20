#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A rule tightened on a running session (SH-54, SH-23 c).

A person adds a rule to a session while it runs; it holds from the next
action, for that session only, and only ever tightens. This script runs the
runtime's harness agent (``ACPAgent``) on the fake agent and does what the
session rules route does — ``POST /api/v1/apps/sessions/{uid}/rules`` calls
``session_rules().add(uid, rule_from(body), application=rules_policy(app))``
— between two turns (this example's application has no Rules of its own):

1. ``read README.md`` — reading inside the workspace: *do it*.
2. The rule ``no reads`` (*leave it to me* on reading) added to the session.
3. ``read README.md`` again — refused in the session rule's sentence.
4. A rule that would allow commands freely, refused because the
   organization's rules ask first (the ``above`` the runtime reads from IAM;
   given here as a document).
5. The rule taken back (``DELETE …/rules/no reads``): reading is done again.

Run it from this folder::

    python session_rule.py

No key, no account.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from agent_shield.policy import Policy, Rule

sys.path.insert(0, str(Path(__file__).parent))

from fake_harness import FAKE_COMMAND, a_workspace, fake_harness  # noqa: E402

from agent_runtimes.adapters.acp_agent import ACPAgent  # noqa: E402
from agent_runtimes.adapters.base import AgentContext  # noqa: E402
from agent_runtimes.guardrails.session_rules import (  # noqa: E402
    SessionRuleRefused,
    rule_from,
    session_rules,
)
from agent_runtimes.guardrails.shield_policy import policies_of  # noqa: E402

SESSION = "session-0001"

#: What an organization might say above every session: commands ask first.
ORGANIZATION = Policy(
    scope="organization",
    rules=[Rule(name="commands ask", decision="ask", classes=["execute"])],
)


async def turn(agent: ACPAgent, prompt: str) -> None:
    """One turn, printed: the agent's words and the Shield's tool rows."""
    print(f"\n> {prompt}")
    async for event in agent.stream(prompt, AgentContext(session_id=SESSION)):
        if event.type == "text":
            print(f"  agent      {event.data}")
        elif event.type == "tool_call" and isinstance(event.data, dict):
            title = event.data.get("tool_name") or event.data.get("name")
            if str(title).startswith(("Read", "Write", "Run")) and "—" in str(title):
                print(f"  Shield     {title}")


async def main() -> int:
    """Two turns around a session rule, and the refusals.

    Returns
    -------
    int
        0 when the rule held and was refused where it should be, 1 otherwise.
    """
    agent = ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=FAKE_COMMAND,
        workspace=a_workspace(),
        policies=policies_of(None),
    )
    await agent.initialize()
    refused_loosening = ""
    try:
        await turn(agent, "read README.md")

        rule = {"name": "no reads", "decision": "deny", "classes": ["read"]}
        session_rules().add(SESSION, rule_from(rule), application=None)
        in_force = agent.rules_in_force_of(SESSION) or {}
        names = [item["name"] for item in in_force.get("session_rules", [])]
        print(f"\nAdded      {rule} -> the session's rules: {names}")

        await turn(agent, "read README.md")

        try:
            session_rules().add(
                SESSION,
                rule_from(
                    {"name": "run freely", "decision": "allow", "classes": ["execute"]}
                ),
                application=None,
                above=[ORGANIZATION],
            )
        except SessionRuleRefused as refused:
            refused_loosening = str(refused)
            print(f"\nRefused    {refused_loosening}")

        session_rules().remove(SESSION, "no reads")
        print("\nRemoved    no reads")
        await turn(agent, "read README.md")
    finally:
        session_rules().forget(SESSION)
        await agent.cleanup()
    return 0 if refused_loosening else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
