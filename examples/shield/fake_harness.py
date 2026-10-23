# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The fake coding agent the Shield's examples run on, and a workspace for it.

The agent is the ACP SDK agent the tests run every harness drill on
(``agent_runtimes/tests/fixtures/acp_fake_agent.py``): it needs no model and no
key. What a prompt makes it do is in its own docstring — ``edit`` asks to edit
``hello.txt`` and writes it, ``read [<path>]`` reads a file, ``run <command>``
opens a terminal, ``push`` asks for a ``git push``, ``outside`` reads
``/etc/hostname``, ``plan`` reports a plan.

Claude Code is the same thing with a key: ``--harness claude-code`` in the
examples that take it.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from agent_runtimes.types import (
    HarnessAcpSpec,
    HarnessCapabilitiesSpec,
    HarnessHonoursSpec,
    HarnessRegisterEntry,
    HarnessSkillsSpec,
    HarnessSpec,
    HarnessTermsSpec,
)

#: The fake agent's script, in this checkout.
FAKE_AGENT = (
    Path(__file__).resolve().parents[2]
    / "agent_runtimes"
    / "tests"
    / "fixtures"
    / "acp_fake_agent.py"
)

#: How the fake agent is launched: this Python, its script.
FAKE_COMMAND = [sys.executable, str(FAKE_AGENT)]


def fake_harness() -> HarnessSpec:
    """The fake agent described as a harness, the way the catalogue describes Claude Code.

    Returns
    -------
    HarnessSpec
        A harness named ``fake``, launched with this Python, lending MCP.
    """
    return HarnessSpec(
        id="fake",
        name="Fake agent",
        description="The ACP SDK's fake agent: no model, no key.",
        acp=HarnessAcpSpec(
            command=sys.executable,
            args=[str(FAKE_AGENT)],
            mcp="lend",
            load_session=True,
        ),
        # A harness whose terms are unknown is served nowhere: the fake's are the SDK's.
        terms=HarnessTermsSpec(
            served_to_third_parties="permitted",
            licence="Apache-2.0 (the ACP SDK's fake agent)",
        ),
        skills=HarnessSkillsSpec(format="none"),
        honours=HarnessHonoursSpec(model=False, subagents=True),
        # What a session may rely on of it: it loads its sessions in-process,
        # replays a clone's history as text, can be interrupted.
        capabilities=HarnessCapabilitiesSpec(
            resume="load",
            fork_history="replay",
            interrupt=True,
            steering=False,
            images=False,
            compaction="own",
        ),
        registered=HarnessRegisterEntry(adapter="fake", version="0.0.1"),
    )


def a_workspace() -> Path:
    """A fresh directory with a README, the workspace the Shield guards.

    Returns
    -------
    Path
        The directory, under the system's temporary directory.
    """
    root = Path(tempfile.mkdtemp(prefix="shield-example-"))
    (root / "README.md").write_text("# A small project\n", encoding="utf-8")
    return root
