# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent run on a person's own machine remembers on Datalayer with their key.

The backend against the runtimes service stubbed; the registry's choice of
it; and the ``loop`` picker, which offers an agent whose MCP servers lack
their credentials, and reads a versioned env var reference by its name.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from agent_runtimes.memory import registry
from agent_runtimes.memory.config import MemoryNotConfigured
from agent_runtimes.memory.datalayer_backend import DatalayerMemory


class Service:
    """The runtimes service's memories, one person's, kept in a list."""

    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.rows: list[dict] = []
        self.seen: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": "Invalid token"})
        path = request.url.path
        assert path.startswith("/api/runtimes/v1/memories")
        rest = path[len("/api/runtimes/v1/memories") :]
        if request.method == "POST" and rest == "":
            body = json.loads(request.content)
            row = {
                "id": f"m{len(self.rows) + 1}",
                "memory": body["content"],
                "user_id": "ada",
                "agent_id": body["agent_id"],
                "created_at": f"2026-11-10T0{len(self.rows)}:00:00+00:00",
                "metadata": {},
            }
            self.rows.append(row)
            return httpx.Response(200, json={"success": True, "memory": row})
        if request.method == "POST" and rest == "/search":
            body = json.loads(request.content)
            found = [
                {**row, "score": 0.9}
                for row in self.rows
                if row["agent_id"] == body["agent_id"]
                and any(
                    w in row["memory"].lower() for w in body["query"].lower().split()
                )
            ]
            return httpx.Response(200, json={"results": found[: body["limit"]]})
        if request.method == "GET":
            agent = request.url.params["agent_id"]
            mine = [row for row in reversed(self.rows) if row["agent_id"] == agent]
            return httpx.Response(200, json={"memories": mine})
        if request.method == "DELETE" and rest.startswith("/"):
            memory_id = rest[1:]
            before = len(self.rows)
            self.rows = [row for row in self.rows if row["id"] != memory_id]
            if len(self.rows) == before:
                return httpx.Response(404, json={"detail": "not found"})
            return httpx.Response(200, json={"forgotten": 1})
        if request.method == "DELETE":
            agent = request.url.params["agent_id"]
            gone = [row for row in self.rows if row["agent_id"] == agent]
            assert int(request.url.params["count"]) == len(gone)
            self.rows = [row for row in self.rows if row["agent_id"] != agent]
            return httpx.Response(200, json={"forgotten": len(gone)})
        if request.method == "PATCH":
            memory_id = rest[1:]
            for row in self.rows:
                if row["id"] == memory_id:
                    row["memory"] = json.loads(request.content)["memory"]
                    return httpx.Response(200, json={"memory": row})
            return httpx.Response(404, json={"detail": "not found"})
        raise AssertionError(f"unexpected {request.method} {path}")


def _backend(
    service: Service, agent_id: str = "worker-marketer", key: str = "ada-key"
) -> DatalayerMemory:
    return DatalayerMemory(
        agent_id=agent_id,
        api_key=key,
        base_url="https://runtimes.example",
        transport=httpx.MockTransport(service),
    )


