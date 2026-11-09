# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `identity.provider` point and the built-in `datalayer` provider (ID-20),
and the provider the runtime's target chooses for `identity.oauth_token` and
`@requires_oauth` (ID-22).
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import pytest
from reactor import PluginManifest, PluginPlatform, hookimpl

from agent_runtimes import identity
from agent_runtimes.agentcore.identity import AGENTCORE_IDENTITY
from agent_runtimes.identity.datalayer import DATALAYER_IDENTITY, DatalayerIdentity
from agent_runtimes.mcp import google_workspace
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import (
    IDENTITY_PROVIDERS,
    POINTS,
    IdentityProvider,
    IdentityRefused,
)


@pytest.fixture()
def platform() -> PluginPlatform:
    made = PluginPlatform(extension_group="agent-runtimes.tests.identity")
    host.session_platform(made, discover_installed=False)
    return made


class Contributing:
    def __init__(self, *entries: tuple[Any, str]) -> None:
        self.entries = entries

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        for value, cid in self.entries:
            contributions.contribute(
                IDENTITY_PROVIDERS, value, contribution_id=cid, order=50
            )


def _register(platform: PluginPlatform, name: str, *entries: tuple[Any, str]) -> None:
    platform.register_plugin(
        PluginManifest(name=name, version="0.0.1", description="a test plugin"),
        Contributing(*entries),
    )


# --- the point ------------------------------------------------------------------


def test_the_point_is_listed_and_both_providers_are_contributed(
    platform: PluginPlatform,
) -> None:
    assert IDENTITY_PROVIDERS in POINTS and IDENTITY_PROVIDERS.id == "identity.provider"
    accepted = host.accepted(platform, IDENTITY_PROVIDERS)
    assert [(c.id, c.plugin) for c in accepted] == [
        ("datalayer", host.BUILTIN_PLUGIN),
        ("agentcore", host.BUILTIN_PLUGIN),
    ]
    assert (
        accepted[0].value is DATALAYER_IDENTITY
        and accepted[1].value is AGENTCORE_IDENTITY
    )
    assert isinstance(DATALAYER_IDENTITY, IdentityProvider)
    assert isinstance(AGENTCORE_IDENTITY, IdentityProvider)


def test_a_malformed_or_duplicate_provider_is_refused_naming_the_plugin(
    platform: PluginPlatform,
) -> None:
    class NoBinding(DatalayerIdentity):
        id = "okta"
        complete_binding = None  # type: ignore[assignment]

    class Misnamed(DatalayerIdentity):
        id = "vault"

    _register(
        platform,
        "broken-identity",
        (object(), "nothing"),
        (NoBinding(), "okta"),
        (Misnamed(), "elsewhere"),
        (DatalayerIdentity(), "datalayer"),
    )
    refused = {r.contribution_id: r.reason for r in host.refusals(platform)}
    assert refused["nothing"] == (
        "broken-identity contributes identity.provider 'nothing' that is not an "
        "IdentityProvider: it lacks inbound_token, workload_token, oauth_token, api_key, "
        "complete_binding."
    )
    assert refused["okta"] == (
        "broken-identity contributes identity.provider 'okta' that is not an "
        "IdentityProvider: it lacks complete_binding."
    )
    assert refused["elsewhere"] == (
        "broken-identity contributes identity.provider 'elsewhere' whose provider says id "
        "'vault': a provider is contributed under its id."
    )
    assert refused["datalayer"] == (
        "broken-identity contributes identity.provider 'datalayer', which "
        "agent-runtimes.sessions contributed first: one identity.provider per id."
    )
    assert [c.id for c in host.accepted(platform, IDENTITY_PROVIDERS)] == [
        "datalayer",
        "agentcore",
    ]


def test_the_runtime_target_chooses_the_provider(
    platform: PluginPlatform, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    assert identity.active_provider_id() == "datalayer"
    assert identity.active_provider(platform) is DATALAYER_IDENTITY
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "agentcore")
    assert identity.active_provider_id() == "agentcore"
    assert identity.active_provider(platform) is AGENTCORE_IDENTITY


def test_a_provider_not_contributed_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.plugins import host as host_module

    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    monkeypatch.setattr(host_module, "accepted", lambda platform, point: [])
    with pytest.raises(
        IdentityRefused, match="No identity provider 'datalayer' is contributed"
    ):
        identity.active_provider(
            PluginPlatform(extension_group="agent-runtimes.tests.none")
        )


# --- the datalayer provider -----------------------------------------------------


@pytest.fixture()
def gmail(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, Optional[str]]]:
    asked: list[tuple[str, Optional[str]]] = []

    async def minted(agent_id: str, bearer: Optional[str]) -> str:
        asked.append((agent_id, bearer))
        if agent_id == "preview":
            raise google_workspace.GmailRefused(
                "Gmail is reached only by a deployed application, in the name of whom it acts "
                "for: not in a Preview or a local run."
            )
        return "ya29.minted"

    monkeypatch.setattr(google_workspace, "gmail_access_token", minted)
    return asked


