# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's memory kept in Amazon Bedrock AgentCore Memory.

AgentCore Memory keeps two kinds of memory in one memory resource, in the
person's own AWS account:

- **short-term**: the turns themselves, as events (``CreateEvent``,
  ``ListEvents``), per actor and per session;
- **long-term**: records its strategies extract from those events — user
  preferences, semantic facts, session summaries — searched by meaning
  (``RetrieveMemoryRecords``) within a namespace.

Here the **actor** is the person: the trusted ``user_id`` of the runtime's
owner (``memory.identity``), never a value the model or a caller names. The
**session** is the agent: its agentspec's id, so each agent of the person
keeps its own turns. Long-term records live in the namespaces of the
memory's strategies, with ``{actorId}`` (and ``{sessionId}``, when the
strategy names it) filled in: a namespace that does not name ``{actorId}``
would be read across people, and is refused.

The memory resource is configured, never created per call: its id and
region come from the agentspec's ``memory_config`` (``memory_id``,
``region``, ``namespaces``) or the environment
(``AGENT_RUNTIMES_AGENTCORE_MEMORY_ID``, ``AWS_REGION``,
``AGENT_RUNTIMES_AGENTCORE_MEMORY_NAMESPACES``). With no namespaces
configured, they are read once from the memory's strategies
(``GetMemory`` on the control plane). The person's own AWS credentials are
used, as boto3 finds them.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

from .base import BaseMemoryBackend
from .config import MemoryNotConfigured

logger = logging.getLogger(__name__)

#: The environment variable naming the memory resource.
MEMORY_ID_ENV = "AGENT_RUNTIMES_AGENTCORE_MEMORY_ID"
#: The environment variable listing long-term namespaces, comma-separated.
NAMESPACES_ENV = "AGENT_RUNTIMES_AGENTCORE_MEMORY_NAMESPACES"

#: What AgentCore takes as an actor id and as a session id.
_ACTOR_ID = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9\-_/]*(?::[a-zA-Z0-9\-_/]+)*[a-zA-Z0-9\-_/]*$"
)
_SESSION_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9\-_]*$")

#: The roles a message is kept with, in AgentCore's words.
_ROLES = {"user": "USER", "assistant": "ASSISTANT", "tool": "TOOL"}

#: The most events or records one AgentCore page holds.
_PAGE = 100

#: The metadata AgentCore keeps on an event: at most 15 string values.
_METADATA_KEYS = 15
_METADATA_KEY = re.compile(r"^[a-zA-Z0-9\s._:/=+@-]{1,128}$")


