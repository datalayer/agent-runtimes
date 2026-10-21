# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pytest configuration for agent_runtimes unit tests."""

import os

# Ensure AWS_DEFAULT_REGION is set so that agent specs referencing Bedrock
# models can be imported without raising pydantic_ai.exceptions.UserError
# during test collection.  The region is never used for actual API calls
# in unit tests.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

# Same reason for OpenAI: building an agent from an `openai:` model string
# constructs the provider, which refuses to exist without a key. No unit test
# reaches the API, so a placeholder is all this needs.
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key-not-used")

# The protocol state store (A2A tasks, ACP sessions) is a SQLite file in the
# person's home by default, the one their running servers write: tests sharing
# it met "database is locked" and read each other's tasks. Each test process
# keeps its own, whatever the shell says.
import tempfile  # noqa: E402

os.environ["AGENT_RUNTIMES_PROTOCOL_STATE_PATH"] = os.path.join(
    tempfile.mkdtemp(prefix="agent-runtimes-tests-"), "protocol-state.sqlite"
)
# Sessions are kept in a file store of the test process's own (MH-F03): no
# test reads or writes the platform's record, whatever the shell's
# DATALAYER_* say; a test of the record store installs its fake.
os.environ["AGENT_RUNTIMES_SESSION_STORE"] = "file"
os.environ["AGENT_RUNTIMES_SESSIONS_PATH"] = os.path.join(
    tempfile.mkdtemp(prefix="agent-runtimes-tests-"), "sessions"
)

# A machine with the platform's magic key launches unmetered: no credits asked,
# a reservation that never ends. The tests of launching expect a metered one;
# the test of the key sets it itself.
os.environ.pop("DATALAYER_MAGIC_API_KEY", None)

from collections.abc import Iterator, Mapping  # noqa: E402
from typing import Any, Dict, Optional  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _a_ui_hub_per_test(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Each test starts with the sessions' ui hub empty (RU-W).

    The hub numbers and keeps each session's ops for the page's socket; a
    test reading them must not read another test's under the same uid.

    Yields
    ------
    None
        Control to the test, with a fresh hub in place.
    """
    from reactor.ui.ws import UiHub

    from agent_runtimes.loop.apps import sessions

    monkeypatch.setattr(sessions, "UI_HUB", UiHub())
    yield


@pytest.fixture(autouse=True)
def _app_instances_kept() -> Iterator[None]:
    """Each test leaves the application instances its runtime serves as it found them.

    A runtime one of whose agents serves a deployment answers only the
    application's own routes (`principal.a_deployment_is_served`): a test that
    configured a deployment and left it remembered would have every later
    test's other routes answer 404.

    Yields
    ------
    None
        While the test runs; the instances are put back after.
    """
    from agent_runtimes.models import models

    kept = dict(models._APP_INSTANCES)
    yield
    models._APP_INSTANCES.clear()
    models._APP_INSTANCES.update(kept)


@pytest.fixture(autouse=True)
def _logging_levels_kept() -> Iterator[None]:
    """Each test leaves the loggers' levels as it found them.

    A command run in-process quiets the logs as it does in a terminal — the
    chat's root at ERROR, ``apps validate`` its own at WARNING — and a test
    after it that reads the log (``caplog``) would read nothing.

    Yields
    ------
    None
        While the test runs; the levels are put back after.
    """
    import logging

    loggers = [logging.getLogger()] + [
        each
        for each in list(logging.Logger.manager.loggerDict.values())
        if isinstance(each, logging.Logger)
    ]
    held = [(each, each.level) for each in loggers]
    yield
    for each, level in held:
        if each.level != level:
            each.setLevel(level)


@pytest.fixture(autouse=True)
def _ai_inference_not_asked(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No test asks the real ai-inference which models it serves.

    The runtime asks once and keeps the answer; a test that needs an answer
    sets it (``set_inference_models``). Without this, a test reaching the
    config routes would ask whatever ``DATALAYER_AI_INFERENCE_URL`` names.

    Nor does a test call it with the token of the shell it runs in: none is
    given and none is in the environment; a test that routes through
    ai-inference gives one (``give_inference_token``).

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        Clears the tokens of the environment for the test.

    Yields
    ------
    None
        While the test runs on the answer set here.
    """
    from agent_runtimes.models.offered import (
        InferenceModels,
        give_inference_token,
        set_inference_models,
    )

    monkeypatch.delenv("DATALAYER_AI_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    give_inference_token(None)
    set_inference_models(
        InferenceModels(
            served=None, url=None, note="ai-inference is not asked in tests."
        )
    )
    yield
    set_inference_models(None)
    give_inference_token(None)


@pytest.fixture(autouse=True)
def _ai_agents_not_asked_for_previews() -> Iterator[None]:
    """No test asks the real ai-agents for a Preview's token (R-25).

    A Preview a person opens runs with their token narrowed to the Spaces its
    application is granted, asked of ai-agents; without this, a test opening
    one would ask whatever ``DATALAYER_AI_AGENTS_URL`` names. Here the answer
    is ``preview:<app>:<the person's token>``, naming the Spaces asked for; a
    test about the token itself installs its own asker.

    Yields
    ------
    None
        While the test runs with this asker.
    """
    from agent_runtimes.loop.apps import principal

    async def answer(
        app_uid: str, grants: Mapping[str, Any], bearer: str
    ) -> Dict[str, Any]:
        spaces = [
            {"space": grant.get("space"), "access": grant.get("access")}
            for grant in (grants.get("permissions") or {}).get("spaces") or []
        ]
        return {
            "access_token": f"preview:{app_uid}:{bearer}",
            "expires_in": 3600,
            "spaces": spaces,
        }

    principal.use_preview_asker(answer)
    yield
    principal.use_preview_asker(None)
    for key in [key for key in principal._HELD if key.startswith("preview:")]:
        principal._HELD.pop(key, None)


@pytest.fixture(autouse=True)
def _ai_agents_not_asked_for_code() -> Iterator[None]:
    """No test asks the real ai-agents for a deployment's code (R-14).

    The agent of a deployment is made with the code of the version it runs,
    read from ai-agents (`GET /apps/deployments/{uid}/code`); without this, a
    test making one would ask whatever ``DATALAYER_AI_AGENTS_URL`` names.
    Here every version is written as a spec (no code); a test about the code
    installs its own reader with `principal.use_code_reader`.

    Yields
    ------
    None
        While the test runs with this reader.
    """
    from agent_runtimes.loop.apps import principal

    async def none(
        deployment_uid: str, version: int, bearer: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        return None

    principal.use_code_reader(none)
    yield
    principal.use_code_reader(None)
