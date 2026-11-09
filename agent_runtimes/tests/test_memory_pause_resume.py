# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's memories outlive its runtime.

Pausing an agent stops its runtime; resuming it launches a new one, with a
new uid, for the same agent and user. The memories are kept in PostgreSQL
(pgvector) under the user and the agent's own id — its agentspec's, never
the runtime's — so the new runtime reads back what the old one was told,
and another user reads none of it.

On a Datalayer runtime mem0 embeds through ai-inference with the runtime's
token, and adds what the model chose to remember as it said it.

The last tests run mem0 itself against a real PostgreSQL with pgvector, in a
container started for them, on the table the platform creates; they are
skipped, saying why, where no container can be started.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import shutil
import socket
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Iterator, List

import pytest

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.memory import (
    MemoryCapability,
    create_memory_backend,
    get_memory_backend,
)
from agent_runtimes.memory import config as memory_config
from agent_runtimes.memory.config import MemoryNotConfigured
from agent_runtimes.memory.mem0_backend import Mem0Backend

BRAND_FACT = "Our brand voice is playful and we never use emojis."
TOKEN = "runtime-token-" + uuid.uuid4().hex


# ── A Datalayer runtime: PostgreSQL configured, inference through ai-inference ──


@pytest.fixture()
def datalayer_runtime(monkeypatch: pytest.MonkeyPatch) -> Dict[str, str]:
    """A runtime routing its inference through ai-inference, its token given."""
    from agent_runtimes.models import models, offered

    token = {"value": TOKEN}
    monkeypatch.setattr(models, "effective_inference_provider", lambda: "datalayer")
    monkeypatch.setattr(offered, "inference_token", lambda: token["value"])
    monkeypatch.setenv(
        "DATALAYER_AI_INFERENCE_URL", "http://ai-inference.test/api/ai-inference"
    )
    monkeypatch.setenv(
        "DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI",
        "postgres://mem0:secret@pg.test:5432/mem0",
    )
    monkeypatch.delenv("AGENT_RUNTIMES_MEM0_CONFIG_JSON", raising=False)
    monkeypatch.delenv("AGENT_RUNTIMES_MEM0_EMBEDDING_MODEL", raising=False)
    return token


def test_a_runtime_keeps_memories_in_postgres_and_embeds_through_ai_inference(
    datalayer_runtime: Dict[str, str],
) -> None:
    resolved = memory_config.resolve_mem0_config("u1", "worker-marketer")
    assert resolved is not None
    store = resolved["vector_store"]
    assert store["provider"] == "pgvector"
    assert store["config"]["collection_name"] == "agent_memories"
    assert store["config"]["embedding_model_dims"] == 1536
    for part in ("embedder", "llm"):
        called = resolved[part]["config"]
        assert (
            called["openai_base_url"] == "http://ai-inference.test/api/ai-inference/v1"
        )
        assert called["api_key"] == TOKEN
    assert (
        resolved["embedder"]["config"]["model"] == "bedrock:amazon.titan-embed-text-v1"
    )
    assert resolved["embedder"]["config"]["embedding_dims"] == 1536
    assert resolved["history_db_path"] == ":memory:"


