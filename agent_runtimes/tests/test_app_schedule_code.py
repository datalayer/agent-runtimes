# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A ``@app.schedule`` handler's code runs on a tick (LOOP R-14).

The platform's scheduler wakes a deployment by the position of its trigger
among the application's triggers; on the runtime it opens a session of the
deployment's agent on the session API, said to be woken. An application
written in Python whose code declared the schedule at that position runs that
handler, with the session, in the opener's place — as a command's code runs,
from what the registry holds for it (``loop.app.schedule``). Nobody is
present: its rules know it (R-16), on the agent the runtime makes as in
process. Everything runs in process: the runtime's real routes, a model that
says what it was given, nothing reached over the network.
"""

import asyncio
from typing import Any, Callable, Dict, Iterator, List

import httpx
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import Application, Session, principal, sessions
from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.record import _SESSION
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    _DummyRequest,
    creation_spy,
)

# The in-process runtime the session API's tests run on (its `runtime` fixture).
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    answer_of,
    as_,
    events_of,
    remote,
    runtime,
)

DEPLOYMENT = {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 4}


def digest() -> tuple[Application, List[str]]:
    """An application with a schedule declared after another trigger, and one in code."""
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "digest",
            "name": "Digest",
            "kind": "worker",
            "agent": "cog-crawler:0.0.1",
            "goal": "Keep the week's digest.",
            "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
            "triggers": [
                {"type": "once", "at": "launch"},
                {
                    "type": "schedule",
                    "cron": "0 18 * * 5",
                    "prompt": "Sum up the week.",
                },
            ],
        }
    )
    ran: List[str] = []

    @application.schedule("0 9 * * 1", prompt="Write the Monday digest.")
    async def monday(session: Session) -> None:
        ran.append(session.id)
        await session.send("Monday digest kept.")

    return application, ran


def test_a_schedule_is_known_by_its_position_among_the_triggers() -> None:
    application, _ = digest()
    assert application.schedule_at(2) == "monday"
    # The spec's own schedule has no code; nor has a trigger that is not one.
    assert application.schedule_at(1) is None
    assert application.schedule_at(0) is None
    assert application.spec.triggers[2].cron == "0 9 * * 1"


@pytest.fixture()
def deployed(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[Runtime, List[str]]]:
    """The deployment's agent on the runtime, its code the application's.

    Yields
    ------
    tuple
        The runtime, and the sessions the schedule's handler ran in.
    """
    application, ran = digest()

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-7",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-1")
    monkeypatch.setattr(
        sessions,
        "code_of",
        lambda app, agent_id="": application if app.id == "digest" else None,
    )
    runtime.make("digest", application.document, DEPLOYMENT)
    yield runtime, ran
    principal.forget_principal_token("dep-1")


def woken(position: int, cron: str = "0 9 * * 1") -> Dict[str, Any]:
    return {
        "kind": "schedule",
        "schedule_uid": "sch-1",
        "run_uid": "run-1",
        "position": position,
        "cron": cron,
    }


def start(client: TestClient, woken_by: Dict[str, Any], **more: Any) -> Any:
    return client.post(
        "/api/v1/apps/sessions",
        headers=as_("owner"),
        json={
            "agent": "digest",
            **DEPLOYMENT,
            "opener": "Write the Monday digest.",
            "woken_by": woken_by,
            **more,
        },
    )


def test_a_tick_runs_the_handler_its_code_declared_not_the_prompt(
    deployed: tuple[Runtime, List[str]],
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    made, ran = deployed
    events = events_of(start(remote, woken(2), session="session-tick-01"))
    assert ran == ["session-tick-01"]
    assert answer_of(events) == "Monday digest kept."
    assert [e["type"] for e in events if e["type"].startswith("RUN_")] == [
        "RUN_STARTED",
        "RUN_FINISHED",
    ]
    # Its agent was not asked the trigger's prompt: the code did the work.
    assert made.models["digest"].prompts == []
    # The record says the schedule woke it, and nobody opened it.
    [began] = [
        e for e in made.entries("session") if e["session_uid"] == "session-tick-01"
    ]
    assert began["payload"]["woken_by"]["position"] == 2
    woken_live = sessions.session_of("session-tick-01")
    assert woken_live is not None
    assert woken_live.describe()["acts_as"] == {
        "kind": "principal",
        "uid": "principal-7",
        "deployment_uid": "dep-1",
    }


def test_a_schedule_its_code_did_not_declare_asks_the_agent_its_prompt(
    deployed: tuple[Runtime, List[str]],
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    made, ran = deployed
    events = events_of(
        start(
            remote,
            woken(1, "0 18 * * 5"),
            opener="Sum up the week.",
            session="session-tick-02",
        )
    )
    assert ran == []
    assert made.models["digest"].prompts == ["Sum up the week."]
    assert answer_of(events) == "Heard 1: Sum up the week."


def test_a_tick_whose_trigger_is_not_the_codes_schedule_is_refused(
    deployed: tuple[Runtime, List[str]],
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    made, ran = deployed
    # The Appspec the agent runs says another time at that position than the
    # code: they are of different versions, and nothing runs.
    stale = digest()[0].document
    stale["triggers"] = [
        *stale["triggers"][:2],
        {"type": "schedule", "cron": "0 7 * * 1", "prompt": "Old."},
    ]
    made.make("digest", stale, DEPLOYMENT)
    refused = start(remote, woken(2), session="session-tick-03")
    assert refused.status_code == 409
    assert "its code and its Appspec differ" in refused.json()["detail"]
    assert sessions.session_of("session-tick-03") is None
    assert ran == []
    unsaid = start(remote, {"kind": "schedule"}, session="session-tick-04")
    assert unsaid.status_code == 422
    assert unsaid.json()["detail"] == (
        "The schedule that woke the session names no trigger position."
    )
    assert sessions.session_of("session-tick-04") is None


def test_the_scheduler_s_start_session_runs_the_handler_on_the_runtime(
    deployed: tuple[Runtime, List[str]],
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """What the scheduler calls, end to end against the runtime's routes: the
    agent is already there (409, the one kept), the session runs the code."""
    from agent_runtimes.loop.apps.deployments import start_session

    _, ran = deployed

    class InProcess(httpx.BaseTransport):
        """The runtime's routes, in process; its agent already made."""

        def handle_request(self, request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/api/v1/agents"):
                return httpx.Response(409, json={"detail": "exists"})
            # The session API, under its path on the runtime's own app.
            path = request.url.path.split("/rt-1", 1)[1]
            answer = remote.post(
                path, content=request.content, headers=dict(request.headers)
            )
            return httpx.Response(
                answer.status_code, content=answer.content, headers=answer.headers
            )

    started = start_session(
        ingress="https://r1.example/jupyter/server/rt-1",
        token="owner",
        payload={
            "name": "digest",
            "transport": "ag-ui",
            "app_instance": {**DEPLOYMENT, "woken_by": woken(2)},
        },
        prompt="Write the Monday digest.",
        client=httpx.Client(transport=InProcess()),
    )
    assert started["agent_id"] == "digest"
    assert started["result"] == {
        "status": "completed",
        "output": {"text": "Monday digest kept."},
    }
    assert ran == [started["session_uid"]]


def test_the_runtime_s_agent_of_a_woken_deployment_knows_nobody_is_present(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """R-16 on a runtime: the rules of the agent it makes for a deployment
    woken by a schedule say nobody is present; of one a person opens, not."""
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    application, _ = digest()

    def unattended_of(name: str, instance: Dict[str, Any]) -> Callable[[], bool]:
        request = CreateAgentRequest(
            name=name,
            transport="ag-ui",
            app_spec=application.document,
            app_instance=instance,
        )
        asyncio.run(create_agent(request, _DummyRequest()))
        capabilities = creation_spy["pydantic_kwargs"]["capabilities"]
        rules = next(c for c in capabilities if isinstance(c, AppRulesCapability))
        assert rules.unattended is not None
        return rules.unattended

    # The deployment's principal holds a token: its agent is made (I-03).
    principal.give_principal_token("dep-1", "narrowed", expires_in=3600)
    token = _SESSION.set("session-tick-05")
    try:
        assert unattended_of("digest-woken", {**DEPLOYMENT, "woken_by": woken(2)})()
        assert not unattended_of("digest-opened", DEPLOYMENT)()
    finally:
        _SESSION.reset(token)
        principal.forget_principal_token("dep-1")


# --- the deployment's own code travels with the tick (drilled 2026-10-07) ----------

TICK_SOURCE = """
from agent_runtimes.loop.apps import Application, Session

app = Application.from_spec(
    {
        "schema": "loop.app/v1",
        "id": "r14-tick",
        "version": "0.0.1",
        "name": "R-14 tick",
        "kind": "worker",
        "agent": "cog-crawler:0.0.1",
        "goal": "Say the time on every tick, and nothing more.",
        "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
        "triggers": [{"type": "once", "at": "launch"}],
    }
)


@app.schedule("*/2 * * * *", description="Every two minutes", prompt="Say that the tick ran.")
async def tick(session: Session) -> None:
    await session.send("TICK-HANDLER-RAN")
"""

TICK_CODE = {"file": "app.py", "text": TICK_SOURCE}
TICK_DEPLOYMENT = {"app_uid": "app-14", "deployment_uid": "dep-14", "version": 2}


def tick_spec() -> Dict[str, Any]:
    """The Appspec `loop apps push` builds from the code: its schedule at position 1."""
    from agent_runtimes.loop.apps.application import load_application_source

    return load_application_source(TICK_SOURCE, "app.py").document


def test_a_versions_code_is_in_the_payload_the_scheduler_hands_the_runtime() -> None:
    """ai-agents' `/wake` reads the item's `app.py` beside its spec and
    `session_payload` carries it as `app_code`; a spec version carries none;
    what is not an `app.py` is refused."""
    from agent_runtimes.loop.apps.deployments import (
        DeployRefused,
        kept_payload,
        session_payload,
    )

    spec = tick_spec()
    woken_by = {"kind": "schedule", "position": 1}
    carried = session_payload(
        spec,
        app_uid="app-14",
        deployment_uid="dep-14",
        version=2,
        woken_by=woken_by,
        code=TICK_CODE,
    )
    assert carried["app_code"] == TICK_CODE
    assert carried["app_instance"]["woken_by"] == woken_by
    assert "app_code" not in session_payload(
        spec, app_uid="app-14", deployment_uid="dep-14", version=2, woken_by=woken_by
    )
    assert (
        kept_payload(
            spec, app_uid="app-14", deployment_uid="dep-14", version=2, code=TICK_CODE
        )["app_code"]
        == TICK_CODE
    )
    for wrong in (
        {"file": "app.txt", "text": TICK_SOURCE},
        {"file": "../app.py", "text": TICK_SOURCE},
        {"file": "app.py", "text": " "},
        {"text": TICK_SOURCE},
    ):
        with pytest.raises(DeployRefused):
            session_payload(
                spec,
                app_uid="app-14",
                deployment_uid="dep-14",
                version=2,
                woken_by=woken_by,
                code=wrong,
            )


def test_the_create_route_runs_the_deployments_code_in_its_principals_name_only(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """`app_code` is accepted for a deployment's agent once its principal's
    token is held, and served for that agent's sessions; with no deployment
    behind the request, or code of another application, nothing runs."""
    from fastapi import HTTPException

    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.routes.agents import (
        CreateAgentRequest,
        create_agent,
        delete_agent,
    )

    spec = tick_spec()

    def create(name: str, instance: Dict[str, Any], code: Dict[str, Any]) -> None:
        request = CreateAgentRequest(
            name=name,
            transport="ag-ui",
            app_spec=spec,
            app_instance=instance,
            app_code=code,
        )
        asyncio.run(create_agent(request, _DummyRequest()))

    principal.give_principal_token("dep-14", "narrowed", expires_in=3600)
    try:
        create(
            "r14-tick-agent",
            {**TICK_DEPLOYMENT, "woken_by": woken(1, "*/2 * * * *")},
            TICK_CODE,
        )
        served = sessions.code_of(load_app(spec), "r14-tick-agent")
        assert served is not None and served.schedule_at(1) == "tick"
        # Another agent of the same application was given no code: the
        # catalogue has none for it either.
        assert sessions.code_of(load_app(spec), "another-agent") is None
        # A Preview — no deployment — runs no code from a request.
        with pytest.raises(HTTPException) as refused:
            create("r14-preview", {"app_uid": "app-14", "version": 2}, TICK_CODE)
        assert (
            refused.value.status_code == 422
            and "deployment only" in refused.value.detail
        )
        assert sessions.code_of(load_app(spec), "r14-preview") is None
        # Code of another application, or that does not load, is refused.
        other = {
            "file": "app.py",
            "text": TICK_SOURCE.replace('"id": "r14-tick"', '"id": "r14-other"'),
        }
        with pytest.raises(HTTPException) as refused:
            create("r14-other", TICK_DEPLOYMENT, other)
        assert (
            refused.value.status_code == 422
            and "another application's" in refused.value.detail
        )
        with pytest.raises(HTTPException) as refused:
            create(
                "r14-broken", TICK_DEPLOYMENT, {"file": "app.py", "text": "def (:\n"}
            )
        assert (
            refused.value.status_code == 422 and "does not load" in refused.value.detail
        )
        with pytest.raises(HTTPException) as refused:
            create("r14-none", TICK_DEPLOYMENT, {"file": "app.py", "text": "x = 1\n"})
        assert (
            refused.value.status_code == 422
            and "defines 0 applications" in refused.value.detail
        )
        # Deleted, the agent's code goes with it (the registry stubbed by
        # `creation_spy` holds no agent: one is put there for the route).
        from agent_runtimes.routes.acp import _agents

        _agents["r14-tick-agent"] = (None, None)  # type: ignore[assignment, unused-ignore]
        asyncio.run(delete_agent("r14-tick-agent"))
        _agents.pop("r14-tick-agent", None)
        assert sessions.code_of(load_app(spec), "r14-tick-agent") is None
    finally:
        principal.forget_principal_token("dep-14")
        for name in (
            "r14-tick-agent",
            "r14-preview",
            "r14-other",
            "r14-broken",
            "r14-none",
        ):
            sessions.serve_agent_code(name, None)


def test_the_deployed_version_is_the_authority_over_a_code_that_says_none(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """Drilled 2026-10-08 (P-24): the Studio stamps the deployed Appspec
    `version: 0.0.4` while the version's ejected `app.py` holds a `SPEC`
    with no version — the kept runtime refused it 422 three times. A code
    that says no version is of the version deployed; one that says another
    is refused, in a sentence."""
    from fastapi import HTTPException

    from agent_runtimes.loop.apps.application import (
        Application,
        load_application_source,
    )
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    unsaid = TICK_SOURCE.replace('        "version": "0.0.1",\n', "")
    assert '"version"' not in unsaid
    assert load_application_source(unsaid, "app.py").declared_version is None
    deployed = {**tick_spec(), "version": "0.0.4"}

    def create(name: str, text: str) -> None:
        request = CreateAgentRequest(
            name=name,
            transport="ag-ui",
            app_spec=deployed,
            app_instance=TICK_DEPLOYMENT,
            app_code={"file": "app.py", "text": text},
        )
        asyncio.run(create_agent(request, _DummyRequest()))

    principal.give_principal_token("dep-14", "narrowed", expires_in=3600)
    try:
        create("p24-unsaid", unsaid)
        served = sessions.code_of(load_app(deployed), "p24-unsaid")
        assert served is not None
        assert served.spec.version == "0.0.4" and served.declared_version is None
        assert served.schedule_at(1) == "tick"
        # A code that says its own version, another, is refused.
        with pytest.raises(HTTPException) as refused:
            create(
                "p24-other-version",
                TICK_SOURCE.replace('"version": "0.0.1"', '"version": "0.0.2"'),
            )
        assert refused.value.status_code == 422
        assert refused.value.detail == (
            "The code says it is r14-tick 0.0.2, not 0.0.4 the agent runs: "
            "its code and its Appspec are of different versions."
        )
        assert sessions.code_of(load_app(deployed), "p24-other-version") is None
        # The same version said is accepted.
        create(
            "p24-same-version",
            TICK_SOURCE.replace('"version": "0.0.1"', '"version": "0.0.4"'),
        )
        assert sessions.code_of(load_app(deployed), "p24-same-version") is not None
    finally:
        principal.forget_principal_token("dep-14")
        for name in ("p24-unsaid", "p24-other-version", "p24-same-version"):
            sessions.serve_agent_code(name, None)
    # The class tells a version given from one left to the spec's default.
    assert Application("a", agent="x").declared_version is None
    assert Application("a", agent="x").document["version"] == "0.0.1"
    assert Application("a", agent="x", version="0.0.1").declared_version == "0.0.1"
    with pytest.raises(ValueError, match="says it is a 0.0.2, not 0.0.3"):
        Application("a", agent="x", version="0.0.2").at_version("0.0.3")


def test_the_agent_a_kept_runtime_is_made_with_runs_the_deployments_code(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """The keeper of a deployment kept always on (R-33) makes its agent from
    `kept_payload` with the version's `app.py`: the create route takes it as
    for a tick, and every session of that agent — a visitor's at the
    address, not only a woken one — runs with the code; without it, none."""
    from agent_runtimes.loop.apps.deployments import kept_payload
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    spec = tick_spec()
    principal.give_principal_token("dep-14", "narrowed", expires_in=3600)
    try:
        for name, code in (("r14-kept", TICK_CODE), ("r14-kept-spec", None)):
            payload = kept_payload(
                spec, app_uid="app-14", deployment_uid="dep-14", version=2, code=code
            )
            request = CreateAgentRequest(**{**payload, "name": name})
            asyncio.run(create_agent(request, _DummyRequest()))
        served = sessions.code_of(load_app(spec), "r14-kept")
        assert served is not None and served.spec.id == "r14-tick"
        assert served.schedule_at(1) == "tick"
        assert sessions.code_of(load_app(spec), "r14-kept-spec") is None
    finally:
        principal.forget_principal_token("dep-14")
        for name in ("r14-kept", "r14-kept-spec"):
            sessions.serve_agent_code(name, None)


def test_a_woken_session_runs_the_code_the_deployment_carried_not_the_prompt(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """End to end on the runtime's routes, nothing patched in `sessions`: the
    agent's code is the deployment's `app.py`, the handler runs on the tick,
    the agent is never asked the prompt, and the record holds the turn."""
    from agent_runtimes.loop.apps.application import load_application_source

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-14",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-14")
    spec = tick_spec()
    runtime.make("r14-tick", spec, TICK_DEPLOYMENT)
    sessions.serve_agent_code(
        "r14-tick", load_application_source(TICK_SOURCE, "app.py")
    )
    try:
        events = events_of(
            remote.post(
                "/api/v1/apps/sessions",
                headers=as_("owner"),
                json={
                    "agent": "r14-tick",
                    **TICK_DEPLOYMENT,
                    "opener": "Say that the tick ran.",
                    "woken_by": woken(1, "*/2 * * * *"),
                    "session": "session-tick-14",
                },
            )
        )
        assert answer_of(events) == "TICK-HANDLER-RAN"
        assert runtime.models["r14-tick"].prompts == []
        # The record says the schedule woke it, before the stream ended.
        [began] = [
            e
            for e in runtime.entries("session")
            if e["session_uid"] == "session-tick-14"
        ]
        assert began["payload"]["woken_by"]["position"] == 1
    finally:
        sessions.serve_agent_code("r14-tick", None)
        principal.forget_principal_token("dep-14")


def test_the_stream_of_a_turn_ends_only_once_its_record_is_sent(
    deployed: tuple[Runtime, List[str]],
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """The agent's turn is sent to ai-agents in a task after `RUN_FINISHED`;
    a scheduler stops the runtime as the stream ends, so the stream waits for
    it (drilled 2026-10-07: turns never reached the record)."""
    import asyncio as aio

    made, _ = deployed
    slow = made.send

    async def send(body: Dict[str, Any]) -> None:
        await aio.sleep(0.3)
        await slow(body)

    made.send = send  # type: ignore[method-assign]
    from agent_runtimes.loop.apps.record import agent_recorder

    recorder = agent_recorder("digest")
    assert recorder is not None
    recorder.send = send  # type: ignore[assignment, unused-ignore]
    events = events_of(
        start(
            remote,
            woken(1, "0 18 * * 5"),
            opener="Sum up the week.",
            session="session-tick-06",
        )
    )
    assert answer_of(events) == "Heard 1: Sum up the week."
    kinds = [
        e["kind"]
        for body in made.records
        if body["session_uid"] == "session-tick-06"
        for e in body["entries"]
    ]
    assert "turn" in kinds and "output" in kinds


def test_a_woken_session_running_code_keeps_its_run_turn_and_output(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """No agent's run frames a handler, so nothing recorded it: the record
    held the session's start only (drilled 2026-10-07, evening). It is kept
    as an agent's run is: the run, the turn — what woke it, what its code
    said — and its output, before the stream ends."""
    from agent_runtimes.loop.apps.application import load_application_source

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-14",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-14")
    runtime.make("r14-tick", tick_spec(), TICK_DEPLOYMENT)
    sessions.serve_agent_code(
        "r14-tick", load_application_source(TICK_SOURCE, "app.py")
    )
    try:
        events = events_of(
            remote.post(
                "/api/v1/apps/sessions",
                headers=as_("owner"),
                json={
                    "agent": "r14-tick",
                    **TICK_DEPLOYMENT,
                    "opener": "Say that the tick ran.",
                    "woken_by": woken(1, "*/2 * * * *"),
                    "session": "session-tick-15",
                },
            )
        )
        assert answer_of(events) == "TICK-HANDLER-RAN"
        entries = [
            e
            for body in runtime.records
            if body["session_uid"] == "session-tick-15"
            for e in body["entries"]
        ]
        assert [e["kind"] for e in entries] == ["session", "run", "turn", "output"]
        turn = entries[2]["payload"]
        assert (turn["asked"], turn["answered"]) == (
            "Say that the tick ran.",
            "TICK-HANDLER-RAN",
        )
        assert entries[3]["summary"] == "TICK-HANDLER-RAN"
        assert entries[3]["payload"] == {"length": 16, "schedule": "tick"}
        # Every body says what woke it, as an agent's turn would.
        assert all(
            body["woken_by"]["position"] == 1
            for body in runtime.records
            if body["session_uid"] == "session-tick-15"
        )
    finally:
        sessions.serve_agent_code("r14-tick", None)
        principal.forget_principal_token("dep-14")


def _kept_answering(answers_itself: bool) -> Application:
    """A deployment's code kept always on: it answers by itself, or its agent does."""
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "p24-kept",
            "name": "Kept Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "record": {
                "keep_for": "30_days",
                "include": ["conversations", "outputs", "feedback"],
            },
        }
    )
    if answers_itself:

        @application.message
        async def reply(session: Session, text: str) -> None:
            await session.send(f"Three runs, asked {text}.")

    return application


@pytest.mark.parametrize("answers_itself", [True, False])
def test_a_kept_runtimes_code_keeps_each_turn_and_takes_feedback(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    answers_itself: bool,
) -> None:
    """LOOP P-24, drilled 2026-10-08: a hosted Python application on its kept
    runtime, whose code answered with no model, showed *0 turns* after three
    questions and was not found by the words asked; its page's feedback was
    refused, *This runtime runs no application.* Each question is now a turn
    — once, whether its code answered or its agent did — and the feedback is
    kept on the conversation's application, with no `/apps/configure`."""
    from agent_runtimes.routes import apps as routes

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-24",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-24")
    application = _kept_answering(answers_itself)
    kept = {"app_uid": "app-24", "deployment_uid": "dep-24", "version": 4}
    runtime.make("p24-kept", application.document, kept)
    sessions.serve_agent_code("p24-kept", application)
    routes._RUNNING.clear()
    url = "/api/v1/apps/agents/p24-kept/ag-ui/"
    try:
        said: List[Dict[str, Any]] = []
        for index, question in enumerate(["runs", "costs", "models"]):
            said.append({"id": f"m{index}", "role": "user", "content": question})
            events = events_of(
                remote.post(
                    url,
                    headers=as_("owner"),
                    json={
                        "threadId": "thread-p24",
                        "runId": f"run-{index}",
                        "state": None,
                        "messages": list(said),
                        "tools": [],
                        "context": [],
                        "forwardedProps": {},
                    },
                )
            )
            assert answer_of(events)
        turns = [
            e["payload"]
            for e in runtime.entries("turn")
            if e["session_uid"] == "thread-p24"
        ]
        assert [turn["asked"] for turn in turns] == ["runs", "costs", "models"]
        if answers_itself:
            assert turns[0]["answered"] == "Three runs, asked runs."
        # The page's thumb, on the conversation's application.
        given = remote.post(
            "/api/v1/apps/feedback",
            headers=as_("owner"),
            json={
                "session": "thread-p24",
                "liked": True,
                "comment": "Clear.",
                "message": "answer-1",
            },
        )
        assert given.status_code == 200, given.text
        assert given.json()["kept"] is True
        assert [
            e["payload"]["comment"]
            for e in runtime.entries("feedback")
            if e["session_uid"] == "thread-p24"
        ] == ["Clear."]
        # A conversation this runtime never recorded is said, not guessed at.
        unknown = remote.post(
            "/api/v1/apps/feedback",
            headers=as_("owner"),
            json={"session": "thread-none", "liked": False},
        )
        assert (unknown.status_code, unknown.json()["detail"]) == (
            404,
            routes.RUNS_NONE,
        )
    finally:
        sessions.serve_agent_code("p24-kept", None)
        principal.forget_principal_token("dep-24")
        routes._RUNNING.clear()


def test_the_runtimes_application_is_its_kept_agents(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """The agents route keeps the application an agent is made for, as
    `/apps/configure` does its own: a kept runtime answers what its
    application is (LOOP P-24), several say which is meant, and an agent
    deleted takes it away."""
    from agent_runtimes.routes import apps as routes
    from agent_runtimes.routes.acp import _agents
    from agent_runtimes.routes.agents import (
        CreateAgentRequest,
        create_agent,
        delete_agent,
    )

    spec = tick_spec()
    routes._RUNNING.clear()
    principal.give_principal_token("dep-14", "narrowed", expires_in=3600)
    try:
        asyncio.run(
            create_agent(
                CreateAgentRequest(
                    name="r24-kept-agent",
                    transport="ag-ui",
                    app_spec=spec,
                    app_instance=TICK_DEPLOYMENT,
                    app_code=TICK_CODE,
                ),
                _DummyRequest(),
            )
        )
        current = routes.running_app()
        assert current is not None and current.id == spec["id"]
        assert routes.running_app("r24-kept-agent") is current
        # Two applications: which is meant is not guessed, and the routes
        # that answer for "the runtime's application" say so.
        routes._RUNNING["another-agent"] = "another-app"
        assert routes.running_app() is None
        several = routes.no_running_app()
        assert several.status_code == 409
        assert several.detail == (
            "This runtime runs several applications (another-app, "
            f"{spec['id']}): say which, by its conversation or its agent."
        )
        routes._RUNNING.pop("another-agent")
        _agents["r24-kept-agent"] = (None, None)  # type: ignore[assignment, unused-ignore]
        asyncio.run(delete_agent("r24-kept-agent"))
        _agents.pop("r24-kept-agent", None)
        assert routes.running_app() is None
    finally:
        principal.forget_principal_token("dep-14")
        sessions.serve_agent_code("r24-kept-agent", None)
        routes._RUNNING.clear()
