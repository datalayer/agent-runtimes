# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where a Python application's code runs (LOOP R-21).

On the platform, the only Python application code that runs is the
catalogue's — its examples' ``app.py``, shipped with agentspecs — and it runs
on a runtime, the sandbox a person's agent runs in. An ``app.py`` of
anybody's own is built on their machine into the spec it amounts to; the
platform keeps and runs the spec, never the file. The services import the
loaders that read a spec (``load_app``, ``schedule_triggers``,
``session_payload``), which run no code of the application's, and the
scheduler starts a woken session on a runtime over HTTP (``start_session``);
services' own test (``test_no_service_runs_application_code``, services
dac587ca) keeps them so.
"""

from pathlib import Path

import pytest

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.specs.apps import APP_BUILT, APP_CATALOGUE

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
