# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A create naming an environment priced in the last hour does not list again (21 November 2026).

`datalayer sandboxes create` listed every environment for its burning rate
before asking for its runtime: a request of 0.7 to 1 s on r1, on every create.
The listing's prices are now remembered for an hour (`environment_prices`);
the platform's answer to the create says whether the environment launches,
and a refused launch forgets the prices.
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any, cast

import pytest

from agent_runtimes.client import environment_prices
from agent_runtimes.client.agent_client import AgentClient

RUNTIMES_URL = "https://r1.example.test"

LISTING = {
    "success": True,
    "environments": [
        {
            "name": "ai-agents-env",
            "title": "AI Agents",
            "burning_rate": 0.01,
            "language": "python",
            "owner": "datalayer",
            "visibility": "public",
        },
        {
            "name": "python-cpu-env",
            "title": "Python CPU",
            "burning_rate": 0.02,
            "language": "python",
            "owner": "datalayer",
            "visibility": "public",
        },
    ],
}

RUNTIME = {
    "given_name": "speed",
    "environment_name": "ai-agents-env",
    "ingress": "https://r1.example.test/jupyter/server/pool/01x",
    "token": "jupyter-token",
    "runtime_name": "01x",
    "uid": "01x",
}


class _Runtimes:
    """The Runtimes API: answers `answer` to every create, and records them."""

    def __init__(self, answer: dict[str, Any]) -> None:
        self.answer = answer
        self.created: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> dict[str, Any]:
        self.created.append(kwargs)
        return self.answer


def a_client(
    answer: dict[str, Any] | None = None,
) -> tuple[AgentClient, list[int], _Runtimes]:
    """A client on `RUNTIMES_URL`: its listings counted, its creates recorded."""
    client = AgentClient.__new__(AgentClient)
    listings: list[int] = []
    runtimes = _Runtimes(answer or {"success": True, "runtime": RUNTIME})

    def _list_environments(**_: Any) -> dict[str, Any]:
        listings.append(1)
        return LISTING

    client._urls = SimpleNamespace(runtimes_url=RUNTIMES_URL, iam_url=RUNTIMES_URL)
    client._list_environments = _list_environments  # type: ignore[method-assign]
    client._get_api_key = lambda: "api-key"
    client._runtimes_client = cast(Any, runtimes)
    return client, listings, runtimes


def test_the_first_create_lists_and_remembers_the_prices() -> None:
    client, listings, runtimes = a_client()
    client.create_runtime(
        name="speed", environment="ai-agents-env", time_reservation=10
    )
    assert len(listings) == 1
    assert runtimes.created[0]["credits_limit"] == pytest.approx(0.01 * 60 * 10)
    assert environment_prices.recall(RUNTIMES_URL, "python-cpu-env") == (0.02, None)


def test_a_create_within_the_hour_does_not_list() -> None:
    first, _, _ = a_client()
    first.create_runtime(name="speed", environment="ai-agents-env", time_reservation=10)

    # Another command: a new process, a new client.
    client, listings, runtimes = a_client()
    client.create_runtime(
        name="speed", environment="python-cpu-env", time_reservation=5
    )
    assert listings == []
    assert runtimes.created[0]["environment_name"] == "python-cpu-env"
    assert runtimes.created[0]["credits_limit"] == pytest.approx(0.02 * 60 * 5)


def test_prices_older_than_the_hour_are_listed_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first, _, _ = a_client()
    first.create_runtime(name="speed", environment="ai-agents-env", time_reservation=10)

    later = time.time() + environment_prices.PRICES_TTL_SECONDS + 1
    monkeypatch.setattr(environment_prices.time, "time", lambda: later)
    client, listings, _ = a_client()
    client.create_runtime(
        name="speed", environment="ai-agents-env", time_reservation=10
    )
    assert len(listings) == 1


def test_an_environment_not_remembered_is_listed() -> None:
    first, _, _ = a_client()
    first.create_runtime(name="speed", environment="ai-agents-env", time_reservation=10)

    client, listings, _ = a_client()
    with pytest.raises(ValueError, match="not found"):
        client.create_runtime(
            name="speed", environment="no-such-env", time_reservation=10
        )
    assert len(listings) == 1


def test_a_refused_create_forgets_the_prices() -> None:
    first, _, _ = a_client()
    first.create_runtime(name="speed", environment="ai-agents-env", time_reservation=10)

    client, listings, _ = a_client({"success": False, "message": "No such environment"})
    with pytest.raises(RuntimeError, match="No such environment"):
        client.create_runtime(
            name="speed", environment="ai-agents-env", time_reservation=10
        )
    assert listings == []
    assert environment_prices.recall(RUNTIMES_URL, "ai-agents-env") is None


def test_prices_are_kept_per_runtimes_address() -> None:
    first, _, _ = a_client()
    first.create_runtime(name="speed", environment="ai-agents-env", time_reservation=10)
    assert (
        environment_prices.recall("https://prod1.example.test", "ai-agents-env") is None
    )


def test_an_unreadable_prices_file_means_listing() -> None:
    path = environment_prices.prices_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json")
    client, listings, _ = a_client()
    client.create_runtime(
        name="speed", environment="ai-agents-env", time_reservation=10
    )
    assert len(listings) == 1
    assert environment_prices.recall(RUNTIMES_URL, "ai-agents-env") == (0.01, None)


def test_the_prices_file_holds_names_and_prices_only() -> None:
    client, _, _ = a_client()
    client.create_runtime(
        name="speed", environment="ai-agents-env", time_reservation=10
    )
    text = environment_prices.prices_path().read_text()
    assert "api-key" not in text
    assert "jupyter-token" not in text
