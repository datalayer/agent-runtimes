# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session API (LOOP R-04): an application's sessions over the wire.

The real routes, in process, on an agent registered as the platform makes an
application's — its Appspec and instance kept with it, its AG-UI app, its
rules, checks and record — on a model that says what it was given. Start,
message, action, settings change, stop and resume, each streamed as AG-UI
events; files given put in the sandbox, or refused in a sentence; a Python
application's code reacting, and asking for a file the page gives.
"""

import base64
import json
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterator, List, Tuple

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from reactor import ContributionRegistry

from agent_runtimes.loop.apps import opening, plugins, principal, sessions
from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.callers import Caller, CallerRefused
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.record import AppRecorder, keep_agent_recorder
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes
from agent_runtimes.routes.agui import register_agui_agent, unregister_agui_agent

CATALOGUE = Path(pytest.importorskip("agentspecs.apps").__file__).parent

ASSISTANT: Dict[str, Any] = {
    "schema": "loop.app/v1",
    "id": "notes-assistant",
    "name": "Notes Assistant",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "interface": {
        "settings": {
            "type": "object",
            "properties": {
                "tone": {
                    "type": "string",
                    "title": "Tone",
                    "enum": ["Plain", "Warm"],
                    "default": "Plain",
                }
            },
        },
        # What a person may send without being asked (LOOP P-21).
        "uploads": {
            "kinds": [
                {"type": ".csv", "max_mb": 1},
                {"type": "image/*", "max_mb": 1},
                {"type": "application/zip"},
            ],
            "max_files": 2,
        },
    },
    "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
}

ANALYST = {
    **ASSISTANT,
    "id": "file-analyst",
    "name": "File Analyst",
    "kind": "widget",
    "interface": {
        **ASSISTANT["interface"],
        "uploads": {"kinds": [{"type": "application/pdf"}]},
    },
    "permissions": {"computer": {"shell": True}},
}


class Said:
    """A model that answers what it was last told, and keeps every prompt."""

    def __init__(self) -> None:
        self.prompts: List[str] = []

    def said(self, messages: List[ModelMessage]) -> str:
        last = [
            part.content
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, UserPromptPart) and isinstance(part.content, str)
        ]
        self.prompts.append(last[-1] if last else "")
        return f"Heard {len(last)}: {self.prompts[-1][:40]}"

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(self.said(messages))])

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        text = self.said(messages)
        yield text[:5]
        yield text[5:]


def events_of(response: Any) -> List[Dict[str, Any]]:
    assert response.status_code == 200, response.text
    found: List[Dict[str, Any]] = []
    for block in response.text.split("\n\n"):
        data = "".join(
            line[len("data:") :].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if data:
            found.append(json.loads(data))
    return found


def answer_of(events: List[Dict[str, Any]]) -> str:
    return "".join(
        str(event.get("delta") or "")
        for event in events
        if event.get("type") == "TEXT_MESSAGE_CONTENT"
    )


def types_of(events: List[Dict[str, Any]]) -> List[str]:
    return [
        str(event["type"]) + (f":{event['name']}" if event["type"] == "CUSTOM" else "")
        for event in events
        if event.get("type") not in ("TEXT_MESSAGE_CONTENT", "usage")
    ]


def data_url(content: bytes, media_type: str) -> str:
    return f"data:{media_type};base64,{base64.b64encode(content).decode()}"


class Runtime:
    """Agents made for applications, as the create route makes them."""

    def __init__(self) -> None:
        self.records: List[Dict[str, Any]] = []
        self.models: Dict[str, Said] = {}

    async def send(self, body: Dict[str, Any]) -> None:
        self.records.append(body)

    def make(
        self, agent_id: str, spec: Dict[str, Any], instance: Dict[str, Any]
    ) -> Said:
        from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
        from agent_runtimes.transports import AGUITransport

        app = load_app(spec)
        plugins.register_app(app)
        recorder = AppRecorder(
            app=app,
            app_uid=str(instance.get("app_uid") or ""),
            deployment_uid=str(instance.get("deployment_uid") or ""),
            version=int(instance.get("version") or 0),
            send=self.send,
        )
        model = Said()
        agent = Agent(
            FunctionModel(model, stream_function=model.stream),
            capabilities=app_capabilities(app, recorder=recorder, agent_id=agent_id),
        )
        register_agui_agent(
            agent_id,
            AGUITransport(
                PydanticAIAdapter(agent, agent_id=agent_id), agent_id=agent_id
            ),
        )
        agents._agentspecs[agent_id] = {"app_spec": spec, "app_instance": instance}
        keep_agent_recorder(agent_id, recorder)
        self.models[agent_id] = model
        return model

    def entries(self, kind: str) -> List[Dict[str, Any]]:
        return [
            {**entry, "app_uid": body["app_uid"], "session_uid": body["session_uid"]}
            for body in self.records
            for entry in body["entries"]
            if entry["kind"] == kind
        ]


class Verifier:
    """Each token is the person it names."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        if token == "expired":
            raise CallerRefused(401, "The token has expired.")
        return Caller(kind="person", uid=token)