def resolve_agentcore_memory_config(
    explicit_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The memory resource to use: ``memory_id``, ``region`` and ``namespaces``.

    The agentspec's ``memory_config`` wins, key by key, over the
    environment. A memory id or a region that nobody gave is refused in a
    sentence (`MemoryNotConfigured`): never a memory made up for the call.
    """
    config = dict(explicit_config or {})
    unknown = sorted(set(config) - {"memory_id", "region", "namespaces"})
    if unknown:
        raise MemoryNotConfigured(
            f"AgentCore memory takes memory_id, region and namespaces, not {', '.join(unknown)}."
        )
    memory_id = str(
        config.get("memory_id") or os.environ.get(MEMORY_ID_ENV) or ""
    ).strip()
    if not memory_id:
        raise MemoryNotConfigured(
            "This agent remembers in AgentCore Memory, and no memory is named: set "
            f"memory_config.memory_id in its agentspec or {MEMORY_ID_ENV}."
        )
    region = str(
        config.get("region")
        or os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or ""
    ).strip()
    if not region:
        raise MemoryNotConfigured(
            "This agent remembers in AgentCore Memory, and no AWS region is named: set "
            "memory_config.region in its agentspec or AWS_REGION."
        )
    namespaces = config.get("namespaces")
    if namespaces is None:
        raw = os.environ.get(NAMESPACES_ENV, "")
        namespaces = [item.strip() for item in raw.split(",") if item.strip()]
    if isinstance(namespaces, str):
        namespaces = [namespaces]
    return {"memory_id": memory_id, "region": region, "namespaces": list(namespaces)}


def _actor_id(user_id: str) -> str:
    actor = str(user_id or "").strip()
    if not actor or len(actor) > 255 or not _ACTOR_ID.match(actor):
        raise MemoryNotConfigured(
            f"AgentCore Memory keeps memories under the person's id, and {actor!r} is not "
            "one it takes (letters, digits, -, _, /)."
        )
    return actor


def _session_id(agent_id: str | None) -> str:
    """The agent's id as an AgentCore session id: anything else it holds becomes -."""
    raw = str(agent_id or "").strip()
    if not raw:
        raise ValueError(
            "An agent's memories are kept under its agentspec's id: none was given."
        )
    session = re.sub(r"[^a-zA-Z0-9\-_]", "-", raw)[:100]
    if not _SESSION_ID.match(session):
        session = f"a{session}"[:100]
    return session


def _metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    """An event's metadata as AgentCore keeps it: string values under valid keys."""
    kept: dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            raise ValueError(
                f"AgentCore keeps metadata as strings: {key!r} is not one."
            )
        if not _METADATA_KEY.match(str(key)):
            raise ValueError(f"AgentCore keeps no metadata named {key!r}.")
        kept[str(key)] = {"stringValue": str(value)}
    if len(kept) > _METADATA_KEYS:
        raise ValueError(
            f"AgentCore keeps at most {_METADATA_KEYS} metadata values per event."
        )
    return kept


def _iso(value: Any) -> str | None:
    return (
        value.isoformat()
        if isinstance(value, datetime)
        else (str(value) if value else None)
    )


class AgentCoreMemory(BaseMemoryBackend):
    """The person's memories of one agent, in an AgentCore memory resource.

    Parameters
    ----------
    user_id : str
        The trusted personal-account id of the runtime's owner: the actor.
    agent_id : str
        The agentspec's id: the session its turns are kept in.
    config : dict | None
        ``memory_id``, ``region``, ``namespaces`` (see
        `resolve_agentcore_memory_config`).
    data_client : Any, optional
        A boto3 client of ``bedrock-agentcore`` to use instead of a new one
        (a test).
    control_client : Any, optional
        A boto3 client of ``bedrock-agentcore-control`` to use instead of a
        new one (a test).
    """

    def __init__(
        self,
        user_id: str,
        agent_id: str | None,
        config: dict[str, Any] | None = None,
        data_client: Any | None = None,
        control_client: Any | None = None,
    ) -> None:
        resolved = resolve_agentcore_memory_config(config)
        self.user_id = user_id
        self.agent_id = agent_id
        self.actor_id = _actor_id(user_id)
        self.session_id = _session_id(agent_id)
        self.memory_id: str = resolved["memory_id"]
        self.region: str = resolved["region"]
        self._namespaces: list[str] | None = (
            self._scoped(resolved["namespaces"]) if resolved["namespaces"] else None
        )
        self._data = data_client
        self._control = control_client

    def _data_client(self) -> Any:
        if self._data is None:
            import boto3

            self._data = boto3.client("bedrock-agentcore", region_name=self.region)
        return self._data

    def _control_client(self) -> Any:
        if self._control is None:
            import boto3

            self._control = boto3.client(
                "bedrock-agentcore-control", region_name=self.region
            )
        return self._control

    def _scoped(
        self, templates: list[str], strategy_id: str | None = None
    ) -> list[str]:
        """The namespaces of this actor (and agent), from their templates."""
        scoped: list[str] = []
        for template in templates:
            if "{actorId}" not in template:
                raise MemoryNotConfigured(
                    f"The AgentCore namespace {template!r} does not name {{actorId}}: its "
                    "records would be read across people."
                )
            namespace = template.replace("{actorId}", self.actor_id).replace(
                "{sessionId}", self.session_id
            )
            if "{memoryStrategyId}" in namespace:
                if not strategy_id:
                    raise MemoryNotConfigured(
                        f"The AgentCore namespace {template!r} names {{memoryStrategyId}}: "
                        "give the namespace with the strategy's id filled in."
                    )
                namespace = namespace.replace("{memoryStrategyId}", strategy_id)
            scoped.append(namespace)
        return scoped

    def _strategy_namespaces(self) -> list[str]:
        """The long-term namespaces of this actor, read once from the memory's strategies."""
        if self._namespaces is not None:
            return self._namespaces
        memory = self._control_client().get_memory(memoryId=self.memory_id)["memory"]
        namespaces: list[str] = []
        for strategy in memory.get("strategies") or []:
            namespaces += self._scoped(
                list(strategy.get("namespaceTemplates") or []),
                strategy.get("strategyId"),
            )
        if not namespaces:
            raise MemoryNotConfigured(
                f"The AgentCore memory {self.memory_id} has no long-term strategy: "
                "nothing is searched until one is added (a semantic or user "
                "preference strategy)."
            )
        self._namespaces = namespaces
        return namespaces

    def _create_event(
        self, messages: list[dict], metadata: dict[str, Any] | None
    ) -> None:
        payload = []
        for message in messages:
            words = str(message.get("content") or "").strip()
            if not words:
                continue
            role = _ROLES.get(str(message.get("role") or "").lower(), "OTHER")
            payload.append(
                {"conversational": {"content": {"text": words}, "role": role}}
            )
        if not payload:
            return
        params: dict[str, Any] = {
            "memoryId": self.memory_id,
            "actorId": self.actor_id,
            "sessionId": self.session_id,
            "eventTimestamp": datetime.now(timezone.utc),
            "payload": payload,
        }
        kept = _metadata(metadata)
        if kept:
            params["metadata"] = kept
        self._data_client().create_event(**params)

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Keep the messages as one event of the person's session with the agent."""
        await asyncio.to_thread(self._create_event, messages, metadata)

    def _events(self, limit: int) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "memoryId": self.memory_id,
            "actorId": self.actor_id,
            "sessionId": self.session_id,
            "includePayloads": True,
            "maxResults": max(1, min(limit, _PAGE)),
        }
        events: list[dict[str, Any]] = []
        while len(events) < limit:
            answer = self._data_client().list_events(**params)
            events += answer.get("events") or []
            token = answer.get("nextToken")
            if not token:
                break
            params["nextToken"] = token
        return events[:limit]

    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """The person's turns with the agent (short-term events), newest first."""
        events = await asyncio.to_thread(self._events, limit)
        listed = [_event_entry(event) for event in events]
        return sorted(listed, key=lambda entry: entry["created_at"] or "", reverse=True)

    def _retrieve(self, query: str, limit: int) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        top = max(1, min(limit, _PAGE))
        for namespace in self._strategy_namespaces():
            answer = self._data_client().retrieve_memory_records(
                memoryId=self.memory_id,
                namespace=namespace,
                searchCriteria={"searchQuery": query, "topK": top},
                maxResults=top,
            )
            # AgentCore reads `namespace` as a prefix: the actor `u1` would
            # also reach `u10`'s records. Only this namespace and those under it.
            found += [
                _record_entry(item)
                for item in answer.get("memoryRecordSummaries") or []
                if any(
                    kept == namespace or kept.startswith(namespace.rstrip("/") + "/")
                    for kept in item.get("namespaces") or []
                )
            ]
        found.sort(key=lambda entry: entry["score"], reverse=True)
        return found[:limit]

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """The person's long-term records nearest ``query``, nearest first."""
        if not " ".join(str(query or "").split()):
            return []
        return await asyncio.to_thread(self._retrieve, query, limit)

    def _delete_event(self, event_id: str) -> None:
        self._data_client().delete_event(
            memoryId=self.memory_id,
            actorId=self.actor_id,
            sessionId=self.session_id,
            eventId=event_id,
        )

    async def forget(self, memory_id: str) -> bool:
        """Delete one turn of the person's session with the agent; False when it is not one.

        The event is looked up in this actor's session first: an id of
        somebody else's, or of another agent's, is not found.
        """
        events = await asyncio.to_thread(self._events, 10_000)
        if not any(event.get("eventId") == memory_id for event in events):
            return False
        await asyncio.to_thread(self._delete_event, memory_id)
        return True

    async def forget_all(self, batch: int = 500) -> int:
        """Delete every turn of the person's session with the agent; answers how many.

        Long-term records the strategies already extracted are AgentCore's
        to keep or expire; they are not deleted here.
        """
        forgotten = 0
        while True:
            events = await asyncio.to_thread(self._events, batch)
            if not events:
                return forgotten
            for event in events:
                await asyncio.to_thread(self._delete_event, event["eventId"])
            forgotten += len(events)


def _event_entry(event: dict[str, Any]) -> dict[str, Any]:
    """One event as every backend answers a memory."""
    words = [
        str(((item.get("conversational") or {}).get("content") or {}).get("text") or "")
        for item in event.get("payload") or []
    ]
    metadata = {
        key: (value or {}).get("stringValue")
        for key, value in (event.get("metadata") or {}).items()
    }
    return {
        "id": str(event.get("eventId") or ""),
        "content": "\n".join(word for word in words if word),
        "score": 0.0,
        "metadata": metadata,
        "created_at": _iso(event.get("eventTimestamp")),
        "updated_at": None,
    }


def _record_entry(item: dict[str, Any]) -> dict[str, Any]:
    """One long-term record as every backend answers a memory."""
    return {
        "id": str(item.get("memoryRecordId") or ""),
        "content": str((item.get("content") or {}).get("text") or ""),
        "score": float(item.get("score") or 0.0),
        "metadata": {
            "strategy_id": item.get("memoryStrategyId"),
            "namespaces": list(item.get("namespaces") or []),
        },
        "created_at": _iso(item.get("createdAt")),
        "updated_at": None,
    }
