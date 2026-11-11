# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `agentcore` memory backend, against stubbed boto3 clients: every
call's parameters asserted.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Iterator

import pytest

boto3 = pytest.importorskip("boto3")
from botocore.exceptions import UnknownServiceError  # noqa: E402
from botocore.stub import ANY, Stubber  # noqa: E402

try:
    boto3.client("bedrock-agentcore-control", region_name="us-east-1")
    boto3.client("bedrock-agentcore", region_name="us-east-1")
except UnknownServiceError:  # pragma: no cover - an older botocore
    pytest.skip("botocore has no AgentCore service model", allow_module_level=True)

from agent_runtimes.memory import create_memory_backend  # noqa: E402
from agent_runtimes.memory.agentcore_backend import (  # noqa: E402
    MEMORY_ID_ENV,
    NAMESPACES_ENV,
    AgentCoreMemory,
    resolve_agentcore_memory_config,
)
from agent_runtimes.memory.config import MemoryNotConfigured  # noqa: E402

REGION = "us-east-1"
MEMORY = "datalayer_memory-AbCdEf1234"
USER = "01JUSERULID0000000000000000"
AGENT = "example-memory"
NOW = datetime(2026, 11, 11, tzinfo=timezone.utc)
STRATEGY = "semantic-AbCdEf1234"
R1 = "mem-" + "1" * 40
R2 = "mem-" + "2" * 40