@pytest.fixture()
def runtime(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Runtime]:
    # The sandbox an agent runs code in writes where the runtime runs: here.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(plugins, "REGISTRY", ContributionRegistry())
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    # Everybody may open every deployment, unless a test says otherwise (D-02).
    opening.use_opener(_lets_everybody_in)
    made = Runtime()
    yield made
    for agent_id in list(made.models):
        unregister_agui_agent(agent_id)
        agents._agentspecs.pop(agent_id, None)
        keep_agent_recorder(agent_id, None)
    sessions.forget_sessions()
    sessions.use_record_reader(None)
    principal.use_asker(None)
    opening.use_opener(None)


async def _lets_everybody_in(deployment: str, bearer: str) -> Tuple[int, str]:
    return 200, ""


@pytest.fixture()
def local(runtime: Runtime) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    with TestClient(create_app(), client=("127.0.0.1", 50000)) as client:
        yield client


@pytest.fixture()
def remote(runtime: Runtime) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        yield client


def as_(person: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {person}"}


def test_a_preview_session_starts_answers_and_is_recorded_as_the_person(
    runtime: Runtime, remote: TestClient
) -> None:
    model = runtime.make(
        "notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3}
    )
    started = events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "Hello",
                "session": "session-0001",
            },
        )
    )
    assert types_of(started) == [
        "CUSTOM:loop.session",
        "RUN_STARTED",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_END",
        "RUN_FINISHED",
    ]
    said = started[0]["value"]
    assert (said["uid"], said["preview"], said["acts_as"]) == (
        "session-0001",
        True,
        {"kind": "person", "uid": "ada"},
    )
    assert answer_of(started) == "Heard 1: Hello\n\nTone: Plain"
    again = events_of(
        remote.post(
            "/api/v1/apps/sessions/session-0001/messages",
            headers=as_("ada"),
            json={"text": "And then?"},
        )
    )
    # The conversation so far goes with the turn; the settings, in words,
    # with the first message after they were set, and not again.
    assert answer_of(again) == "Heard 2: And then?"
    session = remote.get(
        "/api/v1/apps/sessions/session-0001", headers=as_("ada")
    ).json()
    assert (session["state"], session["turns"], session["app"]["id"]) == (
        "open",
        2,
        "notes-assistant",
    )
    # Its record, under its uid: started, then each turn asked and answered.
    assert runtime.entries("session")[0]["session_uid"] == "session-0001"
    assert [e["payload"]["asked"] for e in runtime.entries("turn")] == [
        "Hello\n\nTone: Plain",
        "And then?",
    ]
    # Who opened it goes with its record: what they export and delete it by (R-31).
    assert {body["opened_by"] for body in runtime.records} == {"ada"}
    # Nobody else drives it, nor learns it exists.
    assert (
        remote.get("/api/v1/apps/sessions/session-0001", headers=as_("bob")).status_code
        == 404
    )
    assert remote.get("/api/v1/apps/sessions/session-0001").status_code == 401
    assert [
        s["uid"]
        for s in remote.get("/api/v1/apps/sessions", headers=as_("bob")).json()[
            "sessions"
        ]
    ] == []
    assert model.prompts == ["Hello\n\nTone: Plain", "And then?"]


def test_a_deployments_session_acts_as_its_principal_and_a_preview_is_not_it(
    runtime: Runtime, remote: TestClient
) -> None:
    asked: List[str] = []

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        asked.append(bearer)
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-7",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-1")
    runtime.make(
        "notes-assistant",
        ASSISTANT,
        {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2},
    )
    refused = remote.post(
        "/api/v1/apps/sessions", headers=as_("ada"), json={"agent": "notes-assistant"}
    )
    assert refused.status_code == 409
    assert "a Preview runs on an agent of its own" in refused.json()["detail"]
    other = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("ada"),
        json={"agent": "notes-assistant", "deployment_uid": "dep-2"},
    )
    assert (
        other.json()["detail"]
        == "The agent notes-assistant runs Notes Assistant as deployment dep-1, not dep-2."
    )
    started = events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={"agent": "notes-assistant", "deployment_uid": "dep-1"},
        )
    )
    said = started[0]["value"]
    assert said["acts_as"] == {
        "kind": "principal",
        "uid": "principal-7",
        "deployment_uid": "dep-1",
    }
    assert said["preview"] is False
    assert asked == ["ada"]
    # Run as its principal, it still says the person who opened it (R-31).
    assert {
        body["opened_by"]
        for body in runtime.records
        if body["session_uid"] == said["uid"]
    } == {"ada"}
    principal.forget_principal_token("dep-1")


def test_a_deployments_session_is_held_only_by_whom_its_level_lets_in(
    runtime: Runtime, remote: TestClient
) -> None:
    """D-02: the runtime asks ai-agents, with each caller's token, whether they
    may open the deployment — the principal's token it holds is no reason to
    let anybody else in — and refuses in ai-agents' sentence."""
    asked: List[Tuple[str, str]] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        asked.append((deployment, bearer))
        if bearer == "bob":
            return 200, ""
        return (
            403,
            "Only the people its owner invited may open it, and you are not one of them.",
        )

    async def token(deployment: str, bearer: str) -> Dict[str, Any]:
        return {"access_token": "p-token", "expires_in": 3600, "principal_uid": "p-7"}

    opening.use_opener(opens)
    principal.use_asker(token)
    principal.forget_principal_token("dep-1")
    runtime.make(
        "notes-assistant",
        ASSISTANT,
        {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2},
    )
    start = {
        "agent": "notes-assistant",
        "deployment_uid": "dep-1",
        "session": "session-bob1",
    }
    started = events_of(
        remote.post("/api/v1/apps/sessions", headers=as_("bob"), json=start)
    )
    assert started[0]["value"]["acts_as"]["uid"] == "p-7"
    # The principal's token is held now: carol is refused all the same.
    refused = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("carol"),
        json={**start, "session": "session-carol"},
    )
    assert refused.status_code == 403
    assert refused.json()["detail"].startswith("Only the people its owner invited")
    run = {
        "threadId": "thread-carol",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hi"}],
        "tools": [],
        "context": [],
    }
    assert (
        remote.post(
            "/api/v1/apps/agents/notes-assistant/ag-ui/", headers=as_("carol"), json=run
        ).status_code
        == 403
    )
    # Asked once per caller and deployment, then remembered.
    events_of(
        remote.post(
            "/api/v1/apps/sessions/session-bob1/messages",
            headers=as_("bob"),
            json={"text": "Again"},
        )
    )
    assert asked.count(("dep-1", "bob")) == 1
    principal.forget_principal_token("dep-1")


