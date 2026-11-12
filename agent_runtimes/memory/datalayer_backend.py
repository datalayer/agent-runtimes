# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's memory kept on Datalayer, for an agent run on a person's own machine.

An agent that remembers with mem0 keeps, on a Datalayer runtime, what it
learns of its person in the platform's memory store. Run on their own
machine — ``loop`` with a local server — with their Datalayer API key
(``DATALAYER_API_KEY``), it remembers in that same store, through the
runtimes service (``/api/runtimes/v1/memories``): what it learned on the
platform it reads here, and what it learns here a runtime there reads back.

Whose memories they are is the key's: the service takes the person from the
token, never from anything sent. Which agent's is the agentspec's id, as on
a Datalayer runtime. The words are embedded through ai-inference with the
same key, metered on the person.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .base import BaseMemoryBackend
from .config import MemoryNotConfigured

logger = logging.getLogger(__name__)

#: The runtimes service's memories.
MEMORIES_PATH = "/api/runtimes/v1/memories"

#: Where the runtimes service is when ``DATALAYER_RUNTIMES_URL`` does not say.
DEFAULT_RUNTIMES_URL = "https://r1.datalayer.run"


def datalayer_api_key() -> str:
    """The person's Datalayer API key, or ''."""
    return (os.environ.get("DATALAYER_API_KEY") or "").strip()


def runtimes_url() -> str:
    """The runtimes service: ``DATALAYER_RUNTIMES_URL``, else Datalayer's."""
    return (
        (os.environ.get("DATALAYER_RUNTIMES_URL") or "").strip() or DEFAULT_RUNTIMES_URL
    ).rstrip("/")


class DatalayerMemory(BaseMemoryBackend):
    """The person's memories of one agent, on Datalayer, through the runtimes service."""

    def __init__(
        self,
        agent_id: str,
        api_key: str | None = None,
        base_url: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        agent_id = str(agent_id or "").strip()
        if not agent_id:
            raise ValueError(
                "An agent's memories are kept under its agentspec's id: none was given."
            )
        self.agent_id = agent_id
        self.api_key = (api_key if api_key is not None else datalayer_api_key()).strip()
        self.base_url = (base_url or runtimes_url()).rstrip("/")
        self.transport = transport
        # The person, as the service says: the key's, read from its answers.
        self.user_id = ""

    async def _call(
        self,
        method: str,
        path: str = "",
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise MemoryNotConfigured(
                "Memories cannot be kept here: this agent remembers on Datalayer, "
                "and DATALAYER_API_KEY is not set."
            )
        url = f"{self.base_url}{MEMORIES_PATH}{path}"
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=60.0
            ) as client:
                response = await client.request(
                    method,
                    url,
                    json=json,
                    params=params,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError as error:
            raise MemoryNotConfigured(
                f"Datalayer's memories at {self.base_url} could not be reached "
                f"({type(error).__name__})."
            ) from None
        if response.status_code == 404 and method in {"DELETE", "PATCH"}:
            return {}
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail")
            except Exception:  # noqa: BLE001 - an answer that is not JSON
                detail = None
            if response.status_code in (401, 403):
                detail = (
                    "Datalayer refused your API key for your memories: check DATALAYER_API_KEY"
                    + (f" ({detail})." if detail else ".")
                )
            raise MemoryNotConfigured(
                str(detail or f"Datalayer's memories answered {response.status_code}.")
            )
        answer = response.json()
        return answer if isinstance(answer, dict) else {}

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Keep each message's words as one memory of the agent, the person's own."""
        for message in messages:
            words = " ".join(str(message.get("content") or "").split())
            if not words:
                continue
            answer = await self._call(
                "POST",
                json={
                    "agent_id": self.agent_id,
                    "content": words,
                    "metadata": metadata,
                },
            )
            self.user_id = str(
                (answer.get("memory") or {}).get("user_id") or self.user_id
            )

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """The person's memories of the agent nearest ``query``, nearest first."""
        if not " ".join(str(query or "").split()):
            return []
        answer = await self._call(
            "POST",
            "/search",
            json={"agent_id": self.agent_id, "query": query, "limit": limit},
        )
        return [_normalized(item) for item in answer.get("results") or []]

    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """Every memory of the person and agent, newest first, up to ``limit``."""
        answer = await self._call(
            "GET", params={"agent_id": self.agent_id, "limit": max(1, min(limit, 1000))}
        )
        return [_normalized(item) for item in answer.get("memories") or []]

    async def forget(self, memory_id: str) -> bool:
        """Forget one memory of the person and agent; False when it is not theirs.

        The service forgets the person's own only; one of another agent of
        theirs is not this agent's, so it is looked up first.
        """
        if not any(m["id"] == memory_id for m in await self.list_all(limit=1000)):
            return False
        answer = await self._call("DELETE", f"/{memory_id}")
        return bool(answer.get("forgotten"))

    async def correct(
        self, memory_id: str, text: str, corrected_by: str
    ) -> dict[str, Any] | None:
        """Correct one memory of the person and agent; None when it is not theirs."""
        if not any(m["id"] == memory_id for m in await self.list_all(limit=1000)):
            return None
        answer = await self._call("PATCH", f"/{memory_id}", json={"memory": text})
        corrected = answer.get("memory")
        return _normalized(corrected) if isinstance(corrected, dict) else None

    async def forget_all(self, batch: int = 500) -> int:
        """Forget every memory of the person and agent; answers how many."""
        count = len(await self.list_all(limit=1000))
        if not count:
            return 0
        answer = await self._call(
            "DELETE", params={"agent_id": self.agent_id, "count": count}
        )
        return int(answer.get("forgotten") or 0)


def _normalized(item: dict[str, Any]) -> dict[str, Any]:
    """One memory as every backend answers it."""
    return {
        "id": str(item.get("id") or ""),
        "content": item.get("memory", item.get("content", "")) or "",
        "score": item.get("score") or 0.0,
        "metadata": item.get("metadata") or {},
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }
