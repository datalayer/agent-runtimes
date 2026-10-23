# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The harness rows per (session, agent) and the vendor's session id (MH-04, MH-05).

A harness's row is kept under `<agentspec>:<uid>` and never deleted on a
swap: a swap A→B→A finds A's row, loads A's own session and compares the
replay against A's own spans of the record, then replays B's turns as text
with the first prompt; a harness whose `resume` is `none` starts over, said,
its row kept for the vendor id alone. The vendor's own session id is kept in
the row when the adapter exposes it in `session/new`'s `_meta` and the spec
says so (`acp.native_session: meta`), and said absent otherwise.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from agent_runtimes.adapters.acp_agent import native_session_id_of, own_and_since
from agent_runtimes.tests.test_acp_agent import (  # noqa: F401 - fixtures and helpers
    Store,
    an_agent,
    fake_harness,
    texts,
    turn,
    workspace,
)
from agent_runtimes.types import HarnessAcpSpec, HarnessCapabilitiesSpec


def _caps(resume: str = "load") -> HarnessCapabilitiesSpec:
    return HarnessCapabilitiesSpec(
        resume=resume,
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
    )


def _user(text: str, agent: str = "") -> dict[str, Any]:
    return {"role": "user", "content": text, **({"agent": agent} if agent else {})}


def _assistant(text: str) -> dict[str, Any]:
    return {"role": "assistant", "content": text}


@pytest.mark.asyncio
async def test_a_row_per_session_and_agent_kept_across_a_swap_and_the_replay_compared_with_its_own_spans(
    workspace: Path,  # noqa: F811 - the fixture
) -> None:
    store = Store()
    a = an_agent(workspace, state_store=store, spec_id="spec-a")
    b = an_agent(workspace, state_store=store, spec_id="spec-b")
    try:
        await turn(a, "hello", session="s")
        row_a = store.kept["harness_session:spec-a:s"]
        assert (
            row_a["acp_session_id"],
            row_a["agent"],
            row_a["harness"],
            row_a["resume"],
        ) == ("fake_1", "spec-a", "fake", "load")
        assert row_a["native_session"] == "none" and row_a["native_session_id"] is None
        # Swapped to B: B's own row; A's stays.
        await turn(b, "hi", session="s")
        assert store.kept["harness_session:spec-b:s"]["acp_session_id"] == "fake_1"
        assert "harness_session:spec-a:s" in store.kept
        # Swapped back to A, in the same process: A loads its own session, the
        # replay compared with A's own spans (1 turn), B's turns replayed as text.
        a._acp_of.clear()
        a.sessions.clear()
        history = [
            _user("hello", "spec-a"),
            _assistant("Heard hello"),
            _user("hi", "spec-b"),
            _assistant("Heard hi"),
        ]
        events = await turn(a, "and now?", session="s", conversation_history=history)
        said = texts(events)
        assert (
            "replayed 0 turn(s) of its session fake_1; the record holds 1 of its own: they differ"
            in said
        )
        assert a._since == {}, "the turns since went with the prompt, once"
    finally:
        await a.cleanup()
        await b.cleanup()


def test_the_agents_own_spans_and_the_turns_since() -> None:
    history = [
        _user("one", "spec-a"),
        _assistant("1"),
        _user("two", "spec-a"),
        _assistant("2"),
        _user("three", "spec-b"),
        _assistant("3"),
        _user("four", "spec-b"),
        _assistant("4"),
    ]
    own, since = own_and_since(history, "spec-a")
    assert [m["content"] for m in own] == ["one", "two"]
    assert since == (
        "While another agent had this conversation, this was said:\n"
        "The person: three\nThe other agent: 3\nThe person: four\nThe other agent: 4"
    )
    # Untagged turns are the agent's own when it was the only one.
    own, since = own_and_since([_user("a"), _assistant("1")], "spec-a")
    assert len(own) == 1 and since == ""


@pytest.mark.asyncio
async def test_a_resume_none_harness_starts_over_said_and_its_row_is_kept(
    workspace: Path,  # noqa: F811 - the fixture
) -> None:
    store = Store()
    harness = fake_harness(
        id="forgetful",
        acp=HarnessAcpSpec(command="x", args=[], mcp="lend", load_session=False),
        capabilities=_caps("none"),
    )
    first = an_agent(workspace, state_store=store, harness=harness, spec_id="spec-f")
    try:
        await turn(first, "hello", session="s")
    finally:
        await first.cleanup()
    assert store.kept["harness_session:spec-f:s"]["resume"] == "none"
    second = an_agent(workspace, state_store=store, harness=harness, spec_id="spec-f")
    try:
        events = await turn(
            second, "again", session="s", conversation_history=[_user("hello")]
        )
    finally:
        await second.cleanup()
    assert (
        "cannot be loaded: it starts over; the earlier turns of this conversation were not replayed to it"
        in texts(events)
    )
    assert "harness_session:spec-f:s" in store.kept


@pytest.mark.asyncio
async def test_the_vendors_session_id_is_kept_when_the_adapter_exposes_it(
    workspace: Path,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = Store()
    monkeypatch.setenv("FAKE_AGENT_SESSION_META", "1")
    exposing = fake_harness(
        acp=HarnessAcpSpec(
            command="x", args=[], mcp="lend", load_session=True, native_session="meta"
        )
    )
    agent = an_agent(
        workspace, state_store=store, harness=exposing, environment=dict(os.environ)
    )
    try:
        await turn(agent, "hello", session="s")
    finally:
        await agent.cleanup()
    row = store.kept["harness_session:fake:s"]
    assert (row["native_session"], row["native_session_id"]) == (
        "meta",
        "vendor-fake_1",
    )
    # The spec says none: nothing is read from _meta, even when the adapter sends one.
    silent = an_agent(workspace, state_store=store, environment=dict(os.environ))
    try:
        await turn(silent, "hello", session="t")
    finally:
        await silent.cleanup()
    assert store.kept["harness_session:fake:t"]["native_session_id"] is None
    # The spec says meta and the adapter gave none: said absent (the drill's claim drifted).
    assert native_session_id_of(exposing, None) is None
    assert native_session_id_of(exposing, {"claudeSessionId": "abc"}) == "abc"
    assert native_session_id_of(exposing, {"threadId": "t-1"}) == "t-1"
    assert native_session_id_of(fake_harness(), {"claudeSessionId": "abc"}) is None