def test_nobody_signed_out_holds_a_session_of_a_deployment(
    runtime: Runtime, remote: TestClient
) -> None:
    """Whatever the level, a caller with no token holds no session on a
    person's runtime, and ai-agents is not asked: a visitor without an
    account talks to it on the visitors' runtime (R-30)."""
    asked: List[str] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        asked.append(bearer)
        return 200, ""

    opening.use_opener(opens)
    public = {
        **ASSISTANT,
        "deployment": {"hosted": {"visibility": "public", "slug": "notes"}},
    }
    runtime.make(
        "notes-assistant",
        public,
        {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2},
    )
    refused = remote.post(
        "/api/v1/apps/sessions",
        json={"agent": "notes-assistant", "deployment_uid": "dep-1"},
    )
    assert refused.status_code == 401
    assert refused.json()["detail"] == "Who is calling is not said: send a token."
    assert asked == []


def test_the_chat_speaks_to_an_application_over_ag_ui_each_thread_a_session(
    runtime: Runtime, local: TestClient
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    run = {
        "threadId": "thread-0001",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hi there"}],
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {"settings": {"tone": "Warm"}}},
    }
    events = events_of(
        local.post("/api/v1/apps/agents/notes-assistant/ag-ui/", json=run)
    )
    assert types_of(events)[0] == "RUN_STARTED"
    assert answer_of(events) == "Heard 1: Hi there"
    session = local.get("/api/v1/apps/sessions/thread-0001").json()
    assert (session["settings"], session["opened_by"]["kind"]) == (
        {"tone": "Warm"},
        "local",
    )
    # The machine itself is nobody whose conversations these are (R-31).
    assert {body["opened_by"] for body in runtime.records} == {""}
    wrong = local.post(
        "/api/v1/apps/agents/notes-assistant/ag-ui/",
        json={**run, "forwardedProps": {"loop": {"settings": {"tone": "Loud"}}}},
    )
    assert wrong.status_code == 422
    # Checked against the settings' form, the sentence a Form's check says (C-16).
    assert wrong.json()["detail"] == (
        "“Its settings” was sent what its fields refuse: "
        "tone: 'Loud' is not one of ['Plain', 'Warm']."
    )


def test_a_file_of_any_kind_is_put_in_the_sandbox_of_an_application_with_a_shell(
    runtime: Runtime, local: TestClient, tmp_path: Path
) -> None:
    model = runtime.make("file-analyst", ANALYST, {"app_uid": "app-2"})
    pdf = b"%PDF-1.7\x00\x01\x02 binary"
    events = events_of(
        local.post(
            "/api/v1/apps/agents/file-analyst/ag-ui/",
            json={
                "threadId": "thread-0002",
                "runId": "run-1",
                "messages": [
                    {"id": "m1", "role": "user", "content": "Run on report.pdf."}
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {
                    "loop": {
                        "action": {"name": "upload", "payload": {}},
                        "files": [
                            {
                                "name": "../report.pdf",
                                "type": "application/pdf",
                                "size": len(pdf),
                                "data_url": data_url(pdf, "application/pdf"),
                            }
                        ],
                    }
                },
            },
        )
    )
    assert "RUN_ERROR" not in types_of(events)
    placed = tmp_path / "files" / "thread-0002" / "report.pdf"
    assert placed.read_bytes() == pdf
    assert model.prompts[-1] == (
        f"Run on report.pdf.\n\nThe file report.pdf (application/pdf, {len(pdf)} bytes) is in your "
        "sandbox at files/thread-0002/report.pdf: read it in code."
    )
    session = local.get("/api/v1/apps/sessions/thread-0002").json()
    assert session["files"] == [
        {
            "name": "report.pdf",
            "type": "application/pdf",
            "size": len(pdf),
            "path": "files/thread-0002/report.pdf",
        }
    ]


def test_without_a_shell_a_text_file_goes_in_the_message_and_anything_else_is_refused(
    runtime: Runtime, local: TestClient
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    list(
        events_of(
            local.post(
                "/api/v1/apps/sessions",
                json={"agent": "notes-assistant", "session": "session-0003"},
            )
        )
    )
    csv = b"a,b\n1,2\n"
    events = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0003/actions",
            json={
                "name": "upload",
                "text": "Summarise it.",
                "files": [
                    {
                        "name": "t.csv",
                        "type": "text/csv",
                        "data_url": data_url(csv, "text/csv"),
                    }
                ],
            },
        )
    )
    assert "RUN_ERROR" not in types_of(events)
    assert model.prompts[-1].endswith("The file t.csv (text/csv):\n```\na,b\n1,2\n```")
    # A Table's select: what the block gave, said to an agent with no handler.
    chose = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0003/actions",
            json={"name": "select", "payload": {"row": {"region": "north"}}},
        )
    )
    assert "RUN_ERROR" not in types_of(chose)
    assert model.prompts[-1] == 'On the page, select: {"row": {"region": "north"}}'
    assert (
        local.post(
            "/api/v1/apps/sessions/session-0003/actions", json={"name": "submit"}
        ).json()["detail"]
        == "“submit” gave Notes Assistant nothing to run on: no message, no file."
    )
    refused = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0003/actions",
            json={
                "name": "upload",
                "text": "And this?",
                "files": [
                    {
                        "name": "x.zip",
                        "type": "application/zip",
                        "data_url": data_url(b"PK\x00", "application/zip"),
                    }
                ],
            },
        )
    )
    [error] = [e for e in refused if e["type"] == "RUN_ERROR"]
    assert error["message"].startswith(
        "x.zip is not a text file, and the application has no computer"
    )
    assert (
        local.post(
            "/api/v1/apps/sessions/session-0003/actions",
            json={
                "name": "upload",
                "files": [{"name": "x", "data_url": "not a data url"}],
            },
        ).json()["detail"]
        == "x could not be read: it is not a data URL."
    )


