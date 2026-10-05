# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application remembers (LOOP R-18), and forgetting it.

On a real mem0, its store a FAISS index in a temporary directory: the
memories are put in its vector store as mem0 keeps them — what it learned,
whose, of which agent, and when — since learning one asks a model. Then
read, and forgotten one by one or all at once, through `Mem0Backend` and
the runtime's routes, as the application's owner.
"""

import asyncio
import inspect
import json
import uuid
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.toolsets import FunctionToolset
from reactor import ContributionRegistry

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.loop.apps import plugins
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.memory import (
    agent_memory,
    app_memory,
    key_of,
    memory_key,
    remembering,
    remembers_with,
    withhold_for,
)
from agent_runtimes.memory import EphemeralMemory, MemoryCapability, get_memory_backend
from agent_runtimes.memory.capability import WITHHELD
from agent_runtimes.memory.mem0_backend import Mem0Backend
from agent_runtimes.routes import apps as routes

mem0 = pytest.importorskip("mem0")
pytest.importorskip("agentspecs.apps")

DIMS = 4

TRIAGE = {
    "schema": "loop.app/v1",
    "id": "inbox-triage",
    "name": "Inbox triage",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "memory": "mem0",
}


@pytest.fixture()
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """Give mem0 the config the runtime resolves, on a FAISS index of its own."""
    config = {
        "vector_store": {
            "provider": "faiss",
            "config": {
                "path": str(tmp_path / "faiss"),
                "collection_name": "memories",
                "embedding_model_dims": DIMS,
            },
        },
        # Never asked here: nothing is learned, only read and forgotten.
        "embedder": {"provider": "openai", "config": {"embedding_dims": DIMS}},
        "history_db_path": str(tmp_path / "history.db"),
    }
    monkeypatch.setenv("OPENAI_API_KEY", "sk-not-used")
    monkeypatch.setenv("MEM0_TELEMETRY", "False")
    monkeypatch.setenv("AGENT_RUNTIMES_MEM0_CONFIG_JSON", json.dumps(config))
    for name in ("AGENT_RUNTIMES_MEMORY_USER_ID", "DATALAYER_USER_HANDLE"):
        monkeypatch.delenv(name, raising=False)
    # The runtime's owner: whose memories it keeps.
    monkeypatch.setenv("DATALAYER_USER_UID", "ada")
    return config


def learned(
    backend: Mem0Backend, what: str, *, user: str, agent: str, when: str
) -> str:
    """A memory as mem0 keeps one it learned, put straight into its vector store."""
    memory = backend._ensure_initialized()
    memory_id = str(uuid.uuid4())
    memory.vector_store.insert(
        vectors=[[0.1, 0.2, 0.3, 0.4]],
        payloads=[
            {
                "data": what,
                "hash": uuid.uuid4().hex,
                "user_id": user,
                "agent_id": agent,
                "created_at": when,
            }
        ],
        ids=[memory_id],
    )
    return memory_id


@pytest.fixture()
def remembered(store: Dict[str, Any]) -> Dict[str, str]:
    """Keep Ada's memories of two applications, and Bob's of the first."""
    backend = app_memory(key_of("app-1"))
    return {
        "tone": learned(
            backend,
            "Prefers short replies",
            user="ada",
            agent="app:app-1",
            when="2026-10-01T09:00:00+00:00",
        ),
        "boss": learned(
            backend,
            "Mail from Grace is urgent",
            user="ada",
            agent="app:app-1",
            when="2026-10-03T09:00:00+00:00",
        ),
        "other_app": learned(
            backend,
            "Reports go out on Fridays",
            user="ada",
            agent="app:app-2",
            when="2026-10-02T09:00:00+00:00",
        ),
        "bob": learned(
            backend,
            "Bob reads in French",
            user="bob",
            agent="app:app-1",
            when="2026-10-04T09:00:00+00:00",
        ),
    }


def what(memories: List[Dict[str, Any]]) -> List[str]:
    return [str(entry.get("memory", entry.get("content"))) for entry in memories]


# --- Where an application remembers --------------------------------------------


def test_an_application_remembers_with_mem0_when_its_appspec_says_so() -> None:
    assert remembers_with(load_app(TRIAGE)) == "mem0"
    assert remembers_with(load_app({**TRIAGE, "memory": "mem0:0.0.1"})) == "mem0"
    # Its agent's memory is not its own; one not enabled is not had.
    assert remembers_with(load_app({**TRIAGE, "memory": ""})) == ""
    assert remembers_with(load_app({**TRIAGE, "memory": "ephemeral"})) == ""


def test_its_memories_are_kept_per_application_not_per_deployment() -> None:
    app = load_app(TRIAGE)
    preview = {"app_uid": "app-1"}
    deployment = {"app_uid": "app-1", "deployment_uid": "dep-9", "version": 3}
    assert memory_key(app, preview) == memory_key(app, deployment) == "app:app-1"
    # Run from its file, it has no item: its id.
    assert memory_key(app, None) == "app:inbox-triage"
    assert agent_memory(app, deployment) == (
        "mem0",
        {"datalayer": {"memory_agent_id": "app:app-1", "owner_only": True}},
    )
    assert agent_memory(load_app({**TRIAGE, "memory": ""}), deployment) == (
        "ephemeral",
        None,
    )
    with pytest.raises(ValueError):
        key_of(" ")


def test_its_agent_remembers_under_the_owner_and_its_key(
    store: Dict[str, Any],
) -> None:
    memory, config = agent_memory(load_app(TRIAGE), {"app_uid": "app-1"})
    spec = type(
        "Spec",
        (),
        {
            "model": "openai:gpt-4.1",
            "guardrails": None,
            "capabilities": None,
            "advanced": None,
            "subagents": None,
            "memory": memory,
            "memory_config": config,
        },
    )()
    capabilities = build_capabilities_from_agent_spec(spec, agent_id="inbox-triage")
    assert any(isinstance(c, MemoryCapability) for c in capabilities)
    backend = get_memory_backend("app:app-1")
    assert isinstance(backend, Mem0Backend)
    assert (backend.user_id, backend.agent_id) == ("ada", "app:app-1")
    [capability] = [c for c in capabilities if isinstance(c, MemoryCapability)]
    # Its owner's only: asked at each run.
    assert capability.gate is remembering


def _in_a_turn_opened_by(caller: Caller) -> bool:
    """Whether a turn of a session ``caller`` opened remembers, in its own task."""

    async def turn() -> bool:
        withhold_for(caller)
        return remembering()

    async def outside() -> bool:
        answered = await asyncio.get_running_loop().create_task(turn())
        # The turn's task carries its own answer; the rest of the runtime remembers.
        assert remembering() is True
        return answered

    return asyncio.run(outside())


def test_it_remembers_only_in_conversations_its_owner_opened(
    store: Dict[str, Any],
) -> None:
    assert _in_a_turn_opened_by(Caller(kind="person", uid="ada")) is True
    assert _in_a_turn_opened_by(Caller(kind="local")) is True
    assert _in_a_turn_opened_by(Caller(kind="person", uid="bob")) is False
    assert _in_a_turn_opened_by(Caller(kind="anonymous")) is False
    assert _in_a_turn_opened_by(Caller(kind="embed", app_uid="app-1")) is False
    # Outside a session — the scheduler's tick, as its owner — it remembers.
    assert remembering() is True


def test_a_withheld_conversation_reads_and_writes_nothing() -> None:
    class Kept(EphemeralMemory):
        asked = 0

        async def get_relevant_context(self, query: str, max_tokens: int = 2000) -> str:
            Kept.asked += 1
            return "## Relevant memories\n- Prefers short replies"

    backend = Kept(user_id="ada", agent_id="app:app-1")
    open_ = {"value": False}
    capability = MemoryCapability(
        backend=backend, agent_id="app:app-1", gate=lambda: open_["value"]
    )
    run: Any = type("Ctx", (), {"prompt": "What do I prefer?", "run_id": "r1"})()
    asyncio.run(capability.before_run(run))
    assert Kept.asked == 0
    toolset = capability.get_toolset()
    assert isinstance(toolset, FunctionToolset)
    tools = toolset.tools
    assert asyncio.run(tools["remember"].function("Bob reads in French")) == WITHHELD
    assert asyncio.run(tools["search_memory"].function("French")) == WITHHELD
    assert asyncio.run(backend.list_all()) == []
    open_["value"] = True
    asyncio.run(capability.before_run(run))
    assert Kept.asked == 1


# --- Mem0Backend on mem0 2.x -------------------------------------------------------


def test_mem0_is_asked_with_filters_as_its_api_takes_them() -> None:
    """mem0 2.x refuses `user_id` and `agent_id` beside `filters`: they go in them."""
    backend = Mem0Backend(user_id="ada", agent_id="app:app-1")
    asked: Dict[str, Any] = {}

    class Recording:
        def search(self, query: str, **kwargs: Any) -> Dict[str, Any]:
            inspect.signature(mem0.Memory.search).bind(self, query, **kwargs)
            asked["search"] = kwargs
            return {"results": [{"id": "m1", "memory": "Prefers short replies"}]}

    backend._memory = Recording()
    found = asyncio.run(backend.search("tone", limit=3))
    assert asked["search"] == {
        "top_k": 3,
        "filters": {"user_id": "ada", "agent_id": "app:app-1"},
    }
    assert found[0]["content"] == "Prefers short replies"


def test_it_lists_what_it_remembers_of_its_owner_newest_first(
    remembered: Dict[str, str],
) -> None:
    listed = asyncio.run(app_memory(key_of("app-1")).list_all())
    assert what(listed) == ["Mail from Grace is urgent", "Prefers short replies"]
    assert listed[0]["created_at"] == "2026-10-03T09:00:00+00:00"
    assert listed[0]["id"] == remembered["boss"]


def test_forgetting_one_reaches_only_its_own(remembered: Dict[str, str]) -> None:
    backend = app_memory(key_of("app-1"))
    # Bob's, and another application's, are not found by their id.
    assert asyncio.run(backend.forget(remembered["bob"])) is False
    assert asyncio.run(backend.forget(remembered["other_app"])) is False
    assert asyncio.run(backend.forget(str(uuid.uuid4()))) is False
    assert asyncio.run(backend.forget(remembered["tone"])) is True
    assert what(asyncio.run(backend.list_all())) == ["Mail from Grace is urgent"]
    assert what(asyncio.run(app_memory(key_of("app-2")).list_all())) == [
        "Reports go out on Fridays"
    ]


def test_forgetting_everything_counts_and_keeps_the_rest(
    remembered: Dict[str, str],
) -> None:
    assert asyncio.run(app_memory(key_of("app-1")).forget_all(batch=1)) == 2
    assert asyncio.run(app_memory(key_of("app-1")).list_all()) == []
    assert what(asyncio.run(app_memory(key_of("app-2")).list_all())) == [
        "Reports go out on Fridays"
    ]
    bobs = Mem0Backend(user_id="bob", agent_id="app:app-1", config=None)
    bobs._memory = app_memory(key_of("app-1"))._ensure_initialized()
    assert what(asyncio.run(bobs.list_all())) == ["Bob reads in French"]


# --- The routes, as its owner -------------------------------------------------------


class Verifier:
    """Each token is the person it names."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        return Caller(kind="person", uid=token)


