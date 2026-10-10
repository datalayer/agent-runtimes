# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application remembers (LOOP R-18), forgetting it, correcting it
in place (LOOP R-34), each person apart (LOOP R-36), and what another
remembers, read when the person allows it (LOOP R-35).

On a real mem0, its store a FAISS index in a temporary directory: the
memories are put in its vector store as mem0 keeps them — what it learned,
whose, of which agent, and when — since learning one asks a model. Then
read, corrected, and forgotten one by one or all at once, through
`Mem0Backend` and the runtime's routes, as the application's owner. A
correction is embedded again: the embedder answers a fixed vector here.
"""

import asyncio
import inspect
import json
import uuid
from pathlib import Path
from typing import Any, Dict, Iterator, List

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.toolsets import FunctionToolset
from reactor import PluginPlatform

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.loop.apps import memory as app_memories
from agent_runtimes.loop.apps import plugins
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.memory import (
    EMBEDDED,
    NOT_SIGNED_IN,
    AppMemory,
    SharesUnread,
    agent_memory,
    app_memory,
    key_of,
    memory_key,
    remember_for,
    rememberer,
    remembers_with,
    withheld,
)
from agent_runtimes.memory import EphemeralMemory, MemoryCapability, get_memory_backend
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
                # A search scores by similarity: a fixed question finds all.
                "distance_strategy": "cosine",
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
    backend = app_memory(key_of("app-1"), "ada")
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
        {"datalayer": {"memory_agent_id": "app:app-1", "app_memory": True}},
    )
    assert agent_memory(load_app({**TRIAGE, "memory": ""}), deployment) == (
        "ephemeral",
        None,
    )
    with pytest.raises(ValueError):
        key_of(" ")


def test_its_agent_remembers_under_its_key_for_whoever_the_turn_is_of(
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
    assert isinstance(backend, AppMemory)
    assert backend.key == "app:app-1"
    [capability] = [c for c in capabilities if isinstance(c, MemoryCapability)]
    # Whether the turn remembers is asked at each run.
    assert capability.withheld is withheld


def _in_a_turn_opened_by(caller: Caller) -> tuple[str, str]:
    """Whose memories a turn of a session ``caller`` opened reaches, in its own task."""

    async def turn() -> tuple[str, str]:
        remember_for(caller, "")
        return rememberer().user_id, withheld()

    async def outside() -> tuple[str, str]:
        answered = await asyncio.get_running_loop().create_task(turn())
        # The turn's task carries its own answer; the rest of the runtime is the owner's.
        assert (rememberer().user_id, withheld()) == ("ada", "")
        return answered

    return asyncio.run(outside())


def test_it_remembers_each_person_apart_and_never_a_visitor_as_its_owner(
    store: Dict[str, Any],
) -> None:
    assert _in_a_turn_opened_by(Caller(kind="person", uid="ada")) == ("ada", "")
    assert _in_a_turn_opened_by(Caller(kind="local")) == ("ada", "")
    # A visitor signed in, under their own identity (LOOP R-36).
    assert _in_a_turn_opened_by(Caller(kind="person", uid="bob")) == ("bob", "")
    # Nobody known: nothing remembered, said — never the owner's.
    assert _in_a_turn_opened_by(Caller(kind="visitor", uid="tab-0001-visitor")) == (
        "",
        NOT_SIGNED_IN,
    )
    assert _in_a_turn_opened_by(Caller(kind="person", uid="")) == ("", NOT_SIGNED_IN)
    assert _in_a_turn_opened_by(Caller(kind="embed", uid="ada", app_uid="app-1")) == (
        "",
        EMBEDDED,
    )
    # Outside a session — the scheduler's tick, as its owner — it remembers.
    assert (rememberer().user_id, withheld()) == ("ada", "")


def test_a_withheld_conversation_reads_and_writes_nothing() -> None:
    class Kept(EphemeralMemory):
        asked = 0

        async def get_relevant_context(self, query: str, max_tokens: int = 2000) -> str:
            Kept.asked += 1
            return "## Relevant memories\n- Prefers short replies"

    backend = Kept(user_id="ada", agent_id="app:app-1")
    why = {"value": NOT_SIGNED_IN}
    capability = MemoryCapability(
        backend=backend, agent_id="app:app-1", withheld=lambda: why["value"]
    )
    run: Any = type("Ctx", (), {"prompt": "What do I prefer?", "run_id": "r1"})()
    asyncio.run(capability.before_run(run))
    assert Kept.asked == 0
    toolset = capability.get_toolset()
    assert isinstance(toolset, FunctionToolset)
    tools = toolset.tools
    assert (
        asyncio.run(tools["remember"].function("Bob reads in French")) == NOT_SIGNED_IN
    )
    assert asyncio.run(tools["search_memory"].function("French")) == NOT_SIGNED_IN
    assert asyncio.run(backend.list_all()) == []
    why["value"] = ""
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
    listed = asyncio.run(app_memory(key_of("app-1"), "ada").list_all())
    assert what(listed) == ["Mail from Grace is urgent", "Prefers short replies"]
    assert listed[0]["created_at"] == "2026-10-03T09:00:00+00:00"
    assert listed[0]["id"] == remembered["boss"]


def test_forgetting_one_reaches_only_its_own(remembered: Dict[str, str]) -> None:
    backend = app_memory(key_of("app-1"), "ada")
    # Bob's, and another application's, are not found by their id.
    assert asyncio.run(backend.forget(remembered["bob"])) is False
    assert asyncio.run(backend.forget(remembered["other_app"])) is False
    assert asyncio.run(backend.forget(str(uuid.uuid4()))) is False
    assert asyncio.run(backend.forget(remembered["tone"])) is True
    assert what(asyncio.run(backend.list_all())) == ["Mail from Grace is urgent"]
    assert what(asyncio.run(app_memory(key_of("app-2"), "ada").list_all())) == [
        "Reports go out on Fridays"
    ]


def test_forgetting_everything_counts_and_keeps_the_rest(
    remembered: Dict[str, str],
) -> None:
    assert asyncio.run(app_memory(key_of("app-1"), "ada").forget_all(batch=1)) == 2
    assert asyncio.run(app_memory(key_of("app-1"), "ada").list_all()) == []
    assert what(asyncio.run(app_memory(key_of("app-2"), "ada").list_all())) == [
        "Reports go out on Fridays"
    ]
    bobs = Mem0Backend(user_id="bob", agent_id="app:app-1", config=None)
    bobs._memory = app_memory(key_of("app-1"), "ada")._ensure_initialized()
    assert what(asyncio.run(bobs.list_all())) == ["Bob reads in French"]


CORRECTED_VECTOR = [0.4, 0.3, 0.2, 0.1]


def embeds_corrections(backend: Mem0Backend) -> List[str]:
    """Answer a fixed vector for what mem0 embeds again; the words it was asked for."""
    asked: List[str] = []
    memory = backend._ensure_initialized()

    def embed(text: str, action: Any = None) -> List[float]:
        asked.append(text)
        return CORRECTED_VECTOR

    memory.embedding_model.embed = embed
    return asked


def test_correcting_one_changes_its_words_and_keeps_who_and_when(
    remembered: Dict[str, str],
) -> None:
    backend = app_memory(key_of("app-1"), "ada")
    asked = embeds_corrections(backend)
    # Bob's, and another application's, are not found by their id.
    assert asyncio.run(backend.correct(remembered["bob"], "x", "ada")) is None
    assert asyncio.run(backend.correct(remembered["other_app"], "x", "ada")) is None
    corrected = asyncio.run(
        backend.correct(remembered["boss"], "Mail from Alan is urgent", "ada")
    )
    assert corrected is not None
    assert corrected["content"] == "Mail from Alan is urgent"
    assert corrected["metadata"]["corrected_by"] == "ada"
    assert corrected["metadata"]["corrected_at"]
    # When it was learned stays; its words are embedded again.
    assert corrected["created_at"] == "2026-10-03T09:00:00+00:00"
    assert "Mail from Alan is urgent" in asked
    stored = backend._ensure_initialized().vector_store.get(remembered["boss"])
    assert stored.payload["agent_id"] == "app:app-1"
    assert what(asyncio.run(backend.list_all())) == [
        "Mail from Alan is urgent",
        "Prefers short replies",
    ]


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

    monkeypatch.setattr(plugins, "PLATFORM", PluginPlatform())
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
        "corrected_by": None,
        "corrected_at": None,
    }


def test_a_visitor_reads_and_forgets_only_their_own(
    remote: TestClient, remembered: Dict[str, str]
) -> None:
    assert remote.get("/api/v1/apps/memories/app-1").status_code == 401
    # Bob, a visitor, reads what it remembers of him — not of its owner (LOOP R-36).
    his = remote.get("/api/v1/apps/memories/app-1", headers=as_("bob"))
    assert his.status_code == 200, his.text
    assert what(his.json()["memories"]) == ["Bob reads in French"]
    assert (
        remote.delete(
            f"/api/v1/apps/memories/app-1/{remembered['tone']}", headers=as_("bob")
        ).status_code
        == 404
    )
    assert (
        remote.patch(
            f"/api/v1/apps/memories/app-1/{remembered['tone']}",
            json={"memory": "x"},
            headers=as_("bob"),
        ).status_code
        == 404
    )
    # Forgetting everything, he forgets his own: one thing.
    gone = remote.delete("/api/v1/apps/memories/app-1?count=1", headers=as_("bob"))
    assert (gone.status_code, gone.json()) == (200, {"forgotten": 1})
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


def test_its_owner_corrects_one_thing_and_nobody_else_does(
    remote: TestClient, remembered: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from mem0.embeddings.openai import OpenAIEmbedding

    # Each request reaches the store with a mem0 of its own: its embedder answers.
    monkeypatch.setattr(
        OpenAIEmbedding, "embed", lambda self, text, action=None: CORRECTED_VECTOR
    )
    url = f"/api/v1/apps/memories/app-1/{remembered['tone']}"
    assert (
        remote.patch(url, json={"memory": "x"}, headers=as_("bob")).status_code == 404
    )
    empty = remote.patch(url, json={"memory": "  "}, headers=as_("ada"))
    assert empty.status_code == 422
    assert "it is empty" in empty.json()["detail"]
    other = remote.patch(
        f"/api/v1/apps/memories/app-1/{remembered['other_app']}",
        json={"memory": "x"},
        headers=as_("ada"),
    )
    assert other.status_code == 404
    done = remote.patch(
        url, json={"memory": " Prefers  long replies "}, headers=as_("ada")
    )
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["corrected"] == 1
    assert body["memory"]["memory"] == "Prefers long replies"
    assert body["memory"]["corrected_by"] == "ada"
    listed = remote.get("/api/v1/apps/memories/app-1", headers=as_("ada")).json()
    [tone] = [
        entry for entry in listed["memories"] if entry["id"] == remembered["tone"]
    ]
    assert (tone["memory"], tone["corrected_by"]) == ("Prefers long replies", "ada")


# --- Its agent, for each person apart (LOOP R-36), and shared as allowed (R-35) -----


@pytest.fixture()
def embeds(monkeypatch: pytest.MonkeyPatch) -> None:
    """A search embeds the question: a fixed vector, near every memory kept here."""
    from mem0.embeddings.openai import OpenAIEmbedding

    monkeypatch.setattr(
        OpenAIEmbedding, "embed", lambda self, text, action=None: [0.1, 0.2, 0.3, 0.4]
    )


def found_by(
    caller: Caller, token: str = "", key: str = "app:app-1"
) -> List[Dict[str, Any]]:
    """What the agent of an application finds in a turn of a session ``caller`` opened."""

    async def turn() -> List[Dict[str, Any]]:
        remember_for(caller, token)
        return await AppMemory(key).search("What do you know of me?", limit=10)

    return asyncio.run(turn())


def test_its_agent_finds_what_it_remembers_of_whoever_opened_the_session(
    remembered: Dict[str, str], embeds: None
) -> None:
    assert sorted(what(found_by(Caller(kind="person", uid="ada")))) == [
        "Mail from Grace is urgent",
        "Prefers short replies",
    ]
    # A visitor at its address: his own, apart from its owner's (LOOP R-36).
    assert what(found_by(Caller(kind="person", uid="bob"))) == ["Bob reads in French"]
    assert what(found_by(Caller(kind="person", uid="carol"))) == []


def test_what_it_learns_of_a_visitor_is_kept_under_the_visitor(
    store: Dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    kept: List[tuple[str, str]] = []

    async def add(self: Mem0Backend, messages: list, metadata: Any = None) -> None:
        kept.append((self.user_id, str(self.agent_id)))

    monkeypatch.setattr(Mem0Backend, "add", add)

    async def turn(caller: Caller) -> None:
        remember_for(caller, "")
        await AppMemory("app:app-1").add([{"role": "user", "content": "Call me Bo"}])

    asyncio.run(turn(Caller(kind="person", uid="bob")))
    asyncio.run(turn(Caller(kind="local")))
    assert kept == [("bob", "app:app-1"), ("ada", "app:app-1")]


def test_a_visitor_nobody_knows_has_nothing_remembered_nor_read(
    remembered: Dict[str, str], embeds: None
) -> None:
    capability = app_memories.app_memory_capability("app:app-1")
    toolset = capability.get_toolset()
    assert isinstance(toolset, FunctionToolset)

    async def turn(caller: Caller) -> tuple[str, str]:
        remember_for(caller, "")
        tools = toolset.tools
        return (
            await tools["search_memory"].function("replies"),
            await tools["remember"].function("Likes tea"),
        )

    assert asyncio.run(turn(Caller(kind="visitor", uid="tab-0001-visitor"))) == (
        NOT_SIGNED_IN,
        NOT_SIGNED_IN,
    )
    assert asyncio.run(turn(Caller(kind="embed", uid="ada", app_uid="app-1"))) == (
        EMBEDDED,
        EMBEDDED,
    )
    # Never its owner's in their place.
    with pytest.raises(app_memories.MemoryNotKept):
        found_by(Caller(kind="visitor", uid="tab-0001-visitor"))


@pytest.fixture()
def shares(monkeypatch: pytest.MonkeyPatch) -> Dict[str, List[Any]]:
    """The runtimes service: what each token's person allowed, and what it was asked."""
    service: Dict[str, List[Any]] = {"allowed": [], "asked": []}

    async def ask(url: str, token: str) -> List[Dict[str, Any]]:
        service["asked"].append((url, token))
        reader = str(httpx.URL(url).params.get("reader"))
        return [
            {"source": share["source"], "reader": share["reader"]}
            for share in service["allowed"]
            if share["user"] == token and share["reader"] == reader
        ]

    monkeypatch.setitem(app_memories._asker, "ask", ask)
    monkeypatch.setenv("DATALAYER_RUNTIMES_URL", "https://runtimes.example/")
    return service