def test_settings_change_stop_and_resume(runtime: Runtime, local: TestClient) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    events_of(
        local.post(
            "/api/v1/apps/sessions",
            json={
                "agent": "notes-assistant",
                "session": "session-0004",
                "opener": "One",
            },
        )
    )
    assert (
        local.put(
            "/api/v1/apps/sessions/session-0004/settings",
            json={"values": {"tone": "Loud"}},
        ).status_code
        == 422
    )
    assert (
        local.put(
            "/api/v1/apps/sessions/session-0004/settings", json={"values": {"nope": 1}}
        ).json()["detail"]
        == "There is no field nope."
    )
    events_of(
        local.put(
            "/api/v1/apps/sessions/session-0004/settings",
            json={"values": {"tone": "Warm"}},
        )
    )
    assert local.get("/api/v1/apps/sessions/session-0004").json()["settings"] == {
        "tone": "Warm"
    }
    stopped = local.post("/api/v1/apps/sessions/session-0004/stop").json()
    assert stopped["state"] == "stopped"
    refused = local.post(
        "/api/v1/apps/sessions/session-0004/messages", json={"text": "Two"}
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Session session-0004 is stopped: resume it before going on.",
    )
    resumed = events_of(
        local.post("/api/v1/apps/sessions/session-0004/resume", json={})
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [m["content"] for m in snapshot["messages"]] == [
        "One\n\nTone: Plain",
        "Heard 1: One\n\nTone: Plain",
    ]
    assert local.get("/api/v1/apps/sessions/session-0004").json()["state"] == "open"
    assert answer_of(
        events_of(
            local.post(
                "/api/v1/apps/sessions/session-0004/messages", json={"text": "Two"}
            )
        )
    ).startswith("Heard 2: Two")


def test_end_and_logout(runtime: Runtime, remote: TestClient) -> None:
    """Ended, a session is no longer held, its record stays; signing out ends
    the caller's sessions, nobody else's (LOOP P-14)."""
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    for person, uid in (
        ("ada", "session-0011"),
        ("ada", "session-0012"),
        ("bob", "session-0013"),
    ):
        events_of(
            remote.post(
                "/api/v1/apps/sessions",
                headers=as_(person),
                json={"agent": "notes-assistant", "session": uid, "opener": "One"},
            )
        )
    # Only who opened it ends it.
    assert (
        remote.post(
            "/api/v1/apps/sessions/session-0011/end", headers=as_("bob")
        ).status_code
        == 404
    )
    ended = remote.post(
        "/api/v1/apps/sessions/session-0011/end", headers=as_("ada")
    ).json()
    assert ended["state"] == "ended"
    assert (
        remote.get("/api/v1/apps/sessions/session-0011", headers=as_("ada")).status_code
        == 404
    )
    out = remote.post("/api/v1/apps/sessions/logout", headers=as_("ada")).json()
    assert out == {"ended": ["session-0012"]}
    held = remote.get("/api/v1/apps/sessions", headers=as_("bob")).json()["sessions"]
    assert [s["uid"] for s in held] == ["session-0013"]
    assert sessions.session_of("session-0012") is None
    # The record of an ended session stays: it began, and was answered.
    assert {r["session_uid"] for r in runtime.records} >= {
        "session-0011",
        "session-0012",
    }


async def test_the_codes_messages_change_and_its_end_runs_on_the_session() -> None:
    """A message changed is written again under its id, its author said, one
    removed said removed; the code's end and logout run (LOOP P-14, P-15)."""
    from agent_runtimes.loop.apps import AppHost, Application, Session
    from agent_runtimes.loop.apps.callers import Caller

    application = Application(id="notes-assistant", agent="example-simple")
    said: List[str] = []

    @application.end
    def closed(session: Session) -> None:
        said.append(f"end {session.id}")

    @application.logout
    def out(session: Session) -> None:
        said.append(f"logout {session.id}")

    app = application.spec

    def live_session(uid: str) -> sessions.LiveSession:
        live = sessions.LiveSession(
            uid=uid,
            agent_id="notes-assistant",
            app=app,
            instance={},
            opened_by=Caller(kind="person", uid="ada"),
            acts_as={"kind": "person", "uid": "ada"},
            recorder=AppRecorder(app=app, send=lambda body: _nothing()),
        )
        sessions._SESSIONS[uid] = live
        live.host = AppHost(application, live, recorder=live.recorder)
        return live

    live = live_session("session-0014")
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    first = await live.session.send("Searching…")
    await live.session.send("Found 3.", author="Searcher")
    await first.update("Searched: 3 results.")
    await first.remove()
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    assert [
        (
            e["type"],
            e.get("messageId") or e.get("value", {}).get("id"),
            e.get("delta") or e.get("value"),
        )
        for e in events
        if e["type"] != "TEXT_MESSAGE_END"
    ] == [
        ("TEXT_MESSAGE_START", first.id, None),
        ("TEXT_MESSAGE_CONTENT", first.id, "Searching…"),
        ("TEXT_MESSAGE_START", events[4]["messageId"], None),
        ("TEXT_MESSAGE_CONTENT", events[4]["messageId"], "Found 3."),
        (
            "CUSTOM",
            events[4]["messageId"],
            {"id": events[4]["messageId"], "author": "Searcher"},
        ),
        ("TEXT_MESSAGE_START", first.id, None),
        ("TEXT_MESSAGE_CONTENT", first.id, "Searched: 3 results."),
        ("CUSTOM", first.id, {"id": first.id, "removed": True}),
    ]
    assert [(m["content"], m.get("name")) for m in live.messages] == [
        ("Found 3.", "Searcher")
    ]
    await live.end()
    assert said == ["end session-0014"]
    assert sessions.session_of("session-0014") is None

    other = live_session("session-0015")
    other.session = await other.host.open(id=other.uid)
    await other.logout()
    assert said[1:] == ["logout session-0015", "end session-0015"]
    assert (other.state, sessions.session_of("session-0015")) == ("ended", None)


async def test_what_an_answer_shows_is_a_surface_under_its_message() -> None:
    """An answer's components arrive as the result of the tool the chat draws
    surfaces for, under the message, and come back with a resume (LOOP P-04)."""
    from agent_runtimes.loop.apps import AppHost, Application
    from agent_runtimes.loop.apps.callers import Caller

    application = Application(id="notes-assistant", agent="example-simple")
    app = application.spec
    # What it shows is on the record with the answer, under `outputs`.
    recorded = app.model_copy(
        update={"record": app.record.model_copy(update={"include": ["outputs"]})}
    )
    bodies: List[Dict[str, Any]] = []

    async def keep(body: Dict[str, Any]) -> None:
        bodies.append(body)

    live = sessions.LiveSession(
        uid="session-0016",
        agent_id="notes-assistant",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=recorded, send=keep),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    session = live.session
    sent = await session.send(
        "Two runs.",
        show=[session.ui.table("runs", columns=["model"], rows={"path": "/runs"})],
        data={"runs": [{"model": "a"}, {"model": "b"}]},
    )
    await session.send("Nothing to show.")
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    kinds = [e["type"] for e in events]
    assert kinds[:7] == [
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "TOOL_CALL_START",
        "TOOL_CALL_ARGS",
        "TOOL_CALL_END",
        "TOOL_CALL_RESULT",
    ]
    assert "TOOL_CALL_START" not in kinds[7:]
    start, result = events[3], events[6]
    assert (start["toolCallName"], start["parentMessageId"]) == (
        sessions.SHOW_TOOL,
        sent.id,
    )
    surface = json.loads(result["content"])
    assert surface["surfaceId"] == f"answer-{sent.id}"
    components = surface["messages"][1]["updateComponents"]["components"]
    assert [c["id"] for c in components] == ["root", "runs"]
    assert surface["messages"][2]["updateDataModel"]["value"] == {
        "runs": [{"model": "a"}, {"model": "b"}]
    }

    snapshot = [
        m.model_dump(by_alias=True, exclude_none=True)
        for m in sessions._snapshot(live.messages)
    ]
    assert [m["role"] for m in snapshot] == ["assistant", "tool", "assistant"]
    assert snapshot[0]["toolCalls"][0]["function"]["name"] == sessions.SHOW_TOOL
    assert json.loads(snapshot[1]["content"]) == surface

    # The record keeps what was shown, by kind, id and words; not the data.
    shown = await session.send(
        "Your export.",
        show=[
            session.ui.download(
                "totals",
                name="totals.csv",
                url="data:text/csv;base64,bW9udGgsdG90YWwKSmFuLDEyMDAK",
                media_type="text/csv",
            )
        ],
    )
    await live.recorder.flush(live.uid)
    outputs = [e for body in bodies for e in body["entries"] if e["kind"] == "output"]
    assert [e["payload"]["message"] for e in outputs] == [sent.id, shown.id]
    assert outputs[0]["payload"]["shows"] == [
        {"id": "runs", "component": "Table", "said": ""}
    ]
    assert outputs[0]["payload"]["data"] == ["runs"]
    assert outputs[1]["summary"] == "Notes assistant showed Download totals.csv"
    assert "base64" not in json.dumps(outputs)


async def test_a_step_is_said_whole_beside_ag_uis_step() -> None:
    """STEP_STARTED and STEP_FINISHED carry a name; loop.step the step (LOOP P-16)."""
    from agent_runtimes.loop.apps import AppHost, Application
    from agent_runtimes.loop.apps.callers import Caller

    application = Application(id="notes-assistant", agent="example-simple")
    app = application.spec
    live = sessions.LiveSession(
        uid="session-0017",
        agent_id="notes-assistant",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=lambda body: _nothing()),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    async with live.session.step("Researching", input="q") as outer:
        async with live.session.step(
            "Searching", kind="tool", input={"q": "x"}
        ) as inner:
            inner.output = object()
        outer.output = {"found": 2}
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    assert [(e["type"], e.get("stepName") or e["value"]["name"]) for e in events] == [
        ("STEP_STARTED", "Researching"),
        ("CUSTOM", "Researching"),
        ("STEP_STARTED", "Searching"),
        ("CUSTOM", "Searching"),
        ("STEP_FINISHED", "Searching"),
        ("CUSTOM", "Searching"),
        ("STEP_FINISHED", "Researching"),
        ("CUSTOM", "Researching"),
    ]
    started, ended = events[3]["value"], events[5]["value"]
    assert events[3]["name"] == sessions.LOOP_STEP
    assert started["parent_id"] == events[1]["value"]["id"]
    assert (started["kind"], started["input"], started["ended_at"]) == (
        "tool",
        {"q": "x"},
        None,
    )
    # What JSON does not carry is said in words.
    assert ended["output"].startswith("<object object at") and ended["ended_at"]
    assert events[7]["value"]["output"] == {"found": 2}


async def _nothing() -> None:
    return None


def test_a_session_this_runtime_no_longer_holds_resumes_from_its_record(
    runtime: Runtime, local: TestClient
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    events_of(
        local.post(
            "/api/v1/apps/sessions",
            json={
                "agent": "notes-assistant",
                "session": "session-0005",
                "opener": "Remember me",
            },
        )
    )
    # The runtime restarted: the session is only in its record, and its
    # application's agent is made again.
    sessions.forget_sessions()
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    read: List[str] = []

    async def reader(uid: str, bearer: str) -> List[Dict[str, Any]]:
        read.append(bearer)
        return [
            e
            for e in runtime.entries("turn") + runtime.entries("session")
            if e["session_uid"] == uid
        ]

    sessions.use_record_reader(reader)
    unsaid = local.post("/api/v1/apps/sessions/session-0005/resume", json={})
    assert unsaid.status_code == 404
    tokenless = local.post(
        "/api/v1/apps/sessions/session-0005/resume", json={"agent": "notes-assistant"}
    )
    assert (
        tokenless.json()["detail"]
        == "Session session-0005 is read back from its record with your token: send one."
    )
    resumed = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0005/resume",
            headers=as_("ada"),
            json={"agent": "notes-assistant"},
        )
    )
    assert resumed[0]["value"]["resumed"] is True
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [m["content"] for m in snapshot["messages"]] == [
        "Remember me\n\nTone: Plain",
        "Heard 1: Remember me\n\nTone: Plain",
    ]
    assert read == ["ada"]
    assert (
        runtime.entries("session")[-1]["summary"]
        == "A session of Notes Assistant resumed"
    )
    answer = answer_of(
        events_of(
            local.post(
                "/api/v1/apps/sessions/session-0005/messages", json={"text": "Again"}
            )
        )
    )
    assert answer.startswith("Heard 2: Again")


