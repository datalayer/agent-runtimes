# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where a Python application's code runs (LOOP R-14, R-21).

On the platform, Python application code runs on a runtime only, the
sandbox a person's agent runs in: the catalogue's — its examples'
``app.py``, shipped with agentspecs — and the ``app.py`` of a version
somebody shipped, kept with its deployment and read from it by the runtime
(``GET /apps/deployments/{uid}/code``) as the agent of that deployment is
made — hosted, embedded, woken by a schedule or kept always on alike, never
from the request that makes the agent. The services import the loaders that
read a spec (``load_app``, ``schedule_triggers``, ``session_payload``),
which run no code of the application's, and the scheduler starts a woken
session on a runtime over HTTP (``start_session``); services' own test
(``test_no_service_runs_application_code``, services dac587ca) keeps them so.
"""

import asyncio
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.specs.apps import APP_BUILT, APP_CATALOGUE
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    creation_spy,
)

agentspecs_apps = pytest.importorskip("agentspecs.apps")


def test_a_runtime_runs_only_the_catalogues_python_code() -> None:
    python = [app_id for app_id, built in APP_BUILT.items() if built == "python"]
    assert python, "the catalogue has Python examples"
    shipped = Path(agentspecs_apps.__file__).parent
    for app_id in python:
        assert (shipped / app_id / "app.py").is_file()
        assert sessions.code_of(APP_CATALOGUE[app_id]) is not None


def test_a_spec_of_anybodys_own_runs_no_code_whatever_it_is_called() -> None:
    """An application saved on the platform is a spec: one that takes a
    catalogue example's id but not its version runs as its agent answers,
    never the example's code under its name."""
    example = APP_CATALOGUE["report-from-a-file"]
    own = load_app(
        {
            **agentspecs_apps.dump_app(agentspecs_apps.get_app("report-from-a-file")),
            "version": "9.9.9",
        }
    )
    assert own.id == example.id and own.version != example.version
    assert sessions.code_of(own) is None
    # A spec of any other id runs no code at all.
    assert sessions.code_of(APP_CATALOGUE["web-research"]) is None


def test_the_loaders_a_service_imports_run_no_application_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``load_app`` and the deployment helpers read a document; loading an
    ``app.py`` is never on their way."""
    from agent_runtimes.loop.apps import application, deployments

    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("a loader a service imports ran an application's code")

    monkeypatch.setattr(application, "load_application", refuse)
    spec = agentspecs_apps.dump_app(agentspecs_apps.get_app("pipeline-report"))
    load_app(spec)
    deployments.schedule_triggers(spec)
    deployments.session_payload(
        spec, app_uid="app-1", deployment_uid="dep-1", version=1, woken_by={}
    )


def test_a_hosted_deployment_not_kept_runs_its_own_code(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """The agent the hosted page makes (`AppRenderer`'s
    `appDatalayerCreatePayload`: the Appspec and the deployment as its
    instance, nothing woke it, no code) runs the version's own ``app.py``,
    read from the deployment: its handlers answer, not the plain agent —
    whether or not the deployment is kept always on (drilled on r1, 14
    October 2026: a shipped app's code ran only when kept)."""
    from agent_runtimes.loop.apps import principal
    from agent_runtimes.loop.apps.application import Application
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
    from agent_runtimes.tests.test_agents_create_integration import _DummyRequest

    text = (
        "from agent_runtimes.loop.apps import Application\n"
        "app = Application('hosted-own', agent='cog-crawler:0.0.1', version='0.0.3')\n"
        "@app.message\n"
        "async def answer(session, text):\n"
        "    await session.send('OWN-CODE')\n"
    )
    spec = Application(
        "hosted-own", agent="cog-crawler:0.0.1", version="0.0.3"
    ).document
    asked: List[tuple] = []

    async def read(deployment: str, version: int, bearer: Any) -> Dict[str, str]:
        asked.append((deployment, version, bearer))
        return {"file": "app.py", "text": text}

    principal.use_code_reader(read)
    principal.give_principal_token("dep-hosted", "narrowed", expires_in=3600)
    request = _DummyRequest()
    request.headers = {"Authorization": "Bearer visitor"}
    try:
        asyncio.run(
            create_agent(
                CreateAgentRequest(
                    name="hosted-own",
                    transport="ag-ui",
                    app_spec=spec,
                    app_instance={
                        "app_uid": "app-h",
                        "deployment_uid": "dep-hosted",
                        "version": 3,
                    },
                ),
                request,  # type: ignore[arg-type]
            )
        )
        assert asked == [("dep-hosted", 3, "visitor")]
        served = sessions.code_of(load_app(spec), "hosted-own")
        assert served is not None and served.spec.id == "hosted-own"
    finally:
        principal.forget_principal_token("dep-hosted")
        sessions.serve_agent_code("hosted-own", None)