def _client(service: str) -> Any:
    return boto3.client(
        service,
        region_name=REGION,
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


@pytest.fixture()
def data() -> Iterator[tuple[Any, Stubber]]:
    client = _client("bedrock-agentcore")
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


@pytest.fixture()
def control() -> Iterator[tuple[Any, Stubber]]:
    client = _client("bedrock-agentcore-control")
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


@pytest.fixture(autouse=True)
def _no_ambient_config(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (MEMORY_ID_ENV, NAMESPACES_ENV, "AWS_REGION", "AWS_DEFAULT_REGION"):
        monkeypatch.delenv(name, raising=False)


def _memory(data: Any, control: Any | None = None, **config: Any) -> AgentCoreMemory:
    return AgentCoreMemory(
        user_id=USER,
        agent_id=AGENT,
        config={"memory_id": MEMORY, "region": REGION, **config},
        data_client=data,
        control_client=control,
    )


def _event(
    event_id: str, texts: list[tuple[str, str]], when: datetime = NOW
) -> dict[str, Any]:
    return {
        "memoryId": MEMORY,
        "actorId": USER,
        "sessionId": AGENT,
        "eventId": event_id,
        "eventTimestamp": when,
        "payload": [
            {"conversational": {"content": {"text": text}, "role": role}}
            for role, text in texts
        ],
    }


def _listed(stub: Stubber, events: list[dict[str, Any]], max_results: int) -> None:
    stub.add_response(
        "list_events",
        {"events": events},
        {
            "memoryId": MEMORY,
            "actorId": USER,
            "sessionId": AGENT,
            "includePayloads": True,
            "maxResults": max_results,
        },
    )


class TestConfiguration:
    def test_the_agentspec_wins_over_the_environment(self, monkeypatch):
        monkeypatch.setenv(MEMORY_ID_ENV, "from-env")
        monkeypatch.setenv("AWS_REGION", "eu-west-1")
        monkeypatch.setenv(NAMESPACES_ENV, "/a/{actorId}, /b/{actorId}")
        assert resolve_agentcore_memory_config({"memory_id": MEMORY}) == {
            "memory_id": MEMORY,
            "region": "eu-west-1",
            "namespaces": ["/a/{actorId}", "/b/{actorId}"],
        }

    def test_no_memory_id_is_refused(self, monkeypatch):
        monkeypatch.setenv("AWS_REGION", REGION)
        with pytest.raises(MemoryNotConfigured, match="memory_config.memory_id"):
            resolve_agentcore_memory_config(None)

    def test_no_region_is_refused(self):
        with pytest.raises(MemoryNotConfigured, match="AWS region"):
            resolve_agentcore_memory_config({"memory_id": MEMORY})

    def test_an_unknown_key_is_refused(self):
        with pytest.raises(MemoryNotConfigured, match="not strategy"):
            resolve_agentcore_memory_config({"memory_id": MEMORY, "strategy": "x"})

    def test_the_registry_makes_it_and_falls_back_to_nothing(self, monkeypatch):
        monkeypatch.setenv(MEMORY_ID_ENV, MEMORY)
        monkeypatch.setenv("AWS_REGION", REGION)
        backend = create_memory_backend("agentcore", user_id=USER, agent_id=AGENT)
        assert isinstance(backend, AgentCoreMemory)
        assert (backend.actor_id, backend.session_id) == (USER, AGENT)
        monkeypatch.delenv(MEMORY_ID_ENV)
        with pytest.raises(MemoryNotConfigured):
            create_memory_backend("agentcore", user_id=USER, agent_id=AGENT)

    def test_a_namespace_not_of_the_actor_is_refused(self, data):
        client, _ = data
        with pytest.raises(MemoryNotConfigured, match="across people"):
            _memory(client, namespaces=["/facts"])

    def test_the_session_is_the_agent_in_the_words_agentcore_takes(self, data):
        client, _ = data
        memory = AgentCoreMemory(
            user_id=USER,
            agent_id="team/agent.v2",
            config={"memory_id": MEMORY, "region": REGION},
            data_client=client,
        )
        assert memory.session_id == "team-agent-v2"
        with pytest.raises(MemoryNotConfigured, match="person's id"):
            AgentCoreMemory(
                user_id="someone@example.com",
                agent_id=AGENT,
                config={"memory_id": MEMORY, "region": REGION},
                data_client=client,
            )


class TestShortTerm:
    def test_add_keeps_one_event_of_the_actor_and_session(self, data):
        client, stub = data
        stub.add_response(
            "create_event",
            {"event": _event("e-1", [("USER", "I like tea"), ("ASSISTANT", "Noted")])},
            {
                "memoryId": MEMORY,
                "actorId": USER,
                "sessionId": AGENT,
                "eventTimestamp": ANY,
                "payload": [
                    {
                        "conversational": {
                            "content": {"text": "I like tea"},
                            "role": "USER",
                        }
                    },
                    {
                        "conversational": {
                            "content": {"text": "Noted"},
                            "role": "ASSISTANT",
                        }
                    },
                ],
                "metadata": {"topic": {"stringValue": "drinks"}},
            },
        )
        asyncio.run(
            _memory(client).add(
                [
                    {"role": "user", "content": "I like tea"},
                    {"role": "assistant", "content": "Noted"},
                    {"role": "user", "content": "   "},
                ],
                metadata={"topic": "drinks", "nothing": None},
            )
        )

    def test_nothing_to_keep_calls_nothing(self, data):
        client, _ = data
        asyncio.run(_memory(client).add([{"role": "user", "content": ""}]))

    def test_list_all_reads_the_events_newest_first(self, data):
        client, stub = data
        later = datetime(2026, 11, 12, tzinfo=timezone.utc)
        _listed(
            stub,
            [
                _event("e-1", [("USER", "first")]),
                _event("e-2", [("USER", "second")], later),
            ],
            50,
        )
        listed = asyncio.run(_memory(client).list_all())
        assert [(m["id"], m["content"]) for m in listed] == [
            ("e-2", "second"),
            ("e-1", "first"),
        ]
        assert listed[0]["created_at"] == later.isoformat()

    def test_forget_deletes_an_event_of_its_own_session_only(self, data):
        client, stub = data
        _listed(stub, [_event("e-1", [("USER", "first")])], 100)
        stub.add_response(
            "delete_event",
            {"eventId": "e-1"},
            {"memoryId": MEMORY, "actorId": USER, "sessionId": AGENT, "eventId": "e-1"},
        )
        _listed(stub, [], 100)
        memory = _memory(client)
        assert asyncio.run(memory.forget("e-1")) is True
        assert asyncio.run(memory.forget("someone-elses")) is False

    def test_forget_all_deletes_every_event(self, data):
        client, stub = data
        _listed(
            stub, [_event("e-1", [("USER", "a")]), _event("e-2", [("USER", "b")])], 100
        )
        for event_id in ("e-1", "e-2"):
            stub.add_response(
                "delete_event",
                {"eventId": event_id},
                {
                    "memoryId": MEMORY,
                    "actorId": USER,
                    "sessionId": AGENT,
                    "eventId": event_id,
                },
            )
        _listed(stub, [], 100)
        assert asyncio.run(_memory(client).forget_all()) == 2


class TestLongTerm:
    def _record(self, record_id: str, text: str, score: float, namespace: str) -> dict:
        return {
            "memoryRecordId": record_id,
            "content": {"text": text},
            "memoryStrategyId": STRATEGY,
            "namespaces": [namespace],
            "createdAt": NOW,
            "score": score,
        }

    def test_search_reads_the_strategies_namespaces_once(self, data, control):
        client, stub = data
        control_client, control_stub = control
        control_stub.add_response(
            "get_memory",
            {
                "memory": {
                    "arn": f"arn:aws:bedrock-agentcore:{REGION}:111122223333:memory/{MEMORY}",
                    "id": MEMORY,
                    "name": "datalayer_memory",
                    "eventExpiryDuration": 30,
                    "status": "ACTIVE",
                    "createdAt": NOW,
                    "updatedAt": NOW,
                    "strategies": [
                        {
                            "strategyId": STRATEGY,
                            "name": "facts",
                            "type": "SEMANTIC",
                            "namespaces": [
                                "/strategies/{memoryStrategyId}/actors/{actorId}"
                            ],
                            "namespaceTemplates": [
                                "/strategies/{memoryStrategyId}/actors/{actorId}"
                            ],
                        },
                        {
                            "strategyId": "preferences-1234",
                            "name": "prefs",
                            "type": "USER_PREFERENCE",
                            "namespaces": ["/preferences/{actorId}/{sessionId}"],
                            "namespaceTemplates": [
                                "/preferences/{actorId}/{sessionId}"
                            ],
                        },
                    ],
                }
            },
            {"memoryId": MEMORY},
        )
        facts = f"/strategies/{STRATEGY}/actors/{USER}"
        prefs = f"/preferences/{USER}/{AGENT}"
        for namespace, records in (
            (facts, [self._record(R1, "likes tea", 0.4, facts)]),
            (prefs, [self._record(R2, "prefers green tea", 0.9, prefs)]),
        ):
            stub.add_response(
                "retrieve_memory_records",
                {"memoryRecordSummaries": records},
                {
                    "memoryId": MEMORY,
                    "namespace": namespace,
                    "searchCriteria": {"searchQuery": "tea", "topK": 5},
                    "maxResults": 5,
                },
            )
        stub.add_response(
            "retrieve_memory_records",
            {"memoryRecordSummaries": []},
            {
                "memoryId": MEMORY,
                "namespace": facts,
                "searchCriteria": {"searchQuery": "coffee", "topK": 5},
                "maxResults": 5,
            },
        )
        stub.add_response(
            "retrieve_memory_records",
            {"memoryRecordSummaries": []},
            {
                "memoryId": MEMORY,
                "namespace": prefs,
                "searchCriteria": {"searchQuery": "coffee", "topK": 5},
                "maxResults": 5,
            },
        )
        memory = _memory(client, control_client)
        found = asyncio.run(memory.search("tea", limit=5))
        assert [(m["id"], m["content"], m["score"]) for m in found] == [
            (R2, "prefers green tea", 0.9),
            (R1, "likes tea", 0.4),
        ]
        assert found[0]["metadata"] == {"strategy_id": STRATEGY, "namespaces": [prefs]}
        assert asyncio.run(memory.search("coffee", limit=5)) == []
        assert asyncio.run(memory.search("   ")) == []

    def test_configured_namespaces_need_no_control_plane(self, data):
        client, stub = data
        namespace = f"/facts/{USER}"
        stub.add_response(
            "retrieve_memory_records",
            {
                "memoryRecordSummaries": [
                    self._record(R1, "likes tea", 0.5, namespace),
                    # Another person's, whose id starts with this one's.
                    self._record(R2, "likes coffee", 0.9, namespace + "0"),
                ]
            },
            {
                "memoryId": MEMORY,
                "namespace": namespace,
                "searchCriteria": {"searchQuery": "tea", "topK": 10},
                "maxResults": 10,
            },
        )
        found = asyncio.run(
            _memory(client, namespaces=["/facts/{actorId}"]).search("tea")
        )
        assert [m["id"] for m in found] == [R1]

    def test_a_memory_with_no_strategy_is_said_so(self, data, control):
        client, _ = data
        control_client, control_stub = control
        control_stub.add_response(
            "get_memory",
            {
                "memory": {
                    "arn": f"arn:aws:bedrock-agentcore:{REGION}:111122223333:memory/{MEMORY}",
                    "id": MEMORY,
                    "name": "datalayer_memory",
                    "eventExpiryDuration": 30,
                    "status": "ACTIVE",
                    "createdAt": NOW,
                    "updatedAt": NOW,
                    "strategies": [],
                }
            },
            {"memoryId": MEMORY},
        )
        with pytest.raises(MemoryNotConfigured, match="no long-term strategy"):
            asyncio.run(_memory(client, control_client).search("tea"))
