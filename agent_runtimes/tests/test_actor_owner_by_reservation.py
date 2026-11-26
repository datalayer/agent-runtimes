# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who owns an Agent Substrate actor: the account IAM says holds its reservation.

A Kagent agent's runtime is an actor that holds nothing of its owner's (their
tokens are put in at egress), so nothing in it names them and nobody names
them to it. A person's verified token proves the runtime is theirs when IAM
lists the runtime's reservation among that person's: asked with their own
token, at the IAM its template names, the runtime known by the actor's name
(``rt-<uid>``, projected by Agent Substrate).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Iterator

import httpx
import pytest

from agent_runtimes.apps import callers, principal
from agent_runtimes.apps.callers import Caller, CallerRefused

RUNTIME = "01m8c4f8r89ar40pamvbtjxj4h"
OWNER = "01OWNER"
IAM = "https://iam.example.com"

TOKENS: dict[str, Any] = {
    "owner-token": Caller(kind="person", uid=OWNER),
    "another-token": Caller(kind="person", uid="01SOMEBODYELSE"),
    "principal-token": Caller(kind="principal", uid="01AGENT", app_uid="app"),
}


class _Verifier:
    async def verify(self, token: str, app_uid: str = "") -> Caller:
        said = TOKENS.get(token)
        if said is None:
            raise CallerRefused(401, "The platform does not accept this token.")
        return said


class _Iam:
    """IAM's list of a token's reservations, as these tests have it answer."""

    def __init__(self, held: dict[str, tuple[str, ...]], status: int = 200) -> None:
        self.held = held
        self.status = status
        self.asked: list[tuple[str, str]] = []
        self.down = False

    async def __call__(self, url: str, token: str) -> tuple[int, tuple[str, ...]]:
        self.asked.append((url, token))
        if self.down:
            raise httpx.ConnectError("no route to IAM")
        if self.status != 200:
            return self.status, ()
        return 200, self.held.get(token, ())


@pytest.fixture
def actor(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """A Kagent agent's actor of RUNTIME: nothing names its owner.

    Yields
    ------
    Path
        The directory its identity is projected to.
    """
    (tmp_path / "actor-name").write_text(f"rt-{RUNTIME}\n")
    (tmp_path / "atespace").write_text("datalayer-runtimes\n")
    (tmp_path / "actor-uid").write_text("a1\n")
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "ate")
    monkeypatch.setenv("ATE_SYSTEM_INFO_DIR", str(tmp_path))
    monkeypatch.setenv("DATALAYER_IAM_URL", IAM + "/")
    monkeypatch.delenv("DATALAYER_USER_UID", raising=False)
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    from agent_runtimes.models import offered

    monkeypatch.setitem(offered._given, "token", None)
    monkeypatch.setattr(principal, "_PROOF", {})
    callers.forget_reservation_owner()
    callers.forget_proofs()
    yield tmp_path
    callers.forget_reservation_owner()
    callers.forget_proofs()


def _proof(token: str) -> tuple[callers.Proof, float]:
    return asyncio.run(callers._proof_of_token(token, _Verifier()))


def test_the_runtime_is_the_actors_by_its_name(actor: Path) -> None:
    assert callers.actor_runtime_uid() == RUNTIME


def test_the_person_whose_reservation_it_is_proves_the_runtime_is_theirs(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": ("01other", RUNTIME)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    proof, _ = _proof("owner-token")
    assert proof == callers.Proof(True, kind="owner")
    # Asked with the person's own token, at the IAM the template names.
    assert iam.asked == [(f"{IAM}/api/iam/v1/usage/reservations", "owner-token")]
    # Remembered: the runtime is never given another owner, and IAM is not asked again.
    assert callers.runtime_owner_uid() == OWNER
    assert _proof("another-token")[0] == callers.Proof(False, reason="another-account")
    assert len(iam.asked) == 1


def test_somebody_else_proves_nothing_and_names_no_owner(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": (RUNTIME,), "another-token": ("01theirs",)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    proof, seconds = _proof("another-token")
    assert proof == callers.Proof(False, reason="another-account")
    assert seconds == callers.PROOF_SECONDS
    assert callers.runtime_owner_uid() == ""
    assert _proof("owner-token")[0].sufficient is True


def test_iam_not_reached_proves_nothing_and_is_asked_again_soon(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": (RUNTIME,)})
    iam.down = True
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    proof, seconds = _proof("owner-token")
    assert proof == callers.Proof(False, reason="unverifiable")
    assert seconds == callers.PROOF_RETRY_SECONDS
    iam.down, iam.status = False, 502
    assert _proof("owner-token")[0] == callers.Proof(False, reason="unverifiable")
    assert callers.runtime_owner_uid() == ""


def test_an_application_s_token_never_asks(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"principal-token": (RUNTIME,)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    assert _proof("principal-token")[0] == callers.Proof(
        False, reason="application-token"
    )
    assert iam.asked == []


def test_a_runtime_that_is_no_actor_does_not_ask(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": (RUNTIME,)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET")
    assert _proof("owner-token")[0] == callers.Proof(False, reason="owner-unknown")
    assert iam.asked == []


def test_an_actor_launched_for_a_deployment_does_not_ask(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": (RUNTIME,)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    monkeypatch.setattr(principal, "_PROOF", {"deployment_uid": "01DEPLOYMENT"})
    assert _proof("owner-token")[0] == callers.Proof(False, reason="owner-unknown")
    assert iam.asked == []


def test_an_actor_that_knows_no_iam_does_not_ask(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"owner-token": (RUNTIME,)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    monkeypatch.delenv("DATALAYER_IAM_URL")
    assert _proof("owner-token")[0] == callers.Proof(False, reason="owner-unknown")
    assert iam.asked == []


def test_an_owner_named_otherwise_is_never_replaced(
    actor: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    iam = _Iam({"another-token": (RUNTIME,)})
    monkeypatch.setattr(callers, "_fetch_reservations", iam)
    monkeypatch.setenv("DATALAYER_USER_UID", OWNER)
    assert _proof("another-token")[0] == callers.Proof(False, reason="another-account")
    assert iam.asked == []


def test_iam_s_list_is_read_by_each_reservation_s_resource(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer owner-token"
        return httpx.Response(
            200,
            json={
                "success": True,
                "reservations": [
                    {"id": RUNTIME.upper(), "resource": RUNTIME.upper()},
                    {"id": "01only-an-id"},
                    "not-a-reservation",
                ],
            },
        )

    transport = httpx.MockTransport(answer)
    real = httpx.AsyncClient

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real(*args, transport=transport, **kwargs)

    monkeypatch.setattr(callers.httpx, "AsyncClient", client)
    status, resources = asyncio.run(
        callers._fetch_reservations(
            f"{IAM}/api/iam/v1/usage/reservations", "owner-token"
        )
    )
    assert status == 200 and resources == (RUNTIME, "01only-an-id")
