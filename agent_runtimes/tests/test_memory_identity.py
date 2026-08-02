# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for trusted memory identity resolution."""

from __future__ import annotations

from agent_runtimes.memory import resolve_memory_identity
from agent_runtimes.memory.identity import MemoryIdentity


def _clear_identity_env(monkeypatch) -> None:
    for name in (
        "AGENT_RUNTIMES_MEMORY_USER_ID",
        "DATALAYER_USER_UID",
        "DATALAYER_USER_HANDLE",
    ):
        monkeypatch.delenv(name, raising=False)


def test_identity_defaults_to_default_without_env(monkeypatch) -> None:
    _clear_identity_env(monkeypatch)
    identity = resolve_memory_identity()
    assert isinstance(identity, MemoryIdentity)
    assert identity.user_id == "default"


def test_identity_uses_user_uid_only(monkeypatch) -> None:
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("DATALAYER_USER_UID", "user-123")
    identity = resolve_memory_identity()
    assert identity.user_id == "user-123"
    assert identity.user_uid == "user-123"


def test_identity_ignores_billing_entity(monkeypatch) -> None:
    # Memories are scoped to the personal account; a billing entity must not
    # change the isolation key.
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("DATALAYER_USER_UID", "user-123")
    monkeypatch.setenv("DATALAYER_BILLING_ENTITY_UID", "org-42")
    identity = resolve_memory_identity()
    assert identity.user_id == "user-123"


def test_identity_falls_back_to_handle(monkeypatch) -> None:
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("DATALAYER_USER_HANDLE", "alice")
    identity = resolve_memory_identity()
    assert identity.user_id == "alice"
    assert identity.user_handle == "alice"


def test_identity_explicit_override_wins(monkeypatch) -> None:
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("DATALAYER_USER_UID", "user-123")
    monkeypatch.setenv("AGENT_RUNTIMES_MEMORY_USER_ID", "explicit-scope")
    identity = resolve_memory_identity()
    assert identity.user_id == "explicit-scope"
