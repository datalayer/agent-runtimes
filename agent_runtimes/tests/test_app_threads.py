# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Threads (LOOP P-24): what an application's code names its conversation —
``session.title``, ``session.tags``, ``session.metadata`` — kept as a
``thread`` entry of its record; ``@app.feedback`` hearing a person's word on
an answer; and a person's threads and a thread's feedback read from
ai-agents, as `loop apps threads` and `loop apps feedback` print them.
"""

from typing import Any, Dict, List

import httpx
import pytest
from typer.testing import CliRunner

from agent_runtimes.loop.apps import AppHost, Application, Feedback, Session
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.session import MemoryChannel
from agent_runtimes.loop.apps.threads import (
    RECORDS_PATH,
    THREADS_PATH,
    ThreadsRefused,
    feedback_line,
    list_threads,
    thread_feedback,
    thread_line,
)


def _host(application: Application) -> tuple[AppHost, List[Dict[str, Any]]]:
    sent: List[Dict[str, Any]] = []

    async def send(body: Dict[str, Any]) -> None:
        sent.append(body)

    recorder = AppRecorder(app=application.spec, app_uid="app-1", send=send)
    return AppHost(application, MemoryChannel(), recorder=recorder), sent


def _threads(sent: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        entry for body in sent for entry in body["entries"] if entry["kind"] == "thread"
    ]


async def test_its_code_names_tags_and_describes_its_conversation() -> None:
    application = Application(id="desk", agent="example-simple")

    @application.start
    async def opened(session: Session) -> None:
        session.title = "  Billing   question "
        session.tags = ["billing", "billing", "eu"]
        session.metadata["plan"] = "pro"
        session.metadata.update(seats=12)

    host, sent = _host(application)
    session = await host.open(id="s-1")
    await host.recorder.settled("s-1")
    assert (session.title, session.tags, dict(session.metadata)) == (
        "Billing question",
        ("billing", "eu"),
        {"plan": "pro", "seats": 12},
    )
    named = _threads(sent)
    # One entry per change; the latest stands.
    assert len(named) == 4
    assert named[-1] == {
        "kind": "thread",
        "summary": "Billing question",
        "payload": {
            "title": "Billing question",
            "tags": ["billing", "eu"],
            "metadata": {"plan": "pro", "seats": 12},
        },
    }
    assert all(body["session_uid"] == "s-1" for body in sent)


async def test_what_a_conversation_is_called_is_refused_beyond_its_limits() -> None:
    application = Application(id="desk", agent="example-simple")
    host, sent = _host(application)
    session = await host.open(id="s-2")
    with pytest.raises(ValueError, match="at most 200 characters"):
        session.title = "x" * 201
    with pytest.raises(ValueError, match="at most 20 tags"):
        session.tags = [f"t{n}" for n in range(21)]
    with pytest.raises(ValueError, match="at most 40 characters"):
        session.tags = ["x" * 41]
    session.metadata["note"] = "kept"
    with pytest.raises(ValueError, match="at most 10000 characters"):
        session.metadata["blob"] = "x" * 10_001
    # What was refused is not kept: what was there stays.
    assert dict(session.metadata) == {"note": "kept"}
    session.metadata = {"ticket": 7}
    assert dict(session.metadata) == {"ticket": 7}
    await host.recorder.settled("s-2")
    assert [entry["payload"]["metadata"] for entry in _threads(sent)] == [
        {"note": "kept"},
        {"ticket": 7},
    ]


async def test_feedback_reaches_its_code() -> None:
    application = Application(id="desk", agent="example-simple")
    heard: List[Feedback] = []

    @application.feedback
    def said(session: Session, feedback: Feedback) -> None:
        heard.append(feedback)

    host, _ = _host(application)
    session = await host.open(id="s-3")
    word = Feedback(liked=True, comment="Clear.", message="answer-1", by="ada")
    assert await host.feedback(session, word) is True
    assert heard == [word]
    assert application.handler("feedback") is said
    # Without one, nothing runs.
    plain, _ = _host(Application(id="plain", agent="example-simple"))
    assert await plain.feedback(await plain.open(id="s-4"), word) is False


# --- read from ai-agents ------------------------------------------------------------


THREADS = {
    "threads": [
        {
            "session_uid": "s-2",
            "app_uid": "app-1",
            "title": "",
            "first_asked": "Prices for north",
            "turns": 1,
            "tags": [],
            "metadata": {},
        },
        {
            "session_uid": "s-1",
            "app_uid": "app-1",
            "title": "Export help",
            "first_asked": "How do I export?",
            "turns": 2,
            "tags": ["csv"],
            "metadata": {"ticket": 42},
        },
    ]
}

FEEDBACK = {
    "entries": [
        {
            "kind": "feedback",
            "created_at": "2026-10-07T10:00:00Z",
            "payload": {"liked": True, "by": "ada"},
        },
        {
            "kind": "feedback",
            "created_at": "2026-10-07T10:01:00Z",
            "payload": {
                "liked": False,
                "comment": "Too long.",
                "message": "answer-2",
                "by": "bob",
            },
        },
    ]
}


def _ai_agents(asked: List[httpx.Request], status: int = 200) -> httpx.Client:
    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        if status != 200:
            return httpx.Response(status, json={"detail": "Not yours."})
        if request.url.path == THREADS_PATH:
            return httpx.Response(200, json=THREADS)
        if request.url.path == RECORDS_PATH:
            return httpx.Response(200, json=FEEDBACK)
        return httpx.Response(404)

    return httpx.Client(
        base_url="https://ai-agents.test", transport=httpx.MockTransport(answer)
    )


def test_a_persons_threads_and_a_threads_feedback_are_read() -> None:
    asked: List[httpx.Request] = []
    client = _ai_agents(asked)
    threads = list_threads(client, app_uid="app-1", search=" export ", tag="csv")
    assert dict(asked[0].url.params) == {
        "limit": "50",
        "app_uid": "app-1",
        "q": "export",
        "tag": "csv",
    }
    assert [thread_line(thread) for thread in threads] == [
        "Prices for north — 1 turn (s-2)",
        "Export help — 2 turns [csv] (s-1)",
    ]
    assert threads[1].metadata == {"ticket": 42}
    said = thread_feedback(client, "s-1")
    assert dict(asked[1].url.params) == {
        "session_uid": "s-1",
        "kind": "feedback",
        "limit": "1000",
    }
    assert [feedback_line(each) for each in said] == [
        "👍 by ada",
        "👎 on answer-2 by bob: Too long.",
    ]
    with pytest.raises(ThreadsRefused, match=r"\(403\): Not yours."):
        thread_feedback(_ai_agents([], status=403), "s-1")


def test_loop_apps_threads_and_feedback_print_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.commands import apps as commands

    asked: List[httpx.Request] = []
    monkeypatch.setattr(commands, "_ai_agents", lambda: _ai_agents(asked))
    runner = CliRunner()
    listed = runner.invoke(commands.app, ["threads", "app-1", "--tag", "csv"])
    assert listed.exit_code == 0, listed.output
    assert "Export help — 2 turns [csv] (s-1)" in listed.output
    feedback = runner.invoke(commands.app, ["feedback", "s-1"])
    assert feedback.exit_code == 0, feedback.output
    assert "👎 on answer-2 by bob: Too long." in feedback.output
    monkeypatch.setattr(commands, "_ai_agents", lambda: _ai_agents([], status=403))
    refused = runner.invoke(commands.app, ["feedback", "s-1"])
    assert refused.exit_code == 1 and "Not yours." in refused.output