def _allow(shares: Dict[str, List[Any]], user: str, source: str, reader: str) -> None:
    shares["allowed"].append({"user": user, "source": source, "reader": reader})


def test_it_reads_another_application_only_when_the_person_allows_it(
    remembered: Dict[str, str], embeds: None, shares: Dict[str, List[Any]]
) -> None:
    ada = Caller(kind="person", uid="ada")
    # Not allowed: its own only.
    assert "Reports go out on Fridays" not in what(found_by(ada, "ada"))
    _allow(shares, "ada", "app:app-2", "app:app-1")
    # Allowed by somebody else, or for another application: not Ada's allowance.
    _allow(shares, "bob", "app:app-3", "app:app-1")
    found = found_by(ada, "ada")
    # Its own first, then what the application allowed remembers of Ada.
    assert sorted(what(found[:2])) == [
        "Mail from Grace is urgent",
        "Prefers short replies",
    ]
    assert what(found[2:]) == ["Reports go out on Fridays"]
    assert found[2]["metadata"]["remembered_by"] == "app:app-2"
    # Read with the caller's token, at the runtimes service.
    assert shares["asked"][-1] == (
        "https://runtimes.example/api/runtimes/v1/memory-shares?reader=app%3Aapp-1",
        "ada",
    )
    # Another application Ada allowed nothing reads only its own.
    assert what(found_by(ada, "ada", key="app:app-2")) == ["Reports go out on Fridays"]
    # Bob's allowance reads Bob's memories, never Ada's.
    assert what(found_by(Caller(kind="person", uid="bob"), "bob")) == [
        "Bob reads in French"
    ]


def test_without_a_token_it_reads_its_own_and_an_unknown_service_is_said(
    remembered: Dict[str, str],
    embeds: None,
    shares: Dict[str, List[Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow(shares, "ada", "app:app-2", "app:app-1")
    # The machine itself, or a run outside a session: no allowance is read.
    assert "Reports go out on Fridays" not in what(found_by(Caller(kind="local")))
    monkeypatch.delenv("DATALAYER_RUNTIMES_URL")
    with pytest.raises(SharesUnread, match="DATALAYER_RUNTIMES_URL"):
        found_by(Caller(kind="person", uid="ada"), "ada")