def test_a_runtime_without_postgres_is_refused_never_given_a_local_store(
    datalayer_runtime: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI", raising=False)
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", raising=False)
    with pytest.raises(MemoryNotConfigured, match="no PostgreSQL is configured"):
        memory_config.resolve_mem0_config("u1", "worker-marketer")


def test_a_runtime_without_its_token_is_refused(
    datalayer_runtime: Dict[str, str],
) -> None:
    datalayer_runtime["value"] = ""
    with pytest.raises(MemoryNotConfigured, match="no ai-inference token"):
        memory_config.resolve_mem0_config("u1", "worker-marketer")


def test_a_runtime_nobody_was_named_the_owner_of_keeps_no_memories(
    datalayer_runtime: Dict[str, str],
) -> None:
    # Every user's memories would meet under the one id a runtime falls back to.
    with pytest.raises(MemoryNotConfigured, match="not told whose it is"):
        memory_config.resolve_mem0_config("default", "worker-marketer")


def test_off_datalayer_the_local_defaults_stay(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.models import models

    monkeypatch.setattr(models, "effective_inference_provider", lambda: "local")
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI", raising=False)
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", raising=False)
    monkeypatch.delenv("AGENT_RUNTIMES_MEM0_CONFIG_JSON", raising=False)
    monkeypatch.setenv("AGENT_RUNTIMES_MEM0_BACKEND", "auto")
    resolved = memory_config.resolve_mem0_config("u1", "a1")
    assert resolved is not None and "embedder" not in resolved


# ── mem0 stand-in: what a PostgreSQL table would keep, across runtimes ──


class FakeMem0:
    """mem0's `Memory`, keeping rows where a table would: past any one runtime."""

    rows: Dict[str, Dict[str, Any]] = {}
    built: List[Dict[str, Any]] = []

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "FakeMem0":
        cls.built.append(config)
        return cls()

    def add(
        self,
        messages: List[Dict[str, str]],
        metadata: Dict[str, Any] | None = None,
        infer: bool = True,
        **scope: Any,
    ) -> Dict[str, Any]:
        added = []
        for message in messages:
            memory_id = str(uuid.uuid4())
            self.rows[memory_id] = {
                "id": memory_id,
                "memory": message["content"],
                "metadata": dict(metadata or {}),
                "infer": infer,
                "created_at": f"{time.time():.6f}",
                **scope,
            }
            added.append({"id": memory_id, "event": "ADD"})
        return {"results": added}

    def _of(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [
            row
            for row in self.rows.values()
            if all(row.get(key) == value for key, value in filters.items())
        ]

    def search(self, query: str, top_k: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        words = {word.strip(".,?").lower() for word in query.split()}
        found = [
            {**row, "score": 1.0}
            for row in self._of(filters)
            if words & {w.strip(".,?").lower() for w in row["memory"].split()}
        ]
        return {"results": found[:top_k]}

    def get_all(self, filters: Dict[str, Any], top_k: int) -> Dict[str, Any]:
        return {"results": self._of(filters)[:top_k]}

    def get(self, memory_id: str) -> Dict[str, Any] | None:
        return self.rows.get(memory_id)

    def delete(self, memory_id: str) -> None:
        self.rows.pop(memory_id, None)

    def update(self, memory_id: str, text: str, metadata: Dict[str, Any]) -> None:
        self.rows[memory_id].update(memory=text, metadata=metadata)


@pytest.fixture()
def fake_mem0(monkeypatch: pytest.MonkeyPatch) -> type[FakeMem0]:
    import mem0

    FakeMem0.rows = {}
    FakeMem0.built = []
    monkeypatch.setattr(mem0, "Memory", FakeMem0)
    return FakeMem0


#: The catalogue agents that keep the person's memories across a pause (the
#: user, 9 November 2026): the Marketer and the Crawler.
REMEMBERING_AGENTS = ["worker-marketer", "worker-crawler"]


def _spec(agent_spec_id: str = "worker-marketer") -> Any:
    from agent_runtimes.routes.agents import get_library_agent_spec

    spec = get_library_agent_spec(agent_spec_id)
    assert spec is not None
    return spec


def _marketer() -> Any:
    return _spec("worker-marketer")


def _runtime(
    monkeypatch: pytest.MonkeyPatch,
    runtime_uid: str,
    user_uid: str,
    agent_spec_id: str = "worker-marketer",
) -> MemoryCapability:
    """An agent's memory on a runtime launched for a user: its agent is `default`."""
    monkeypatch.setenv("DATALAYER_RUNTIME_ID", runtime_uid)
    monkeypatch.setenv("DATALAYER_USER_UID", user_uid)
    monkeypatch.delenv("AGENT_RUNTIMES_MEMORY_USER_ID", raising=False)
    monkeypatch.delenv("DATALAYER_USER_HANDLE", raising=False)
    capabilities = build_capabilities_from_agent_spec(
        _spec(agent_spec_id),
        agent_id="default",
        model="bedrock:us.anthropic.claude-sonnet-4-6",
    )
    [memory] = [c for c in capabilities if isinstance(c, MemoryCapability)]
    assert get_memory_backend("default") is memory.backend
    return memory


def _tool(memory: MemoryCapability, name: str) -> Any:
    toolset = memory.get_toolset()
    assert toolset is not None
    return toolset.tools[name].function


def test_the_marketer_s_spec_carries_mem0() -> None:
    from agent_runtimes.specs.apps import get_app

    assert _marketer().memory == "mem0"
    app = get_app("marketer")
    assert app is not None and app.memory == "mem0"


@pytest.mark.parametrize("agent_spec_id", REMEMBERING_AGENTS)
def test_the_agent_s_spec_carries_mem0(agent_spec_id: str) -> None:
    assert _spec(agent_spec_id).memory == "mem0"


@pytest.mark.parametrize("agent_spec_id", REMEMBERING_AGENTS)
def test_a_resumed_agent_reads_back_what_it_was_told_before_its_pause(
    datalayer_runtime: Dict[str, str],
    fake_mem0: type[FakeMem0],
    monkeypatch: pytest.MonkeyPatch,
    agent_spec_id: str,
) -> None:
    before = _runtime(
        monkeypatch, "01runtimebeforepause000000", "user-ada", agent_spec_id
    )
    said = asyncio.run(_tool(before, "remember")(BRAND_FACT))
    assert said == "Stored in memory."
    [row] = fake_mem0.rows.values()
    # Kept under the user and the agent's own id: nothing of the runtime's.
    assert (row["user_id"], row["agent_id"]) == ("user-ada", agent_spec_id)
    assert row["infer"] is False
    assert "01runtimebeforepause000000" not in json.dumps(row)

    # Paused: the runtime stops, its process with it.
    asyncio.run(before.backend.close())

    after = _runtime(
        monkeypatch, "01runtimeafterresume000000", "user-ada", agent_spec_id
    )
    assert after.backend is not before.backend
    answer = asyncio.run(_tool(after, "search_memory")("What is the brand voice?"))
    assert BRAND_FACT in answer
    listed = asyncio.run(after.backend.list_all())
    assert [entry["content"] for entry in listed] == [BRAND_FACT]


def test_another_user_reads_none_of_it(
    datalayer_runtime: Dict[str, str],
    fake_mem0: type[FakeMem0],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ada = _runtime(monkeypatch, "01runtimeofada0000000000000", "user-ada")
    asyncio.run(_tool(ada, "remember")(BRAND_FACT))
    [memory_id] = fake_mem0.rows

    bob = _runtime(monkeypatch, "01runtimeofbob0000000000000", "user-bob")
    assert asyncio.run(_tool(bob, "search_memory")("brand voice")) == (
        "No relevant memories found."
    )
    assert asyncio.run(bob.backend.list_all()) == []
    # Nor by its id: neither forgotten nor corrected across the scope.
    assert asyncio.run(bob.backend.forget(memory_id)) is False
    assert asyncio.run(bob.backend.correct(memory_id, "loud", "user-bob")) is None
    assert fake_mem0.rows[memory_id]["memory"] == BRAND_FACT


def test_another_agent_of_the_same_user_reads_none_of_it(
    datalayer_runtime: Dict[str, str], fake_mem0: type[FakeMem0]
) -> None:
    marketer = create_memory_backend(
        "mem0", user_id="user-ada", agent_id="worker-marketer"
    )
    other = create_memory_backend(
        "mem0", user_id="user-ada", agent_id="worker-researcher"
    )
    asyncio.run(marketer.add([{"role": "user", "content": BRAND_FACT}]))
    assert asyncio.run(other.search("brand voice")) == []
    assert len(asyncio.run(marketer.search("brand voice"))) == 1


def test_mem0_is_built_again_when_the_runtime_s_token_is_renewed(
    datalayer_runtime: Dict[str, str], fake_mem0: type[FakeMem0]
) -> None:
    backend = create_memory_backend(
        "mem0", user_id="user-ada", agent_id="worker-marketer"
    )
    assert isinstance(backend, Mem0Backend)
    asyncio.run(backend.search("voice"))
    asyncio.run(backend.search("voice"))
    assert len(fake_mem0.built) == 1
    datalayer_runtime["value"] = "renewed-" + TOKEN
    asyncio.run(backend.search("voice"))
    assert len(fake_mem0.built) == 2
    assert fake_mem0.built[-1]["embedder"]["config"]["api_key"] == "renewed-" + TOKEN


def test_a_runtime_that_cannot_keep_memories_tells_the_model_why(
    datalayer_runtime: Dict[str, str],
    fake_mem0: type[FakeMem0],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    memory = _runtime(monkeypatch, "01runtimewithnopostgres00000", "user-ada")
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI", raising=False)
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", raising=False)
    said = asyncio.run(_tool(memory, "remember")(BRAND_FACT))
    assert "no PostgreSQL is configured" in said
    assert fake_mem0.rows == {}


# ── mem0 itself, on a real PostgreSQL with pgvector ──

PGVECTOR_IMAGE = "pgvector/pgvector:pg17"
DIMS = 1536

#: The table the platform's PostgreSQL cluster is created with (its bootstrap SQL).
PLATFORM_TABLE = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    "CREATE TABLE IF NOT EXISTS agent_memories (id UUID PRIMARY KEY, vector vector(1536), payload JSONB)",
    "CREATE INDEX IF NOT EXISTS agent_memories_user_id_idx ON agent_memories ((payload->>'user_id'))",
    "CREATE INDEX IF NOT EXISTS agent_memories_agent_id_idx ON agent_memories ((payload->>'agent_id'))",
]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _vector(text: str) -> List[float]:
    """A deterministic embedding: the words of a text, hashed into its dimensions."""
    vector = [0.0] * DIMS
    for word in text.lower().replace(".", " ").replace("?", " ").split():
        vector[int(hashlib.sha256(word.encode()).hexdigest(), 16) % DIMS] += 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


class _Embeddings(BaseHTTPRequestHandler):
    """ai-inference's OpenAI-compatible embeddings route, as mem0 calls it."""

    asked: List[Dict[str, Any]] = []

    def do_POST(self) -> None:  # noqa: N802 - the handler's name
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.asked.append(
            {"path": self.path, "auth": self.headers.get("Authorization"), **body}
        )
        inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
        answer = {
            "object": "list",
            "model": body["model"],
            "data": [
                {"object": "embedding", "index": i, "embedding": _vector(text)}
                for i, text in enumerate(inputs)
            ],
            "usage": {"prompt_tokens": 1, "total_tokens": 1},
        }
        encoded = json.dumps(answer).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *args: Any) -> None:
        return


@pytest.fixture(scope="module")
def postgres() -> Iterator[Dict[str, Any]]:
    """A PostgreSQL with pgvector in a container, holding the platform's table."""
    docker = shutil.which("docker")
    if docker is None:
        pytest.skip("No docker here to start a PostgreSQL with pgvector in.")
    present = subprocess.run(
        [docker, "image", "inspect", PGVECTOR_IMAGE], capture_output=True, check=False
    )
    if present.returncode != 0:
        pytest.skip(f"The image {PGVECTOR_IMAGE} is not pulled here (docker pull it).")
    port = _free_port()
    name = "agent-runtimes-memory-test-" + uuid.uuid4().hex[:8]
    started = subprocess.run(
        [
            docker,
            "run",
            "-d",
            "--rm",
            "--name",
            name,
            "-e",
            "POSTGRES_USER=mem0",
            "-e",
            "POSTGRES_PASSWORD=mem0",
            "-e",
            "POSTGRES_DB=mem0",
            "-p",
            f"127.0.0.1:{port}:5432",
            PGVECTOR_IMAGE,
        ],
        capture_output=True,
        check=False,
    )
    if started.returncode != 0:
        pytest.skip(
            f"docker could not start PostgreSQL: {started.stderr.decode()[:200]}"
        )
    try:
        import psycopg

        dsn = f"postgresql://mem0:mem0@127.0.0.1:{port}/mem0"
        deadline = time.time() + 60
        while True:
            try:
                with psycopg.connect(dsn, connect_timeout=2) as connection:
                    for statement in PLATFORM_TABLE:
                        connection.execute(statement)
                break
            except psycopg.OperationalError:
                if time.time() > deadline:
                    raise
                time.sleep(1)
        yield {"dsn": dsn, "port": port}
    finally:
        subprocess.run([docker, "rm", "-f", name], capture_output=True, check=False)


@pytest.fixture()
def embeddings() -> Iterator[str]:
    _Embeddings.asked = []
    server = HTTPServer(("127.0.0.1", 0), _Embeddings)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/api/ai-inference"
    server.shutdown()


@pytest.fixture()
def on_real_postgres(
    datalayer_runtime: Dict[str, str],
    postgres: Dict[str, Any],
    embeddings: str,
    monkeypatch: pytest.MonkeyPatch,
) -> Dict[str, Any]:
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", embeddings)
    monkeypatch.setenv(
        "DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI",
        f"postgres://mem0:mem0@127.0.0.1:{postgres['port']}/mem0",
    )
    import psycopg

    with psycopg.connect(postgres["dsn"]) as connection:
        connection.execute("DELETE FROM agent_memories")
    return postgres


def _rows(dsn: str) -> List[tuple]:
    import psycopg

    with psycopg.connect(dsn) as connection:
        return connection.execute(
            "SELECT id::text, payload->>'user_id', payload->>'agent_id', payload->>'data' "
            "FROM agent_memories ORDER BY payload->>'created_at'"
        ).fetchall()


def test_on_postgres_a_resumed_agent_reads_back_its_memory(
    on_real_postgres: Dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    before = _runtime(monkeypatch, "01runtimebeforepause000000", "user-ada")
    assert asyncio.run(_tool(before, "remember")(BRAND_FACT)) == "Stored in memory."
    [(memory_id, user_id, agent_id, data)] = _rows(on_real_postgres["dsn"])
    assert (user_id, agent_id, data) == ("user-ada", "worker-marketer", BRAND_FACT)
    # Embedded through ai-inference, with the runtime's token, at its dimensions.
    asked = _Embeddings.asked[0]
    assert asked["path"] == "/api/ai-inference/v1/embeddings"
    assert asked["auth"] == f"Bearer {TOKEN}"
    assert asked["model"] == "bedrock:amazon.titan-embed-text-v1"
    assert asked["dimensions"] == DIMS

    asyncio.run(before.backend.close())  # Paused: the runtime stops.

    after = _runtime(monkeypatch, "01runtimeafterresume000000", "user-ada")
    answer = asyncio.run(_tool(after, "search_memory")("What is the brand voice?"))
    assert BRAND_FACT in answer
    [found] = asyncio.run(after.backend.list_all())
    assert (found["id"], found["content"]) == (memory_id, BRAND_FACT)
    # What a turn is told before the model answers.
    context = asyncio.run(after.backend.get_relevant_context("brand voice"))
    assert BRAND_FACT in context


def test_on_postgres_another_user_reads_none_of_it(
    on_real_postgres: Dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    ada = _runtime(monkeypatch, "01runtimeofada0000000000000", "user-ada")
    asyncio.run(_tool(ada, "remember")(BRAND_FACT))
    [(memory_id, *_)] = _rows(on_real_postgres["dsn"])

    bob = _runtime(monkeypatch, "01runtimeofbob0000000000000", "user-bob")
    assert asyncio.run(bob.backend.search("brand voice")) == []
    assert asyncio.run(bob.backend.list_all()) == []
    assert asyncio.run(bob.backend.forget(memory_id)) is False
    assert len(_rows(on_real_postgres["dsn"])) == 1
    # Its owner forgets it, and it is gone from the table.
    assert asyncio.run(ada.backend.forget(memory_id)) is True
    assert _rows(on_real_postgres["dsn"]) == []
