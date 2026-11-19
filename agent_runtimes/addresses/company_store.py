# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A company's PAP store kept by Datalayer, for the company a runtime serves.

The SDK's company keeps its Sessions, refresh token families, sign-ins,
device codes, conversations and operations as JSON records by kind and key
(``personal_agent_protocol.company.store``); in memory, a restart forgets
them. A runtime launched for a deployment keeps them where Datalayer's own
company service keeps that deployment's — through ai-agents
(``POST /api/ai-agents/v1/apps/internal/addresses/{name}/store/{operation}``,
asked with the runtime's proof), which keeps them at IAM. A restart, a
relaunched kept runtime and Studio's approval of a personal agent's sign-in
(which ai-agents writes) all meet the same records. ai-agents not answering is
:class:`StoreUnavailable`: the company fails rather than forget.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


class StoreUnavailable(RuntimeError):
    """Datalayer did not keep or answer a record of the company's."""


class DatalayerCompanyStore:
    """``pap.company.store`` of the deployment this runtime was launched for, at ``name``."""

    def __init__(self, name: str, *, http: Optional[Any] = None) -> None:
        self.name = name
        self.http = http

    async def _call(self, operation: str, body: dict[str, Any]) -> Any:
        import httpx
        from datalayer_core.utils.urls import DatalayerURLs

        from agent_runtimes.apps.principal import _asked_with_proof, launched_for

        deployment = launched_for()
        url = (
            getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        ).rstrip("/")
        if not deployment or not url:
            raise StoreUnavailable(
                "This runtime was launched for no deployment, or knows no ai-agents: no store to keep it in."
            )
        address = f"{url}/api/ai-agents/v1/apps/internal/addresses/{self.name}/store/{operation}"

        async def ask(client: Any) -> Any:
            return await _asked_with_proof(
                deployment,
                url,
                lambda proved: client.post(address, json=body, headers=proved),
            )

        try:
            if self.http is not None:
                answer = await ask(self.http)
            else:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    answer = await ask(client)
        except httpx.HTTPError as error:
            raise StoreUnavailable(
                f"ai-agents did not answer the company store ({type(error).__name__})."
            ) from error
        if answer.status_code >= 500 or answer.status_code in (400, 401, 403):
            raise StoreUnavailable(
                f"ai-agents refused the company store ({answer.status_code})."
            )
        return answer

    @staticmethod
    def _expiry(expires_at: Optional[datetime]) -> Optional[str]:
        if expires_at is None:
            return None
        if expires_at.tzinfo is None:
            raise ValueError("an expiry has a time zone")
        return expires_at.isoformat()

    @staticmethod
    def _record(found: dict[str, Any]) -> Any:
        from personal_agent_protocol.company.store import StoredRecord

        expires = (
            datetime.fromisoformat(found["expires_at"])
            if found.get("expires_at")
            else None
        )
        return StoredRecord(
            value=found["value"], version=str(found["version"]), expires_at=expires
        )

    async def get(self, kind: str, key: str) -> Any:
        answer = await self._call("get", {"kind": kind, "key": key})
        if answer.status_code == 404:
            return None
        return self._record(answer.json())

    async def put(
        self,
        kind: str,
        key: str,
        value: dict[str, Any],
        *,
        expires_at: Optional[datetime] = None,
    ) -> None:
        await self._call(
            "put",
            {
                "kind": kind,
                "key": key,
                "value": value,
                "expires_at": self._expiry(expires_at),
            },
        )

    async def create(
        self,
        kind: str,
        key: str,
        value: dict[str, Any],
        *,
        expires_at: Optional[datetime] = None,
    ) -> bool:
        answer = await self._call(
            "create",
            {
                "kind": kind,
                "key": key,
                "value": value,
                "expires_at": self._expiry(expires_at),
            },
        )
        return bool(answer.json().get("written"))

    async def replace(
        self,
        kind: str,
        key: str,
        version: str,
        value: dict[str, Any],
        *,
        expires_at: Optional[datetime] = None,
    ) -> bool:
        answer = await self._call(
            "replace",
            {
                "kind": kind,
                "key": key,
                "version": version,
                "value": value,
                "expires_at": self._expiry(expires_at),
            },
        )
        return bool(answer.json().get("written"))

    async def take(self, kind: str, key: str) -> Optional[dict[str, Any]]:
        taken = (
            (await self._call("take", {"kind": kind, "key": key})).json().get("value")
        )
        return taken if isinstance(taken, dict) else None

    async def delete(self, kind: str, key: str) -> None:
        await self._call("delete", {"kind": kind, "key": key})

    async def records(self, kind: str) -> list[Any]:
        answer = await self._call("records", {"kind": kind})
        if answer.status_code != 200:
            raise StoreUnavailable(
                f"ai-agents did not list the company's records ({answer.status_code})."
            )
        return [self._record(found) for found in answer.json()["records"]]


class DatalayerReplayCache:
    """``pap.company.replayCache``: a proof or an assertion is seen once, across restarts
    and Datalayer's own company service alike — a create-only record until it expires."""

    def __init__(self, store: DatalayerCompanyStore) -> None:
        self.store = store

    async def mark_once(self, key: str, *, expires_at: datetime) -> bool:
        return await self.store.create(
            "replay", key, {"seen": True}, expires_at=expires_at
        )


class DatalayerStoresPlugin:
    """Contributes the company's store and replay cache before the SDK's in-memory ones."""

    def __init__(self, name: str) -> None:
        self.store = DatalayerCompanyStore(name)
        self.replay = DatalayerReplayCache(self.store)

    def provide_contributions(self, contributions: Any) -> None:
        from personal_agent_protocol.company import COMPANY_STORES, REPLAY_CACHES

        contributions.contribute(
            COMPANY_STORES, self.store, contribution_id="datalayer", order=10
        )
        contributions.contribute(
            REPLAY_CACHES, self.replay, contribution_id="datalayer", order=10
        )


__all__ = [
    "DatalayerCompanyStore",
    "DatalayerReplayCache",
    "DatalayerStoresPlugin",
    "StoreUnavailable",
]
