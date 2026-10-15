# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An organization's own harness, served through the same adapter and Shield (SHIELD.md SH-46).

Drilled on the ACP SDK's fake agent as the organization's own command: read
from its organization's catalogue (IAM stood in for), validated with its
register entry, refused until an administrator admits the reviewed command
on the organization's policy, then launched over ACP and asked a turn whose
file edit the Shield decides; refused for another organization, for an
application of none, and once its command changes (the standalone Shield's
refusal is agent-shield's own test).
A listed harness is refused *listed, not drilled yet* (SH-57).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Iterator

import pytest
from agent_shield.policy import Harnesses, Policy
from agentspecs.harnesses import admission_id, organization_harness

from agent_runtimes.adapters.acp_agent import HarnessRefused, harness_agent
from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.guardrails import managed_policies
from agent_runtimes.guardrails.session_rules import session_rules
from agent_runtimes.tests.test_acp_agent import FAKE, Approvals
from agent_runtimes.tests.test_shield_policies import FakeIam, served

ORG = "org1"
SPEC = {
    "id": "org-acme-fake",
    "version": "0.0.1",
    "name": "Acme's own agent",
    "description": "The organization's own ACP agent: here the ACP SDK's fake one.",
    "acp": {
        "command": sys.executable,
        "args": [str(FAKE)],
        "mcp": "lend",
        "load_session": True,
    },
    "requires": {"binaries": ["acp-fake-agent@0.0.1"]},
    "terms": {
        "served_to_third_parties": "organizations_own",
        "licence": "Proprietary (Acme)",
    },
    "skills": {"format": "none"},
    "honours": {"model": False, "subagents": True},
}
REGISTER = {
    "adapter": "acp-fake-agent",
    "version": "0.0.1",
    "licence": "Proprietary (Acme)",
    "licence_source": "https://acme.example/agent/licence",
    "terms_source": "https://acme.example/agent/terms",
    "credential": "None: the drill's fake agent calls no model",
    "served_to_third_parties": "organizations_own",
}
REVIEWED = admission_id(organization_harness(SPEC, REGISTER)[0])


def catalogue_of(spec: dict[str, Any] = SPEC) -> Any:
    def read(uid: str) -> dict[str, Any]:
        return (
            {"org-acme-fake": {"spec": spec, "register": REGISTER}}
            if uid == ORG
            else {}
        )

    return read


def organization(*admit: str) -> Policy:
    return Policy(scope="organization", harnesses=Harnesses(admit=list(admit)))


@pytest.fixture
def iam() -> Iterator[FakeIam]:
    fake = FakeIam(served(organization(REVIEWED)))
    managed_policies.use_source(fake)
    yield fake
    managed_policies.use_source(None)
    session_rules().clear()


def build(tmp_path: Path, **overrides: Any) -> Any:
    fields: dict[str, Any] = dict(
        organization_uid=ORG,
        read_organization=catalogue_of(),
        workspace=tmp_path,
        environment={},
        approvals=Approvals(),
    )
    fields.update(overrides)
    return harness_agent("acme", "org-acme-fake", **fields)


@pytest.mark.asyncio
async def test_admitted_its_reviewed_command_runs_through_the_same_adapter_and_shield(
    iam: FakeIam, tmp_path: Path
) -> None:
    agent = build(tmp_path)
    assert agent.harness.id == "org-acme-fake"
    assert agent.harness.registered.terms_source == "https://acme.example/agent/terms"
    await agent.initialize()
    try:
        result = await agent.run(
            "edit the greeting", AgentContext(session_id="drill", user_id="ada")
        )
    finally:
        await agent.cleanup()
    assert (tmp_path / "hello.txt").read_text() == "hello, shield\n", result


def test_not_admitted_it_is_refused_and_a_policy_listing_none_admits_none(
    iam: FakeIam, tmp_path: Path
) -> None:
    iam.answer = served(organization("claude-code"))
    managed_policies.use_source(iam)
    with pytest.raises(HarnessRefused, match="does not admit it \\(claude-code\\)"):
        build(tmp_path)
    iam.answer = served(Policy(scope="organization"))
    managed_policies.use_source(iam)
    with pytest.raises(
        HarnessRefused,
        match="runs only once an administrator reviewed its command and admitted 'org-acme-fake@",
    ):
        build(tmp_path)


def test_a_changed_command_is_refused_until_reviewed_again(
    iam: FakeIam, tmp_path: Path
) -> None:
    changed = {**SPEC, "acp": {**SPEC["acp"], "args": [str(FAKE), "--anything"]}}
    with pytest.raises(
        HarnessRefused, match="its command changed since an administrator reviewed it"
    ):
        build(tmp_path, read_organization=catalogue_of(changed))


def test_another_organization_or_none_has_no_such_harness(
    iam: FakeIam, tmp_path: Path
) -> None:
    with pytest.raises(
        HarnessRefused, match="Organization org2 has no harness named 'org-acme-fake'"
    ):
        build(tmp_path, organization_uid="org2")
    with pytest.raises(HarnessRefused, match="belongs to no organization"):
        build(tmp_path, organization_uid="")


def test_its_register_entry_is_required(iam: FakeIam, tmp_path: Path) -> None:
    def unregistered(uid: str) -> dict[str, Any]:
        return {"org-acme-fake": {"spec": SPEC, "register": {}}}

    with pytest.raises(HarnessRefused, match="org-acme-fake"):
        build(tmp_path, read_organization=unregistered)


def test_a_listed_harness_is_refused_listed_not_drilled_yet(tmp_path: Path) -> None:
    with pytest.raises(HarnessRefused, match="listed, not drilled yet"):
        harness_agent("q", "qwen-code", workspace=tmp_path, environment={})