def test_resume_is_refused_for_an_application_that_keeps_no_conversations(
    runtime: Runtime, local: TestClient
) -> None:
    runtime.make(
        "quiet", {**ASSISTANT, "id": "quiet", "record": {"include": ["outputs"]}}, {}
    )
    refused = local.post(
        "/api/v1/apps/sessions/session-0006/resume",
        headers=as_("ada"),
        json={"agent": "quiet"},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Notes Assistant keeps no conversations in its record, so a session of it cannot be resumed from there.",
    )


REPORT = yaml.safe_load((CATALOGUE / "report-from-a-file.yaml").read_text())


def test_report_from_a_file_takes_its_file_from_the_page(
    runtime: Runtime, local: TestClient
) -> None:
    """The Python example asks for its file with `session.ask`: a file given on
    the page answers it — with the action, or after it asked."""
    model = runtime.make("report-from-a-file", REPORT, {"app_uid": "app-3"})
    csv = b"region,amount\nnorth,10\nsouth,20\n"
    file = {
        "name": "orders.csv",
        "type": "text/csv",
        "data_url": data_url(csv, "text/csv"),
    }
    started = events_of(
        local.post(
            "/api/v1/apps/sessions",
            json={
                "agent": "report-from-a-file",
                "session": "session-0007",
                "settings": {"report": "Full"},
            },
        )
    )
    assert started[0]["value"]["python"] is True
    events = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0007/actions",
            json={"name": "run", "text": "Report: Full", "files": [file]},
        )
    )
    assert types_of(events) == [
        "CUSTOM:loop.session",
        "RUN_STARTED",
        "STEP_STARTED",
        "CUSTOM:loop.step",
        "STEP_FINISHED",
        "CUSTOM:loop.step",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_END",
        "RUN_FINISHED",
    ]
    assert answer_of(events) == "Heard 1: Report: Full"
    # Its agent is the runtime's, with the file and the settings the code gave it.
    assert len(model.prompts) == 1

    # Run without a file: it asks, the stream ends on the question, and the
    # file given next answers it.
    asked = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0007/actions",
            json={"name": "run", "text": "Again"},
        )
    )
    [question] = [e for e in asked if e["type"] == "CUSTOM" and e["name"] == "loop.ask"]
    assert question["value"] == {
        "kind": "file",
        "prompt": "Which file?",
        "accept": [".csv"],
        "max_bytes": 25 * 1024 * 1024,
    }
    assert answer_of(asked) == "Which file? (a file: .csv)"
    assert types_of(asked)[-1] == "RUN_FINISHED"
    waiting = local.get("/api/v1/apps/sessions/session-0007").json()
    assert (waiting["state"], waiting["asking"]["kind"]) == ("waiting", "file")
    assert local.post(
        "/api/v1/apps/sessions/session-0007/messages", json={"text": "hm"}
    ).json()["detail"] == (
        "Report from a File is waiting for an answer: Which file? (a file: .csv)"
    )
    went_on = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0007/actions",
            json={"name": "upload", "files": [file]},
        )
    )
    assert types_of(went_on)[1] == "RUN_STARTED"
    assert answer_of(went_on) == "Heard 2: Again"
    assert local.get("/api/v1/apps/sessions/session-0007").json()["state"] == "open"

    # A PDF is not what its page asks for: refused before its code runs, in
    # the sentence the page says (LOOP P-21).
    pdf = {
        "name": "a.pdf",
        "type": "application/pdf",
        "data_url": data_url(b"%PDF", "application/pdf"),
    }
    refused = local.post(
        "/api/v1/apps/sessions/session-0007/actions",
        json={"name": "run", "files": [pdf]},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "a.pdf is not a kind of file Report from a File's page asks for: it asks for .csv.",
    )


