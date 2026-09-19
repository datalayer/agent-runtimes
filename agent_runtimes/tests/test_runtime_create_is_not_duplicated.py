# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""A create that timed out is looked for before another is asked.

Found live on 2026-09-19: a launch that took longer than the read timeout was
retried three times, and each attempt made a sandbox, so one launch reserved
credits four times over.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
import requests

from agent_runtimes.runtimes import client as runtimes_client
from agent_runtimes.runtimes.client import RuntimesClient

GIVEN_NAME = "runtime-01M2TG3GPQQG6ZDZR2K983HANY-4b2ee7ab"


class _Answer:
    """A `requests.Response` as far as the client reads one."""

    def __init__(self, body: dict[str, Any], status_code: int = 200) -> None:
        self._body = body
        self.status_code = status_code
        self.text = ""

    def json(self) -> dict[str, Any]:
        """The body."""
        return self._body


class _Transport:
    """A runtimes API whose creates time out, and which may have made them anyway."""

    def __init__(self, *, made: bool) -> None:
        self.urls = SimpleNamespace(
            runtimes_url="https://r1.example", iam_url="https://iam.example"
        )
        self.made = made
        self.posts = 0

    def _fetch(self, url: str, **kwargs: Any) -> _Answer:
        """A POST times out; a GET lists what the timed-out POST made, if anything."""
        if kwargs.get("method") == "POST":
            self.posts += 1
            if self.posts == 1:
                raise requests.exceptions.ReadTimeout(
                    "Read timed out. (read timeout=60)"
                )
            return _Answer(
                {
                    "success": True,
                    "runtime": {"given_name": GIVEN_NAME, "uid": "second"},
                }
            )
        runtimes = [{"given_name": GIVEN_NAME, "uid": "first"}] if self.made else []
        return _Answer({"success": True, "runtimes": runtimes})


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    """The retry's back-off, without the wait."""
    monkeypatch.setattr(runtimes_client.time, "sleep", lambda _seconds: None)


def test_a_create_made_despite_its_timeout_is_answered_not_repeated() -> None:
    """The runtime the timed-out request named is the answer; nothing is created twice."""
    transport = _Transport(made=True)
    answer = RuntimesClient(transport).create(
        environment_name="ai-agents-env", given_name=GIVEN_NAME, credits_limit=1.0
    )
    assert answer["success"] is True
    assert answer["runtime"]["uid"] == "first"
    assert transport.posts == 1


def test_a_create_that_was_not_made_is_asked_again() -> None:
    """Nothing by that name: the timeout lost the request, so it is sent again."""
    transport = _Transport(made=False)
    answer = RuntimesClient(transport).create(
        environment_name="ai-agents-env", given_name=GIVEN_NAME, credits_limit=1.0
    )
    assert answer["runtime"]["uid"] == "second"
    assert transport.posts == 2
