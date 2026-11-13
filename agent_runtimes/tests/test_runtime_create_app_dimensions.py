# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime launched for a LOOP deployment names it (R-09).

``RuntimesClient.create`` sends ``app_uid`` and ``deployment_uid`` in the
body, the way ai-agents launches a kept runtime: the Operator writes them on
the runtime's reservation, so its running time is counted per application
and per deployment. Unsaid, neither is sent. A deployment named without its
application is refused before anything is asked.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from agent_runtimes.runtimes.client import RuntimesClient


class _Answer:
    """A `requests.Response` as far as the client reads one."""

    status_code = 200
    text = ""

    def json(self) -> dict[str, Any]:
        """A created runtime."""
        return {"success": True, "runtime": {"uid": "01RUNTIME"}}


class _Transport:
    """A runtimes API that keeps what it was posted; nothing leaves the process."""

    def __init__(self) -> None:
        """Nothing posted yet."""
        self.urls = SimpleNamespace(
            runtimes_url="https://runtimes.example", iam_url="https://iam.example"
        )
        self.bodies: list[dict[str, Any]] = []

    def _fetch(self, request: str, **kwargs: Any) -> _Answer:
        """Keep the body posted."""
        self.bodies.append(dict(kwargs.get("json") or {}))
        return _Answer()


def test_a_deployment_s_runtime_names_its_application_and_deployment() -> None:
    transport = _Transport()
    RuntimesClient(transport).create(
        environment_name="ai-agents-env",
        given_name="scheduler-sch1",
        credits_limit=2.0,
        app_uid="app-1",
        deployment_uid="dep-1",
        # An application's runtime is launched with its Appspec (R-19).
        app_spec={"name": "Tick"},
    )
    [body] = transport.bodies
    assert (body["app_uid"], body["deployment_uid"]) == ("app-1", "dep-1")
    # Who pays is unchanged by them.
    assert body["credits_limit"] == 2.0


def test_unsaid_neither_is_sent() -> None:
    transport = _Transport()
    RuntimesClient(transport).create(environment_name="python-env", credits_limit=1.0)
    [body] = transport.bodies
    assert "app_uid" not in body and "deployment_uid" not in body


def test_a_deployment_without_its_application_is_refused_before_anything_is_asked() -> (
    None
):
    transport = _Transport()
    with pytest.raises(ValueError, match="without its application"):
        RuntimesClient(transport).create(credits_limit=1.0, deployment_uid="dep-1")
    assert transport.bodies == []


def test_the_launch_s_engine_is_sent_and_unsaid_is_the_spec_s() -> None:
    """``runtime_engine`` overrides the spec's (a kagent deployment's tick);
    unsaid, nothing is sent and Runtimes applies the spec's."""
    transport = _Transport()
    RuntimesClient(transport).create(
        environment_name="ai-agents-env", credits_limit=1.0, runtime_engine="kagent"
    )
    RuntimesClient(transport).create(
        environment_name="ai-agents-env", credits_limit=1.0
    )
    first, second = transport.bodies
    assert first["runtime_engine"] == "kagent"
    assert "runtime_engine" not in second


def test_an_engine_that_is_not_one_is_refused_before_anything_is_asked() -> None:
    transport = _Transport()
    with pytest.raises(ValueError, match="runs on one of datalayer, kagent, agentcore"):
        RuntimesClient(transport).create(
            environment_name="ai-agents-env", credits_limit=1.0, runtime_engine="lambda"
        )
    assert transport.bodies == []


def test_a_deployment_s_runtime_carries_its_public_address() -> None:
    """The Operator puts the address on the runtime, so anybody's agent page
    sends its visitor to ``/apps/<slug>`` (or ``/apps/<slug>/preview/<n>``)."""
    transport = _Transport()
    common: dict[str, Any] = dict(
        environment_name="ai-agents-env",
        credits_limit=1.0,
        app_uid="app-1",
        deployment_uid="dep-1",
        app_spec={"name": "Tick"},
    )
    RuntimesClient(transport).create(**common, deployment_slug="desk")
    RuntimesClient(transport).create(
        **common, deployment_slug="desk", deployment_preview_version=4
    )
    RuntimesClient(transport).create(**common)
    hosted, preview, unsaid = transport.bodies
    assert hosted["deployment_slug"] == "desk"
    assert "deployment_preview_version" not in hosted
    assert (preview["deployment_slug"], preview["deployment_preview_version"]) == (
        "desk",
        4,
    )
    assert "deployment_slug" not in unsaid


def test_an_address_without_its_deployment_is_refused_before_anything_is_asked() -> (
    None
):
    transport = _Transport()
    with pytest.raises(ValueError, match="without its deployment"):
        RuntimesClient(transport).create(credits_limit=1.0, deployment_slug="desk")
    with pytest.raises(ValueError, match="without its deployment's slug"):
        RuntimesClient(transport).create(
            credits_limit=1.0,
            app_uid="app-1",
            deployment_uid="dep-1",
            app_spec={"name": "Tick"},
            deployment_preview_version=2,
        )
    assert transport.bodies == []