@pytest.fixture()
def remote(
    remembered: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    monkeypatch.setattr(plugins, "REGISTRY", ContributionRegistry())
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        yield client


def as_(person: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {person}"}


def test_its_owner_reads_what_it_remembers(
    remote: TestClient, remembered: Dict[str, str]
) -> None:
    answer = remote.get("/api/v1/apps/memories/app-1", headers=as_("ada"))
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert (body["app"], body["count"]) == ("app-1", 2)
    assert body["memories"][0] == {
        "id": remembered["boss"],
        "memory": "Mail from Grace is urgent",
        "created_at": "2026-10-03T09:00:00+00:00",
        "updated_at": None,
    }


def test_nobody_else_reads_or_forgets_them(
    remote: TestClient, remembered: Dict[str, str]
) -> None:
    assert remote.get("/api/v1/apps/memories/app-1").status_code == 401
    refused = remote.get("/api/v1/apps/memories/app-1", headers=as_("bob"))
    assert refused.status_code == 403
    assert "its owner" in refused.json()["detail"]
    assert (
        remote.delete(
            f"/api/v1/apps/memories/app-1/{remembered['tone']}", headers=as_("bob")
        ).status_code
        == 403
    )
    assert (
        remote.delete("/api/v1/apps/memories/app-1?count=9", headers=as_("bob"))
    ).status_code == 403
    still = remote.get("/api/v1/apps/memories/app-1", headers=as_("ada")).json()
    assert still["count"] == 2


def test_its_owner_forgets_one_thing(
    remote: TestClient, remembered: Dict[str, str]
) -> None:
    gone = remote.delete(
        f"/api/v1/apps/memories/app-1/{remembered['tone']}", headers=as_("ada")
    )
    assert (gone.status_code, gone.json()) == (200, {"forgotten": 1})
    # Another application's is not this one's to forget.
    other = remote.delete(
        f"/api/v1/apps/memories/app-1/{remembered['other_app']}", headers=as_("ada")
    )
    assert other.status_code == 404
    left = remote.get("/api/v1/apps/memories/app-1", headers=as_("ada")).json()
    assert what(left["memories"]) == ["Mail from Grace is urgent"]


def test_forgetting_everything_forgets_no_more_than_was_confirmed(
    remote: TestClient, remembered: Dict[str, str]
) -> None:
    more = remote.delete("/api/v1/apps/memories/app-1?count=1", headers=as_("ada"))
    assert more.status_code == 409
    assert "Nothing was forgotten" in more.json()["detail"]
    assert (
        remote.get("/api/v1/apps/memories/app-1", headers=as_("ada")).json()["count"]
        == 2
    )
    done = remote.delete("/api/v1/apps/memories/app-1?count=2", headers=as_("ada"))
    assert (done.status_code, done.json()) == (200, {"forgotten": 2})
    assert (
        remote.get("/api/v1/apps/memories/app-1", headers=as_("ada")).json()["count"]
        == 0
    )
    # The other application remembers what it did.
    assert (
        remote.get("/api/v1/apps/memories/app-2", headers=as_("ada")).json()["count"]
        == 1
    )