def test_report_from_a_file_over_ag_ui_as_its_page_runs_it(
    runtime: Runtime, local: TestClient
) -> None:
    runtime.make("report-from-a-file", REPORT, {"app_uid": "app-3"})
    csv = b"a\n1\n"
    events = events_of(
        local.post(
            "/api/v1/apps/agents/report-from-a-file/ag-ui/",
            json={
                "threadId": "thread-0008",
                "runId": "run-1",
                "messages": [
                    {"id": "m1", "role": "user", "content": "Report: Summary"}
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {
                    "loop": {
                        "action": {"name": "run", "payload": {}},
                        "settings": {"report": "Summary", "question": ""},
                        "files": [
                            {
                                "name": "a.csv",
                                "type": "text/csv",
                                "data_url": data_url(csv, "text/csv"),
                            }
                        ],
                    }
                },
            },
        )
    )
    assert answer_of(events) == "Heard 1: Report: Summary"
    assert (events[0]["type"], events[0]["runId"]) == ("RUN_STARTED", "run-1")


DEPTH = {
    "id": "depth",
    "label": "Depth",
    "options": [
        {"id": "quick", "label": "Quick", "instructions": "Answer in two sentences."},
        {
            "id": "thorough",
            "label": "Thorough",
            "instructions": "Cite what you read.",
            "model": "alibaba:qwen-max",
        },
    ],
}


def test_the_mode_a_run_says_is_told_to_its_agent_for_that_run(
    runtime: Runtime, local: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LOOP P-19: ``forwardedProps.loop.modes`` — the options' instructions for the
    run, the model one names run on; a mode or an option it does not have refused."""
    from pydantic_ai.messages import ModelRequest

    spec = {
        **ASSISTANT,
        "interface": {**ASSISTANT["interface"], "modes": [DEPTH]},
    }
    model = runtime.make("notes-assistant", spec, {"app_uid": "app-1"})
    told: List[str] = []
    heard = model.said

    def said(messages: List[ModelMessage]) -> str:
        told.append(
            next(
                m.instructions or ""
                for m in reversed(messages)
                if isinstance(m, ModelRequest)
            )
        )
        return heard(messages)

    model.said = said  # type: ignore[method-assign]
    run: Dict[str, Any] = {
        "threadId": "thread-modes",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hi there"}],
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {}},
    }
    url = "/api/v1/apps/agents/notes-assistant/ag-ui/"
    # Unsaid, a mode is on its first option.
    assert answer_of(events_of(local.post(url, json=run))) == "Heard 1: Hi there"
    assert "Answer in two sentences." in told[-1]
    moded = sessions.session_of("thread-modes")
    assert moded is not None
    assert moded.modes == {"depth": "quick"}
    # What is kept of the conversation is what the person said, not the modes.
    assert all(m["role"] != "system" for m in moded.messages)

    for wrong, sentence in (
        ({"speed": "fast"}, "Notes Assistant has no mode 'speed'."),
        ({"depth": "deep"}, "The mode Depth has no option 'deep'."),
        ("thorough", "The modes sent are not options by mode id."),
    ):
        refused = local.post(
            url, json={**run, "forwardedProps": {"loop": {"modes": wrong}}}
        )
        assert refused.status_code == 422
        assert refused.json()["detail"] == sentence

    # The model an option names goes with the run, for that run.
    forwarded: List[Dict[str, Any]] = []

    async def forward(
        self: Any, body: Dict[str, Any], *, bearer: str, instructions: str = ""
    ) -> None:
        forwarded.append({**body, "told": instructions})

    monkeypatch.setattr(sessions.LiveSession, "forward", forward)
    local.post(
        url,
        json={
            **run,
            "runId": "run-2",
            "forwardedProps": {"loop": {"modes": {"depth": "thorough"}}},
        },
    )
    assert forwarded[-1]["model"] == "alibaba:qwen-max"
    assert forwarded[-1]["told"] == "Cite what you read."
    # Told by the runtime, not as a message: the agent takes no system
    # message from the request.
    assert [m["role"] for m in forwarded[-1]["messages"]] == ["user"]
    # Said once, the mode is kept for the runs that do not say it again.
    local.post(url, json={**run, "runId": "run-3"})
    assert forwarded[-1]["model"] == "alibaba:qwen-max"


PROFILES = [
    {"id": "support", "label": "Support", "instructions": "Answer briefly."},
    {
        "id": "sales",
        "label": "Sales",
        "instructions": "Talk about plans.",
        "model": "alibaba:qwen3-32b",
    },
]


def test_a_conversation_keeps_the_profile_it_started_with(
    runtime: Runtime, local: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LOOP P-20: ``forwardedProps.loop.profile`` — its instructions told before
    the modes', its model run unless a mode names one; kept to the end."""
    spec = {
        **ASSISTANT,
        "interface": {
            **ASSISTANT["interface"],
            "modes": [DEPTH],
            "profiles": PROFILES,
        },
    }
    runtime.make("notes-assistant", spec, {"app_uid": "app-1"})
    forwarded: List[Dict[str, Any]] = []

    async def forward(
        self: Any, body: Dict[str, Any], *, bearer: str, instructions: str = ""
    ) -> None:
        forwarded.append({**body, "told": instructions})

    monkeypatch.setattr(sessions.LiveSession, "forward", forward)
    run = {
        "threadId": "thread-profiles",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hi there"}],
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {"profile": "sales"}},
    }
    url = "/api/v1/apps/agents/notes-assistant/ag-ui/"
    local.post(url, json=run)
    assert forwarded[-1]["told"] == "Talk about plans.\n\nAnswer in two sentences."
    assert forwarded[-1]["model"] == "alibaba:qwen3-32b"
    live = sessions.session_of("thread-profiles")
    assert live is not None
    assert live.profile == "sales"
    assert live.describe()["profile"] == "sales"
    # A mode's model wins over the profile's.
    local.post(
        url,
        json={
            **run,
            "runId": "run-2",
            "forwardedProps": {
                "loop": {"profile": "sales", "modes": {"depth": "thorough"}}
            },
        },
    )
    assert forwarded[-1]["model"] == "alibaba:qwen-max"
    assert forwarded[-1]["told"] == "Talk about plans.\n\nCite what you read."
    # Kept to the end: another is refused, an unknown one too.
    changed = local.post(
        url, json={**run, "forwardedProps": {"loop": {"profile": "support"}}}
    )
    assert changed.status_code == 409
    assert changed.json()["detail"] == (
        "This conversation is with Sales: start another to talk to Support."
    )
    for wrong, sentence in (
        ("buyer", "Notes Assistant has no profile 'buyer'."),
        (3, "The profile sent is not a profile's id."),
    ):
        refused = local.post(
            url, json={**run, "forwardedProps": {"loop": {"profile": wrong}}}
        )
        assert refused.status_code == 422
        assert refused.json()["detail"] == sentence
    # Unsaid, a new conversation is with the first.
    local.post(url, json={**run, "threadId": "thread-first", "forwardedProps": {}})
    assert forwarded[-1]["told"] == "Answer briefly.\n\nAnswer in two sentences."
    assert "model" not in forwarded[-1]
    # A session started with a profile it does not have is refused.
    refused = local.post(
        "/api/v1/apps/sessions",
        json={"agent": "notes-assistant", "profile": "buyer"},
    )
    assert refused.status_code == 422


def test_its_code_is_told_the_settings_the_page_changed_and_the_profile(
    runtime: Runtime, local: TestClient
) -> None:
    """LOOP P-20: settings changed in the page go with the next run; ``@app.settings``
    runs on what changed, before the message, and ``session.profile`` says the profile."""
    from agent_runtimes.loop.apps import Application

    app = Application("notes-desk", agent="cog-crawler:0.0.1", name="Notes Desk")
    app.setting(
        "tone",
        {
            "type": "string",
            "title": "Tone",
            "enum": ["Plain", "Warm"],
            "default": "Plain",
        },
        widget="radio",
    )
    app.profile("support", "Support")
    app.profile("sales", "Sales")
    told: List[Dict[str, Any]] = []

    @app.settings
    async def changed(session: Any, values: Dict[str, Any]) -> None:
        told.append(dict(values))

    @app.message
    async def reply(session: Any, text: str) -> None:
        await session.send(f"{session.profile}: {session.settings['tone']}: {text}")

    sessions.serve_code(app)
    runtime.make("notes-desk", app.document, {"app_uid": "app-9"})
    run = {
        "threadId": "thread-settings",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hello"}],
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {"profile": "sales", "settings": {"tone": "Plain"}}},
    }
    url = "/api/v1/apps/agents/notes-desk/ag-ui/"
    assert answer_of(events_of(local.post(url, json=run))) == "sales: Plain: Hello"
    # Unchanged: its code is not told.
    assert told == []
    run["forwardedProps"] = {"loop": {"settings": {"tone": "Warm"}}}
    assert (
        answer_of(events_of(local.post(url, json={**run, "runId": "run-2"})))
        == "sales: Warm: Hello"
    )
    assert told == [{"tone": "Warm"}]