def test_it_keeps_finds_lists_corrects_and_forgets_the_persons_own():
    service = Service()
    memory = _backend(service)
    other = _backend(service, agent_id="other-agent")

    async def run():
        await memory.add([{"role": "user", "content": "  Brand mascot is   Quill "}])
        await memory.add(
            [{"role": "user", "content": "No posts on Sundays"}],
            metadata={"source": "loop"},
        )
        await other.add([{"role": "user", "content": "Mascot is a fox"}])
        found = await memory.search("mascot")
        listed = await memory.list_all()
        corrected = await memory.correct(
            "m1", "Brand mascot is Quill the octopus", corrected_by="ada"
        )
        # Another agent's memory is not this agent's to forget or correct.
        assert await memory.forget("m3") is False
        assert await memory.correct("m3", "x", corrected_by="ada") is None
        assert await memory.forget("m2") is True
        return found, listed, corrected, await memory.forget_all()

    found, listed, corrected, forgotten = asyncio.run(run())
    assert [m["content"] for m in found] == ["Brand mascot is Quill"]
    assert found[0]["score"] == 0.9
    assert [m["content"] for m in listed] == [
        "No posts on Sundays",
        "Brand mascot is Quill",
    ]
    assert corrected["content"] == "Brand mascot is Quill the octopus"
    assert forgotten == 1
    assert [row["agent_id"] for row in service.rows] == ["other-agent"]
    assert memory.user_id == "ada"
    # The key is the bearer; the person is never sent, only the agent.
    first = service.seen[0]
    assert first.headers["Authorization"] == "Bearer ada-key"
    assert json.loads(first.content) == {
        "agent_id": "worker-marketer",
        "content": "Brand mascot is Quill",
        "metadata": None,
    }


def test_a_refused_key_is_said_in_a_sentence():
    memory = _backend(Service(status=401))
    with pytest.raises(MemoryNotConfigured) as refused:
        asyncio.run(memory.list_all())
    assert "DATALAYER_API_KEY" in str(refused.value)


def test_without_a_key_nothing_is_asked():
    service = Service()
    memory = _backend(service, key="")
    with pytest.raises(MemoryNotConfigured):
        asyncio.run(memory.add([{"role": "user", "content": "x"}]))
    assert service.seen == []


def test_an_empty_search_asks_nothing():
    service = Service()
    assert asyncio.run(_backend(service).search("   ")) == []
    assert service.seen == []


def test_on_a_persons_machine_with_a_key_mem0_remembers_on_datalayer(monkeypatch):
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    monkeypatch.setenv("DATALAYER_API_KEY", "ada-key")
    monkeypatch.setenv("DATALAYER_RUNTIMES_URL", "https://runtimes.example/")
    backend = registry.create_memory_backend(
        "mem0", user_id="default", agent_id="worker-marketer"
    )
    assert isinstance(backend, DatalayerMemory)
    assert (backend.agent_id, backend.base_url) == (
        "worker-marketer",
        "https://runtimes.example",
    )


def test_on_a_datalayer_pod_or_without_a_key_mem0_stays(monkeypatch):
    monkeypatch.setenv("DATALAYER_API_KEY", "ada-key")
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")
    pod = registry.create_memory_backend(
        "mem0", user_id="ada", agent_id="worker-marketer"
    )
    assert not isinstance(pod, DatalayerMemory)
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST")
    monkeypatch.delenv("DATALAYER_API_KEY")
    local = registry.create_memory_backend(
        "mem0", user_id="default", agent_id="worker-marketer"
    )
    assert not isinstance(local, DatalayerMemory)


def test_the_picker_offers_the_marketer_without_its_social_credentials(monkeypatch):
    from agent_runtimes.chat import cli

    assert "worker-marketer" in cli.enabled_agentspec_ids()
    for name in (
        "X_BEARER_TOKEN",
        "BLUESKY_HANDLE",
        "LINKEDIN_ACCESS_TOKEN",
        "DISCORD_BOT_TOKEN",
    ):
        monkeypatch.delenv(name, raising=False)
    spec = SimpleNamespace(
        enabled=True,
        model="",
        mcp_servers=[SimpleNamespace(required_env_vars=["X_BEARER_TOKEN:0.0.1"])],
    )
    assert cli._spec_has_valid_env(spec, set()) is True
    assert (
        cli._spec_has_valid_env(
            SimpleNamespace(**{**vars(spec), "enabled": False}), set()
        )
        is False
    )
    assert cli._env_var_name("DATALAYER_API_KEY:0.0.1") == "DATALAYER_API_KEY"
    assert cli._env_var_name("DATALAYER_API_KEY") == "DATALAYER_API_KEY"
