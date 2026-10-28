# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
What the person said, kept as sound, on the runtime's side (VO-63).

A spoken message the page sends with its sound (``forwardedProps.voice.sound``,
when the application's record keeps ``audio`` and the person agreed) has the
sound taken out of the run before anything reads it — never given to a model,
never in the record's entries — and sent to ai-agents to keep, which puts it
in its object store and points the record at it. Not kept for an application
whose record does not keep ``audio``, a test, or a conversation nobody known
opened. ai-agents is a stand-in recording what it was sent.
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps.record import agent_recorder
from agent_runtimes.routes.apps import _said_sound
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

pytest.importorskip("agentspecs.apps")

SOUND = b"RIFF" + b"\x01" * 3000

LISTENER: Dict[str, Any] = {
    **ASSISTANT,
    "interface": {
        **ASSISTANT["interface"],
        "voice": {"enabled": True, "input": "push_to_talk", "language": "en-US"},
    },
    "record": {"keep_for": "30_days", "include": ["conversations", "audio"]},
}


def _run(thread: str, sound: Any) -> Dict[str, Any]:
    return {
        "threadId": thread,
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "What is the weather?"}],
        "tools": [],
        "context": [],
        "forwardedProps": {
            "voice": {
                "input": "voice",
                "language": "en-US",
                "engine": "moonshine-tiny-en",
                "where": "device",
                "sound": sound,
            }
        },
    }


def _keeping(agent: str) -> List[Dict[str, Any]]:
    sent: List[Dict[str, Any]] = []

    async def keep(sound: bytes, *, content_type: str, params: Dict[str, Any]) -> None:
        sent.append({"sound": sound, "content_type": content_type, **params})

    recorder = agent_recorder(agent)
    assert recorder is not None
    recorder.keep_sound = keep
    return sent


def _waited(sent: List[Dict[str, Any]], count: int = 1) -> None:
    deadline = time.monotonic() + 3
    while len(sent) < count and time.monotonic() < deadline:
        time.sleep(0.05)


def _sound(data: bytes = SOUND, kind: str = "audio/wav") -> Dict[str, Any]:
    return {"data": base64.b64encode(data).decode(), "type": kind, "seconds": 2.5}


def test_a_spoken_message_s_sound_is_kept_and_never_reaches_the_model_or_the_entries(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    model = runtime.make("listener", LISTENER, {"app_uid": "app-1", "version": 2})
    sent = _keeping("listener")
    answered = events_of(
        remote.post(
            "/api/v1/apps/agents/listener/ag-ui/",
            headers=as_("bob"),
            json=_run("thread-k-001", _sound()),
        )
    )
    assert any(e["type"] == "RUN_FINISHED" for e in answered)
    _waited(sent)
    [kept] = sent
    assert kept["sound"] == SOUND
    assert kept["content_type"] == "audio/wav"
    assert {
        k: kept[k]
        for k in ("app_uid", "session_uid", "opened_by", "seconds", "language")
    } == {
        "app_uid": "app-1",
        "session_uid": "thread-k-001",
        "opened_by": "bob",
        "seconds": 2.5,
        "language": "en-US",
    }
    assert kept["keep_days"] == 30
    # The model heard the words, not the sound; the record holds no sound.
    assert model.prompts[-1].startswith("What is the weather?")
    written = json.dumps(runtime.records)
    assert base64.b64encode(SOUND).decode()[:40] not in written
    assert "RIFF" not in written


def test_not_kept_for_an_application_whose_record_does_not_keep_audio(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    sent = _keeping("notes-assistant")
    events_of(
        remote.post(
            "/api/v1/apps/agents/notes-assistant/ag-ui/",
            headers=as_("bob"),
            json=_run("thread-k-002", _sound()),
        )
    )
    _waited(sent)
    assert sent == []


@pytest.mark.parametrize(
    "sound",
    [
        {"data": "not base64!", "type": "audio/wav"},
        {"data": base64.b64encode(SOUND).decode(), "type": "text/plain"},
        "a string",
        None,
    ],
)
def test_what_is_not_a_turn_s_sound_is_taken_out_and_not_kept(sound: Any) -> None:
    forwarded = _run("t", sound)["forwardedProps"]
    assert _said_sound(forwarded) is None
    assert "sound" not in forwarded["voice"]


def test_a_sound_past_a_minute_is_not_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.routes import apps as routes

    monkeypatch.setattr(routes, "SAID_SOUND_BASE64", 100)
    assert _said_sound(_run("t", _sound())["forwardedProps"]) is None


@pytest.mark.asyncio
async def test_the_recorder_keeps_only_for_a_person_and_never_for_a_test() -> None:
    from agent_runtimes.apps.loading import load_app
    from agent_runtimes.apps.record import AppRecorder

    app = load_app(LISTENER)
    sent: List[Dict[str, Any]] = []

    async def keep(sound: bytes, *, content_type: str, params: Dict[str, Any]) -> None:
        sent.append(params)

    recorder = AppRecorder(app=app, app_uid="app-1", keep_sound=keep)
    assert "signed in" in await recorder.keep_said(
        "s-1", SOUND, content_type="audio/wav"
    )
    recorder.opened("s-1", "bob")
    assert await recorder.keep_said("s-1", SOUND, content_type="audio/wav") == ""
    tested = AppRecorder(app=app, app_uid="app-1", purpose="test", keep_sound=keep)
    tested.opened("s-2", "bob")
    assert "does not keep" in await tested.keep_said(
        "s-2", SOUND, content_type="audio/wav"
    )
    assert [p["session_uid"] for p in sent] == ["s-1"]
