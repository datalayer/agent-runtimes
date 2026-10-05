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

ASSISTANT = {
    "schema": "loop.app/v1",
    "id": "notes-assistant",
    "name": "Notes Assistant",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "interface": {
        "settings": [
            {
                "id": "tone",
                "type": "select",
                "label": "Tone",
                "options": ["Plain", "Warm"],
                "default": "Plain",
            }
        ]
    },
    "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
}

ANALYST = {
    **ASSISTANT,
    "id": "file-analyst",
    "name": "File Analyst",
    "kind": "widget",
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
    wrong = local.post(
        "/api/v1/apps/agents/notes-assistant/ag-ui/",
        json={**run, "forwardedProps": {"loop": {"settings": {"tone": "Loud"}}}},
    )
    assert wrong.status_code == 422
    assert wrong.json()["detail"] == "Tone is one of Plain, Warm."


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
                        "name": "x.bin",
                        "type": "application/octet-stream",
                        "data_url": data_url(b"\x00", "application/octet-stream"),
                    }
                ],
            },
        )
    )
    [error] = [e for e in refused if e["type"] == "RUN_ERROR"]
    assert error["message"].startswith(
        "x.bin is not a text file, and the application has no computer"
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
        "STEP_FINISHED",
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

    # A PDF is not what it asks for: refused in its own sentence.
    pdf = {
        "name": "a.pdf",
        "type": "application/pdf",
        "data_url": data_url(b"%PDF", "application/pdf"),
    }
    refused = events_of(
        local.post(
            "/api/v1/apps/sessions/session-0007/actions",
            json={"name": "run", "files": [pdf]},
        )
    )
    [error] = [e for e in refused if e["type"] == "RUN_ERROR"]
    assert error["message"] == "a.pdf is not one of .csv."


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
