# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `session.hook` point and its first two hooks (MH-F06).

Each operation reaches every hook with the session and its facts; a hook
that refuses stops the operation with its sentence, one that fails stops it
naming the hook; the audit hook writes the record's rows, the OTEL hook a
span per operation under the session's trace.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient
from reactor import PluginManifest, PluginPlatform, hookimpl

from agent_runtimes.loop.apps import plugins as runtime_plugins
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.session_hooks import (
    AuditHook,
    HookFailed,
    OtelHook,
    fire,
    hooks,
)
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import HOOK_EVENTS, SESSION_HOOKS, HookRefused
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)


class Seen:
    def __init__(self) -> None:
        self.events: List[tuple[str, str, Dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Any:
        if name.startswith("on_"):
            return lambda session, facts: self.events.append(
                (name[3:], session.uid, dict(facts))
            )
        raise AttributeError(name)


class Refusing:
    name = "iam-sharing"

    async def on_end(self, session: Any, facts: Dict[str, Any]) -> None:
        raise HookRefused(
            403,
            f"Session {session.uid} is shared with two people: only its owner ends it.",
        )


class Failing:
    name = "broken"

    def on_export(self, session: Any, facts: Dict[str, Any]) -> None:
        raise RuntimeError("the audit store is down")


def _platform(*plugins: tuple[str, Any, str]) -> PluginPlatform:
    platform = PluginPlatform(extension_group="agent-runtimes.tests.extensions")

    for name, hook, cid in plugins:

        class Contributing:
            def __init__(self, hook: Any, cid: str) -> None:
                self.hook, self.cid = hook, cid

            @hookimpl
            def provide_contributions(self, contributions: Any) -> None:
                contributions.contribute(
                    SESSION_HOOKS, self.hook, contribution_id=self.cid, order=-1
                )

        platform.register_plugin(
            PluginManifest(name=name, version="0.0.1"), Contributing(hook, cid)
        )
    host.session_platform(platform, discover_installed=False)
    return platform


@dataclass
class Fake:
    uid: str = "session-h001"
    agent_id: str = "notes-assistant"
    recorder: Any = None
    _facts: Dict[str, Any] = field(default_factory=dict)

    def facts(self) -> Dict[str, Any]:
        return dict(self._facts)


def test_each_operation_reaches_its_hook_in_order() -> None:
    seen = Seen()
    platform = _platform(("seeing", seen, "seeing"))
    assert [getattr(h, "name", "") for h in hooks(platform)] == ["", "audit", "otel"]
    for event in HOOK_EVENTS:
        asyncio.run(fire(event, Fake(recorder=None), {"n": 1}, platform))
    assert [e for e, _, _ in seen.events] == list(HOOK_EVENTS)
    with pytest.raises(ValueError, match="There is no session operation 'rename'"):
        asyncio.run(fire("rename", Fake(), {}, platform))


def test_a_refusing_hook_stops_the_operation_with_its_sentence_on_the_route(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    platform = _platform(("iam-sharing", Refusing(), "iam-sharing"))
    monkeypatch.setattr(runtime_plugins, "PLATFORM", platform)
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": "session-h002",
            },
        )
    )
    refused = remote.post("/api/v1/apps/sessions/session-h002/end", headers=as_("ada"))
    assert (refused.status_code, refused.json()["detail"]) == (
        403,
        "Session session-h002 is shared with two people: only its owner ends it.",
    )
    assert (
        remote.get("/api/v1/apps/sessions/session-h002", headers=as_("ada")).json()[
            "state"
        ]
        == "open"
    )


def test_a_failing_hook_stops_the_operation_naming_it() -> None:
    platform = _platform(("broken", Failing(), "broken"))
    with pytest.raises(
        HookFailed,
        match="The hook broken refused on_export by failing: RuntimeError: the audit store is down",
    ):
        asyncio.run(fire("export", Fake(), {}, platform))


def test_the_audit_hook_writes_the_rows_and_the_otel_hook_a_span_each(
    runtime: Runtime,  # noqa: F811 - the fixture
) -> None:
    from agent_runtimes.loop.apps.loading import load_app

    recorder = AppRecorder(app=load_app(ASSISTANT), app_uid="app-1", send=runtime.send)
    recorder.opened("session-h003", "ada")
    session = Fake(
        uid="session-h003", recorder=recorder, _facts={"agent": "a", "harness": None}
    )
    audit, otel = AuditHook(), OtelHook(spans=[])
    swap = {
        "from_agent": "a",
        "to_agent": "b",
        "from_harness": "claude-code",
        "to_harness": "codex",
        "at_turn": 4,
        "said": "S",
        "carried": {"turns": 4},
        "dropped": {"allow_always": 1},
    }
    audit.on_swap(session, swap)
    audit.on_clone(session, {"to": "session-h004", "at_turn": 2})
    audit.on_export(
        session, {"by": "ada", "entries": 9, "redactions": 2, "digest": "sha256:0"}
    )
    audit.on_import(
        session,
        {
            "digest": "sha256:1",
            "exported_at": "t",
            "exported_by": "bob",
            "redactions": 0,
            "file_version": 2,
            "current_version": 3,
            "source_uid": "s",
        },
    )
    asyncio.run(recorder.flush("session-h003"))
    rows = {
        e["kind"]: e["payload"]
        for e in runtime.entries("swapped")
        + runtime.entries("cloned")
        + runtime.entries("exported")
        + runtime.entries("imported")
    }
    assert (
        rows["swapped"]["said"] == "S"
        and rows["swapped"]["agent"] == "b"
        and rows["swapped"]["at_turn"] == 4
    )
    assert rows["cloned"] == {"to": "session-h004", "at_turn": 2}
    assert (
        rows["exported"]["digest"] == "sha256:0"
        and rows["imported"]["file_version"] == 2
    )
    [imported] = runtime.entries("imported")
    assert "the file is version 2 of the application, this is 3" in imported["summary"]
    for event in HOOK_EVENTS:
        asyncio.run(
            fire(
                event,
                session,
                {"at_turn": 1, "carried": {"x": 1}},
                _platform(("otel-test", otel, "otel-test")),
            )
        )
    assert [s["name"] for s in otel.spans] == [f"session.{e}" for e in HOOK_EVENTS]
    assert (
        otel.spans[0]["session"] == "session-h003"
        and otel.spans[0]["session.at_turn"] == 1
        and otel.spans[0]["session.carried"] == '{"x": 1}'
    )
