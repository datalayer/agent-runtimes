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
        lambda app: application if app.id == "digest" else None,
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
