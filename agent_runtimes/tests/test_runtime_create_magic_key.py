# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime created with ``DATALAYER_MAGIC_API_KEY`` set is sent the key.

The platform then starts it unmetered: no credits, no expiry. Unset, the
field is not sent at all. The key is never logged, and the runtime's answer
says whether it is unmetered.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import pytest

from agent_runtimes.runtimes.client import (
    MAGIC_API_KEY_ENV,
    MAGIC_API_KEY_FIELD,
    RuntimesClient,
    unmetered_launch,
)
from agent_runtimes.runtimes.runtime_service import RuntimeService

MAGIC = "the-magic-key-of-these-tests"


class _Answer:
    """A `requests.Response` as far as the client reads one."""

    def __init__(self, body: dict[str, Any]) -> None:
        """Answer with ``body``."""
        self._body = body
        self.status_code = 200
        self.text = ""

    def json(self) -> dict[str, Any]:
        """The body."""
        return self._body


class _Transport:
    """A runtimes API that keeps what it was posted."""

    def __init__(self) -> None:
        """Nothing posted yet."""
        self.urls = SimpleNamespace(
            runtimes_url="https://r1.example", iam_url="https://iam.example"
        )
        self.bodies: list[dict[str, Any]] = []

    def _fetch(self, request: str, **kwargs: Any) -> _Answer:
        """Keep the body posted; answer a created runtime."""
        self.bodies.append(dict(kwargs.get("json") or {}))
        return _Answer({"success": True, "runtime": {"uid": "01RUNTIME"}})


def create(transport: _Transport) -> None:
    """Create a runtime through the client, on ``transport``."""
    RuntimesClient(transport).create(
        environment_name="ai-agents-env", given_name="demo", credits_limit=1.0
    )


def test_set_in_the_environment_the_key_is_sent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Set, the key is in the body and the launch is unmetered."""
    monkeypatch.setenv(MAGIC_API_KEY_ENV, MAGIC)
    transport = _Transport()
    create(transport)
    assert transport.bodies[0][MAGIC_API_KEY_FIELD] == MAGIC
    assert unmetered_launch() is True


@pytest.mark.parametrize("value", (None, "", "   "))
def test_unset_the_field_is_absent(monkeypatch: pytest.MonkeyPatch, value) -> None:
    """Unset or blank, the field is not sent at all."""
    if value is None:
        monkeypatch.delenv(MAGIC_API_KEY_ENV, raising=False)
    else:
        monkeypatch.setenv(MAGIC_API_KEY_ENV, value)
    transport = _Transport()
    create(transport)
    assert MAGIC_API_KEY_FIELD not in transport.bodies[0]
    assert unmetered_launch() is False


def test_the_key_is_never_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """The payload is logged at debug, and the key is not in it."""
    monkeypatch.setenv(MAGIC_API_KEY_ENV, MAGIC)
    with caplog.at_level(logging.DEBUG):
        create(_Transport())
    assert "Runtime create payload" in caplog.text
    assert MAGIC not in caplog.text


def test_a_runtime_says_whether_it_is_unmetered() -> None:
    """The runtime carries the mark the platform answers."""
    assert RuntimeService(name="demo", unmetered=True).unmetered is True
    assert RuntimeService(name="demo").unmetered is False