def test_a_tools_oauth_token_through_the_builtin_provider(gmail) -> None:
    token = asyncio.run(
        DATALAYER_IDENTITY.oauth_token(
            "google-workspace",
            ["https://www.googleapis.com/auth/gmail.readonly"],
            "USER_FEDERATION",
            None,
            context={"agent_id": "app-agent", "bearer": "platform-jwt"},
        )
    )
    assert token == "ya29.minted"
    assert gmail == [("app-agent", "platform-jwt")]
    with pytest.raises(IdentityRefused, match="not in a Preview or a local run"):
        asyncio.run(
            DATALAYER_IDENTITY.oauth_token(
                "google-workspace",
                ["x"],
                "USER_FEDERATION",
                None,
                context={"agent_id": "preview"},
            )
        )
    with pytest.raises(IdentityRefused, match="holds no OAuth grant for github"):
        asyncio.run(
            DATALAYER_IDENTITY.oauth_token(
                "github", ["read:user"], "USER_FEDERATION", None
            )
        )
    with pytest.raises(IdentityRefused, match="No agent"):
        asyncio.run(
            DATALAYER_IDENTITY.oauth_token("google-workspace", ["x"], "M2M", None)
        )


def test_requires_oauth_through_the_builtin_provider(
    gmail, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)

    @identity.requires_oauth("google-workspace", scopes=["gmail.readonly"])
    async def unread(folder: str, *, access_token: str) -> str:
        return f"{folder} with {access_token}"

    async def run() -> str:
        with identity.use_identity_context({"agent_id": "app-agent", "bearer": "jwt"}):
            return await unread("inbox")

    assert asyncio.run(run()) == "inbox with ya29.minted"
    assert gmail == [("app-agent", "jwt")]

    with pytest.raises(TypeError, match="decorates a coroutine function"):

        @identity.requires_oauth("google-workspace", scopes=["x"])
        def synchronous(*, access_token: str) -> str:
            return access_token


def test_api_key_is_a_declared_secret_given_to_the_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.guardrails import declared_secrets

    monkeypatch.setenv("TAVILY_API_KEY", "tvly-1")
    monkeypatch.setattr(declared_secrets, "on_a_deployment", lambda: False)
    assert asyncio.run(DATALAYER_IDENTITY.api_key("TAVILY_API_KEY")) == "tvly-1"
    monkeypatch.setattr(declared_secrets, "on_a_deployment", lambda: True)
    monkeypatch.setattr(declared_secrets, "given_names", lambda: frozenset())
    with pytest.raises(
        IdentityRefused, match="not among the secrets this runtime's specs declare"
    ):
        asyncio.run(DATALAYER_IDENTITY.api_key("TAVILY_API_KEY"))
    monkeypatch.setattr(
        declared_secrets, "given_names", lambda: frozenset({"TAVILY_API_KEY"})
    )
    assert asyncio.run(DATALAYER_IDENTITY.api_key("TAVILY_API_KEY")) == "tvly-1"
    monkeypatch.delenv("TAVILY_API_KEY")
    with pytest.raises(IdentityRefused, match="was not given to this runtime"):
        asyncio.run(DATALAYER_IDENTITY.api_key("TAVILY_API_KEY"))


def test_inbound_workload_and_binding(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.apps import principal

    assert (
        asyncio.run(DATALAYER_IDENTITY.inbound_token({"token": "jwt"}, "any")) == "jwt"
    )
    with pytest.raises(IdentityRefused, match="nobody is signed in"):
        asyncio.run(DATALAYER_IDENTITY.inbound_token({}, "any"))

    monkeypatch.setattr(
        principal,
        "principal_token_refusal",
        lambda uid: (
            None if uid == "dep-1" else f"The agent of deployment {uid} holds no token."
        ),
    )
    monkeypatch.setattr(principal, "principal_token", lambda uid: "principal-jwt")
    assert asyncio.run(
        DATALAYER_IDENTITY.workload_token({"deployment_uid": "dep-1"})
    ) == ("principal-jwt")
    with pytest.raises(IdentityRefused, match="deployment dep-2 holds no token"):
        asyncio.run(DATALAYER_IDENTITY.workload_token({"deployment_uid": "dep-2"}))
    with pytest.raises(IdentityRefused, match="No deployment"):
        asyncio.run(DATALAYER_IDENTITY.workload_token({}))
    with pytest.raises(IdentityRefused, match="binds a consent on its own pages"):
        asyncio.run(DATALAYER_IDENTITY.complete_binding("urn:x", {"user_token": "t"}))
