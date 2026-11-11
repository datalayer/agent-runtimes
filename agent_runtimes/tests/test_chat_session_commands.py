# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The prompt's conversation is a session of its agent: `/sessions`, `/pause`
and `/resume <uid>` on an agent run as such, against a runtime in process.

The prompt sends its turns to its agent's AG-UI endpoint whose threads are
sessions; `/pause` pauses this one, says what its memory was given and how
to resume it, and ends the prompt (on Datalayer, its runtime is given back
without asking); `/resume <uid>` in a new prompt rebuilds it from its record
on the prompt's agent and loads its conversation, so the next message goes
on with it; `loop sessions pause <uid>` pauses one from the shell.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, Dict, Iterator, List

import httpx
import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from agent_runtimes.apps import sessions
from agent_runtimes.chat.commands import _BUILTIN_GROUPS, pause, resume
from agent_runtimes.chat.commands import sessions as sessions_command
from agent_runtimes.commands import sessions as command
from agent_runtimes.loop import launch
from agent_runtimes.loop.session import (
    LoopSession,
    is_session_agui_url,
    session_agui_url,
)
from agent_runtimes.memory.registry import register_memory_backend
from agent_runtimes.tests.test_agent_sessions import (  # noqa: F401 - fixtures
    AGENT,
    SESSIONS,
    SPEC,
    Memory,
    marketer,
)
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    Said,
    answer_of,
    as_,
    events_of,
    remote,
    runtime,
)

runner = CliRunner()


class Console:
    def __init__(self) -> None:
        self.lines: List[str] = []

    def print(self, text: Any = "", **kwargs: Any) -> None:
        self.lines.append(str(text))


def _prompt(cloud_runtime: str = "") -> Any:
    """A prompt of the agent, as `loop` makes it: its turns sent to the session path."""
    agent_url = session_agui_url("http://runtime", AGENT)
    return SimpleNamespace(
        console=Console(),
        server_url="http://runtime",
        agent_url=agent_url,
        agent_id=AGENT,
        cloud_runtime=cloud_runtime or None,
        running=True,
        _agui_client=None,
        session=LoopSession(server_url="http://runtime", agent_id=AGENT, token="ada"),
    )


