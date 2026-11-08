# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The routes an agent's durable memory is kept, read, listed and forgotten through.

What the memory skills of datalayer-skills call from the sandbox: they keep
and forget in the backend's own scope (the runtime owner, the agent), never
in one the caller names.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.memory import (
    BaseMemoryBackend,
    register_memory_backend,
    unregister_memory_backend,
)
from agent_runtimes.memory.config import MemoryNotConfigured
from agent_runtimes.routes.agents import router


class FakeMemory(BaseMemoryBackend):
    """An in-memory backend with mem0's forget and forget_all."""

    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []
        self.refusal: str = ""

    async def add(
        self, messages: list[dict], metadata: dict[str, Any] | None = None
    ) -> None:
        if self.refusal:
            raise MemoryNotConfigured(self.refusal)
        for message in messages:
            self.entries.append(
                {
                    "id": f"m{len(self.entries) + 1}",
                    "content": message["content"],
                    "metadata": metadata or {},
                }
            )

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return [e for e in self.entries if query.lower() in e["content"].lower()][
            :limit
        ]

    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        return list(reversed(self.entries))[:limit]

    async def forget(self, memory_id: str) -> bool:
        kept = [e for e in self.entries if e["id"] != memory_id]
        found = len(kept) != len(self.entries)
        self.entries = kept
        return found

    async def forget_all(self) -> int:
        forgotten = len(self.entries)
        self.entries = []
        return forgotten


@pytest.fixture
def memory() -> Any:
    backend = FakeMemory()
    register_memory_backend("crawler", backend)
    yield backend
    unregister_memory_backend("crawler")


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def test_a_memory_is_kept_in_its_words_and_listed_and_searched(memory, client) -> None:
    kept = client.post(
        "/api/v1/agents/crawler/memory",
        json={
            "content": "  prefers   answers in French ",
            "metadata": {"source": "skill"},
        },
    )
    assert kept.status_code == 200, kept.text
    assert kept.json() == {"added": 1, "content": "prefers answers in French"}
    assert memory.entries[0]["metadata"] == {"source": "skill"}
    listed = client.get("/api/v1/agents/crawler/memory").json()["memories"]
    assert [e["content"] for e in listed] == ["prefers answers in French"]
    found = client.post(
        "/api/v1/agents/crawler/memory/search", json={"query": "french"}
    )
    assert [e["id"] for e in found.json()["results"]] == ["m1"]


def test_an_empty_or_too_long_memory_is_refused(memory, client) -> None:
    assert (
        client.post("/api/v1/agents/crawler/memory", json={"content": "  "}).status_code
        == 422
    )
    too_long = client.post(
        "/api/v1/agents/crawler/memory", json={"content": "x" * 2001}
    )
    assert too_long.status_code == 422
    assert memory.entries == []


def test_an_agent_without_durable_memory_is_not_found(client) -> None:
    refused = client.post("/api/v1/agents/nobody/memory", json={"content": "a fact"})
    assert refused.status_code == 404
    assert "no durable memory" in refused.json()["detail"]


def test_a_memory_that_cannot_be_kept_here_says_why(memory, client) -> None:
    memory.refusal = "Memories cannot be kept on this runtime: no PostgreSQL."
    refused = client.post("/api/v1/agents/crawler/memory", json={"content": "a fact"})
    assert refused.status_code == 409
    assert refused.json()["detail"] == memory.refusal


def test_one_memory_is_forgotten_and_an_unknown_one_is_not_found(
    memory, client
) -> None:
    client.post("/api/v1/agents/crawler/memory", json={"content": "first"})
    client.post("/api/v1/agents/crawler/memory", json={"content": "second"})
    assert client.delete("/api/v1/agents/crawler/memory/m1").json() == {"forgotten": 1}
    assert [e["content"] for e in memory.entries] == ["second"]
    assert client.delete("/api/v1/agents/crawler/memory/m1").status_code == 404


def test_everything_is_forgotten_only_up_to_the_confirmed_count(memory, client) -> None:
    for words in ("one", "two", "three"):
        client.post("/api/v1/agents/crawler/memory", json={"content": words})
    # The memory route, never the deletion of the agent (DELETE /{agent_id:path}).
    assert client.delete("/api/v1/agents/crawler/memory").status_code == 422
    refused = client.delete("/api/v1/agents/crawler/memory", params={"count": 2})
    assert refused.status_code == 409
    assert len(memory.entries) == 3
    done = client.delete("/api/v1/agents/crawler/memory", params={"count": 3})
    assert done.json() == {"forgotten": 3}
    assert memory.entries == []
