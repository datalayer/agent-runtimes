# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PAP and PACT in one task: the example answers from both, one record (AGENT_PROTOCOLS EX-07, PR-14, PR-53)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from personal_agent_protocol.company.service import CompanyService

from agent_runtimes.loop.apps.build import build
from agent_runtimes.protocols.pact.client import InMemoryDelegationStore
from agent_runtimes.protocols.pact.provider import ExampleAir

EXAMPLE = Path(__file__).parents[2] / "examples" / "protocols" / "pap_and_pact" / "app.py"


@pytest.fixture
def secrets(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Every code and token the task handled, as the businesses and the host saw them."""
    seen: list[str] = []
    approve_device = CompanyService.approve_device
    approve = ExampleAir.approve
    put = InMemoryDelegationStore.put

    async def pap_approved(self, user_code, **kwargs):  # type: ignore[no-untyped-def]
        seen.append(user_code)
        return await approve_device(self, user_code, **kwargs)

    def pact_approved(self, user_code, brand_user, scopes):  # type: ignore[no-untyped-def]
        seen.append(user_code)
        return approve(self, user_code, brand_user, scopes)

    async def held(self, brand, user, token, scopes):  # type: ignore[no-untyped-def]
        seen.append(token)
        return await put(self, brand, user, token, scopes)

    monkeypatch.setattr(CompanyService, "approve_device", pap_approved)
    monkeypatch.setattr(ExampleAir, "approve", pact_approved)
    monkeypatch.setattr(InMemoryDelegationStore, "put", held)
    return seen


def test_one_question_two_protocols_one_record(secrets: list[str]) -> None:
    built = build(str(EXAMPLE))
    spec = built.application.spec
    assert spec.id == "pap-and-pact-one-task"
    [tool] = spec.tools
    assert tool.does == ["read"] and not tool.parameters.get("required")

    result = asyncio.run(built.application.tools[tool.name]())

    assert result["answers"] == [
        "Manzanita Outfitters: Your order ord_7Hk2: Ridge Jacket, size M, delivered.",
        "Example Air Support: Your booking AB123 flies on 2026-11-02.",
    ]
    events = [(e["protocol"], e["event"]) for e in result["record"]]
    assert events == [
        ("PAP", "company discovered"),
        ("PAP", "sign-in asked"),
        ("PAP", "signed in"),
        ("PAP", "answered"),
        ("PACT", "card read"),
        ("PACT", "sign-in asked"),
        ("PACT", "signed in"),
        ("PACT", "receipt verified"),
        ("PACT", "answered"),
    ]
    receipt = next(e for e in result["record"] if e["event"] == "receipt verified")
    # Kept through pact.receiptStore: the host's record, contributed below the default.
    assert receipt["counterpart"] == "Example Air Support"
    assert receipt["scopes_used"] == ["bookings:read"]
    assert receipt["actions"] == ["lookup_booking"]
    signed_in = [e for e in result["record"] if e["event"] == "signed in"]
    assert [e["scopes"] for e in signed_in] == [["orders:read"], ["bookings:read"]]

    # Two user codes and a delegation token were handled; none is in what a model reads.
    assert len(secrets) == 3
    said = json.dumps(result)
    for secret in secrets:
        assert secret not in said
    assert "eyJ" not in said  # no compact JWT or JWS of any kind