@pytest.fixture()
def wired(
    marketer: Said,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    """The commands' HTTP calls reach the runtime in process."""

    def request(
        method: str, url: str, headers: Any = None, timeout: Any = None, **kwargs: Any
    ) -> Any:
        return remote.request(
            method, url.replace("http://runtime", ""), headers=headers, **kwargs
        )

    monkeypatch.setattr(httpx, "request", request)
    # No key of the person's in the test's environment: the prompt signs as
    # the fixture says, and its sessions are in files, not on the platform.
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    yield remote


def _run(command_module: Any, tux: Any, argv: str = "") -> List[str]:
    tux.console.lines.clear()
    asyncio.run(command_module.execute(tux, argv))
    return list(tux.console.lines)


def _say(client: TestClient, tux: Any, text: str) -> str:
    """A message as the prompt sends it: the conversation so far, and this one."""
    from agent_runtimes.transports.clients import AGUIClient

    if tux._agui_client is None:
        tux._agui_client = AGUIClient(tux.agent_url)
    conversation = tux._agui_client.conversation
    tux.session.session_uid = conversation.thread_id
    conversation.add_user_message(text)
    messages: List[Dict[str, Any]] = [
        {"id": m.id, "role": m.role, "content": m.content}
        for m in conversation.messages
    ]
    answer = answer_of(
        events_of(
            client.post(
                tux.agent_url.replace("http://runtime", ""),
                headers=as_("ada"),
                json={
                    "threadId": conversation.thread_id,
                    "runId": f"run-{len(messages)}",
                    "messages": messages,
                    "tools": [],
                    "context": [],
                    "state": None,
                    "forwardedProps": None,
                },
            )
        )
    )
    conversation.add_assistant_message(answer)
    return answer


def test_the_prompt_sends_its_turns_to_its_agents_sessions() -> None:
    url = session_agui_url("http://127.0.0.1:8123/", "default")
    assert url == "http://127.0.0.1:8123/api/v1/apps/agents/default/ag-ui/"
    assert is_session_agui_url(url)
    assert not is_session_agui_url("http://127.0.0.1:8123/api/v1/ag-ui/default/")
    session = LoopSession(server_url="http://127.0.0.1:8123", agent_id="default")
    assert session.session_agui_url == url


def test_pause_is_one_of_the_prompts_commands() -> None:
    groups = dict(_BUILTIN_GROUPS)
    # List, pause, resume: together, under one heading of /help.
    assert groups["Sessions"][:3] == ("sessions", "pause", "resume")
    assert "pause" not in groups["Session"]
    assert pause.NAME == "pause" and pause.GROUP == "Sessions"
    assert resume.GROUP == "Sessions" and sessions_command.GROUP == "Sessions"
    assert "Pause" in pause.DESCRIPTION


def test_pause_with_no_message_yet_says_so(wired: TestClient) -> None:
    tux = _prompt()
    [said] = _run(pause, tux)
    assert said.startswith("Nothing to pause: this conversation has no message yet.")
    assert tux.running is True


def test_sessions_pause_a_new_prompt_and_resume_go_on_with_the_conversation(
    wired: TestClient,
    marketer: Said,  # noqa: F811 - the fixture
) -> None:
    memory = Memory()
    register_memory_backend(AGENT, memory)  # type: ignore[arg-type]
    tux = _prompt()
    first = _say(wired, tux, "My name is Ada.")
    second = _say(wired, tux, "And I sell tea.")
    uid = tux.session.session_uid

    managed, line = _run(sessions_command, tux)
    assert managed.startswith(
        "On this machine: a session is a folder of ~/.datalayer/sessions"
    )
    assert line.startswith(
        f" 1  {uid}  open    agent  {SPEC}  2 turns  on runtime local"
    )

    said = _run(pause, tux)
    assert said == [
        f"Paused {uid} ({SPEC}, 2 turns): it is kept in the record.",
        "Its memory was given 4 messages of the conversation.",
        f"Resume it: `loop` lists it as it starts; or `loop -a {SPEC}`, then `/resume {uid}`.",
    ]
    # The prompt ends; nothing is given back on this machine.
    assert tux.running is False and tux._agui_client is None
    assert launch._GIVEN_BACK == set()
    assert [m["content"] for m in memory.given[0]] == [
        "My name is Ada.",
        first,
        "And I sell tea.",
        second,
    ]

    # A new process: a new prompt of the agent, a runtime that holds nothing.
    sessions._SESSIONS.clear()
    again = _prompt()
    _, listed = _run(sessions_command, again)
    assert listed.startswith(f" 1  {uid}  paused  agent  {SPEC}  2 turns")
    # By its number in the list, as well as by its id.
    [no_such] = _run(resume, again, "7")
    assert no_such.startswith("There is no session 7 in the last /sessions")
    [resumed] = _run(resume, again, "1")
    assert resumed == (
        f"Resumed {uid} ({SPEC}): 2 turns replayed. "
        "Your next message goes on with it; /pause, /swap, /clone and /export act on it."
    )
    conversation = again._agui_client.conversation
    assert conversation.thread_id == uid and again.session.session_uid == uid
    assert [(m.role, m.content) for m in conversation.messages] == [
        ("user", "My name is Ada."),
        ("assistant", first),
        ("user", "And I sell tea."),
        ("assistant", second),
    ]
    # The third turn is the session's, with what was said before.
    third = _say(wired, again, "What do I sell?")
    assert third.startswith("Heard 3: What do I sell?")
    described = wired.get(f"{SESSIONS}/{uid}", headers=as_("ada")).json()
    assert (described["state"], described["turns"]) == ("open", 3)
    asyncio.run(again._agui_client.disconnect())


def test_a_session_of_another_agent_is_refused_in_a_sentence(
    wired: TestClient,
) -> None:
    tux = _prompt()
    [said] = _run(resume, tux, "session-nobody-knows")
    assert "session-nobody-knows" in said and tux._agui_client is None


def test_on_datalayer_pause_gives_the_runtime_back_without_asking(
    wired: TestClient,
) -> None:
    from agent_runtimes.tests.test_loop_launch import FakeClient, _launched

    tux = _prompt(cloud_runtime="runtime-1")
    _say(wired, tux, "One")
    uid = tux.session.session_uid
    said = _run(pause, tux)
    assert said[-2] == (
        f"Resume it: `loop` lists it as it starts; or `loop --cloud -a {SPEC}`, then `/resume {uid}`."
    )
    # Kept in the platform's record: where it is on the web.
    assert (
        said[-1] == "On the web: https://datalayer.ai/sessions, under Paused sessions."
    )
    assert launch._GIVEN_BACK == {"runtime-1"}

    client = FakeClient()
    told: List[str] = []

    def never(question: str, default: bool) -> bool:
        raise AssertionError("A runtime given back is not asked about.")

    launch.finish_cloud(
        _launched(client), keep=True, can_ask=True, ask=never, say=told.append
    )
    assert client.stopped == ["runtime-1"]
    assert told == ["Cloud agent runtime runtime-1 given back: its session is paused."]
    assert launch._GIVEN_BACK == set()


def test_loop_sessions_pause(wired: TestClient, marketer: Said) -> None:  # noqa: F811
    register_memory_backend(AGENT, Memory())  # type: ignore[arg-type]
    tux = _prompt()
    _say(wired, tux, "One")
    uid = tux.session.session_uid

    class Signed:
        def request(self, method: str, path: str, **kwargs: Any) -> Any:
            return wired.request(method, path, headers=as_("ada"), **kwargs)

    command.use_client(lambda server, cloud: Signed())
    try:
        listed = runner.invoke(command.app, ["list"])
        assert f"{uid}  open    agent  {SPEC}  1 turn" in listed.output
        paused = runner.invoke(command.app, ["pause", uid])
        assert paused.exit_code == 0, paused.output
        assert paused.output.splitlines() == [
            f"Paused {uid} ({SPEC}, 1 turn).",
            "Its memory was given 2 messages of the conversation.",
            f"Resume it: loop sessions resume {uid}",
        ]
        again = runner.invoke(command.app, ["pause", uid])
        assert again.exit_code == 1 and "is paused already" in again.output
    finally:
        command.use_client(None)


def test_an_older_runtime_is_talked_to_as_before_and_said() -> None:
    """Found on r1, 11 November 2026: the pool ran 1.5.128, and the prompt's
    first turn answered 404 *The agent default runs no application*. A
    runtime says whether it keeps agent sessions; its version is no proof (a
    checkout says a stale one).
    """
    from agent_runtimes.loop.session import LoopRefused, conversation_url

    class Answer:
        def __init__(self, status: int, body: Dict[str, Any]) -> None:
            self.status_code, self.body = status, body

        def json(self) -> Dict[str, Any]:
            return self.body

    def says(status: int, body: Dict[str, Any]) -> Any:
        return lambda url, timeout: Answer(status, body)

    url, said = conversation_url(
        "http://runtime/",
        "default",
        get=says(200, {"version": "1.5.120", "agent_sessions": True}),
    )
    assert (url, said) == ("http://runtime/api/v1/apps/agents/default/ag-ui/", "")
    url, said = conversation_url(
        "http://runtime", "default", get=says(200, {"version": "1.5.128"})
    )
    assert url == "http://runtime/api/v1/ag-ui/default/"
    assert said == (
        "This runtime (agent-runtimes 1.5.128) keeps no session of an agent: the "
        "conversation goes on as before, and is not listed, paused or resumed."
    )
    # Nothing is guessed of a runtime that does not answer.
    with pytest.raises(LoopRefused, match="did not say what it runs"):
        conversation_url("http://runtime", "default", get=says(503, {}))


def test_this_runtime_says_it_keeps_agent_sessions(wired: TestClient) -> None:
    said = wired.get("/api/v1/runtime/status").json()
    assert said["agent_sessions"] is True and said["version"]


def test_sessions_with_a_number_or_a_uid_switches_the_prompt(
    wired: TestClient,
    marketer: Said,  # noqa: F811 - the fixture
) -> None:
    tux = _prompt()
    _say(wired, tux, "My name is Ada.")
    first_uid = tux.session.session_uid
    _run(pause, tux)

    # A new prompt of the agent, on a session of its own.
    sessions._SESSIONS.clear()
    again = _prompt()
    _say(wired, again, "Another conversation.")
    other = again.session.session_uid
    assert other != first_uid
    listed = _run(sessions_command, again)
    number = next(
        line.split()[0] for line in listed if f"  {first_uid}  " in f"  {line}"
    )
    # `/sessions <n>`: the prompt goes on with that session, and says which
    # it is on; the one it was on is left as it is.
    said = _run(sessions_command, again, number)
    assert said[0].startswith(f"Resumed {first_uid} ({SPEC}): 1 turn replayed.")
    assert said[-1] == (
        f"This prompt is on session {first_uid} now; {other} is left as it is: "
        f"`/sessions {other}` comes back to it."
    )
    assert again.session.session_uid == first_uid
    left = wired.get(f"{SESSIONS}/{other}", headers=as_("ada")).json()
    assert left["state"] == "open"
    # By its uid as well; `--app` still lists one application's.
    assert _run(sessions_command, again, "--app no-such-app") == [
        "No session of no-such-app yet."
    ]
    asyncio.run(again._agui_client.disconnect())


def test_transfer_pauses_moves_and_goes_on_where_it_was_sent(
    wired: TestClient,
    marketer: Said,  # noqa: F811 - the fixture
) -> None:
    from agent_runtimes.chat.commands import transfer as transfer_command
    from agent_runtimes.loop.transfer import Transferred

    assert "transfer" in dict(_BUILTIN_GROUPS)["Sessions"]
    tux = _prompt()
    _say(wired, tux, "My name is Ada.")
    uid = tux.session.session_uid
    moved: List[Any] = []
    went: List[List[str]] = []
    asked: List[str] = []

    async def mover(session_uid: str, *, source: Any, destination: Any) -> Any:
        # Paused before it moves: nothing runs while it is carried.
        state = wired.get(f"{SESSIONS}/{session_uid}", headers=as_("ada")).json()
        moved.append((session_uid, source.where, destination.where, state["state"]))
        return Transferred(
            session_uid, destination.where, SPEC, "agent", 1, 3, 0, False
        )

    def run(argv: str, **more: Any) -> List[str]:
        tux.console.lines.clear()
        asyncio.run(
            transfer_command.execute(
                tux, argv, mover=mover, token="the-token", go_on=went.append, **more
            )
        )
        return list(tux.console.lines)

    # Not the place it is in.
    assert run("local") == [
        "This session is on this machine: it is transferred to Datalayer (`/transfer cloud`)."
    ]
    # Asked first, naming what is sent; declined, nothing is paused or sent.
    assert run("", confirm=lambda question: asked.append(question) or False) == [
        "Not transferred: nothing was sent."
    ]
    assert f"Transfer this session ({uid}) to Datalayer?" in asked[0] and moved == []
    said = run("--yes")
    assert moved == [(uid, "local", "cloud", "paused")]
    assert said[-2:] == [
        f"Transferred {uid} to Datalayer: 1 turn, 3 entries. It lives on Datalayer now, "
        "under the same uid, and is ended where it was.",
        f"Going on with it on Datalayer: `loop --resume {uid}`.",
    ]
    # The prompt ends, and `loop --resume <uid>` goes on with it there.
    assert tux.running is False and went == [["--resume", uid]]
    # Signed out, it says so.
    tux.running = True
    asyncio.run(transfer_command.execute(tux, "--yes", token=""))
    assert "You are not signed in" in tux.console.lines[-1]
