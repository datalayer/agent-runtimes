# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The agent protocols, each a Reactor Plugin (AGENT_PROTOCOLS §3.1, decided 2026-10-12).

In Reactor's terms: every protocol an agent runtime speaks — MCP, A2A, Web
Bot Auth, and the ones to come (UCP, ACP as ``agentic_commerce``, PACT) — is
a **Plugin**: a :class:`~reactor.PluginManifest` and its implementation,
declaring its **Contribution Points**, named ``<protocol>.<point>``, and
contributing its defaults to them at ``order=100``; a host replaces one by
contributing at a lower order. **Every extension a protocol defines is a
Contribution Point of its plugin**, ``<protocol>.extension.<name>``: an
implementation of the extension is a **Contribution** to it, and the
protocol negotiates what it offers from what is contributed there.

A Reactor **Extension**, ``agent-protocols`` (:mod:`.extension`), groups the
protocol plugins for delivery: advertised under ``datalayer.reactor.extensions``,
it installs and uninstalls them together, and decides nothing.

Each plugin says what it is by contributing a :class:`ProtocolDescription`
to ``protocols.description``, the one point the ``agent-runtimes.protocols``
plugin declares; Studio and ``loop apps`` read it. Each protocol has its
``reactor-points.json``, which its Python and TypeScript tests hold it to.

Importing this module imports no protocol.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal, Optional

from reactor import (
    ContributionPoint,
    PluginManifest,
    PluginPlatform,
    define_contribution_point,
)

#: The core plugin's name: it declares :data:`DESCRIPTIONS`.
CORE_PLUGIN = "agent-runtimes.protocols"
#: The order of a plugin's own defaults; a host contributes lower to replace one.
DEFAULT_ORDER = 100

#: Where each protocol plugin says what it is.
DESCRIPTIONS: ContributionPoint["ProtocolDescription"] = define_contribution_point(
    "protocols.description"
)

Layer = Literal["transport", "consent", "identity", "commerce"]
Status = Literal["implemented", "partial", "planned"]


@dataclass(frozen=True)
class ProtocolDescription:
    """One protocol as its plugin implements it."""

    #: As code names it: ``mcp``, ``a2a``, ``web_bot_auth``… (never ``acp``
    #: for commerce: that is the Agent Client Protocol, PR-40).
    id: str
    name: str
    layer: Layer
    #: The specification version implemented, as the specification dates or numbers it.
    version: str
    #: What a runtime can be in it: ``client``, ``server``, ``signer``, ``verifier``…
    roles: tuple[str, ...]
    status: Status
    specification: str
    #: The plugin that implements it.
    plugin: str
    #: Its id in the agentspecs protocols catalogue (``agentspecs/protocols``,
    #: AGENT_PROTOCOLS PS-01): ``web-bot-auth``, ``acp``… — how Studio reads a
    #: runtime's answer against the catalogue (PR-50).
    catalogue: str
    #: The contribution points its plugin declares, its extensions' included.
    points: tuple[str, ...] = ()


class ProtocolsCorePlugin:
    """Declares ``protocols.description``; contributes nothing."""


def core_plugin() -> tuple[PluginManifest, ProtocolsCorePlugin]:
    """The plugin that declares the shared point."""
    return (
        PluginManifest(
            name=CORE_PLUGIN,
            version="1.0.0",
            description="What the agent protocols say they are.",
            tags=["agent-protocols"],
            contribution_points=[DESCRIPTIONS.id],
        ),
        ProtocolsCorePlugin(),
    )


def build_protocols_reactor(
    *,
    plugins: Iterable[tuple[PluginManifest, object]] = (),
    platform: Optional[PluginPlatform] = None,
) -> PluginPlatform:
    """A Reactor host with the ``agent-protocols`` Extension, then the host's ``plugins``.

    The host's plugins are registered last: their lower-order contributions
    replace the protocols' defaults (a signer, a shared nonce store, a
    discovery or an extension of their own).
    """
    from .extension import EXTENSION, extension

    platform = platform or PluginPlatform()
    if EXTENSION not in {entry["name"] for entry in platform.list_extensions()}:
        platform.register_extension_object(extension())
    for manifest, implementation in plugins:
        platform.register_plugin(manifest, implementation)
    return platform


def protocols_platform() -> PluginPlatform:
    """The runtime's own platform (one per process), the protocols registered on it."""
    from agent_runtimes.loop.apps.plugins import PLATFORM

    return build_protocols_reactor(platform=PLATFORM)


def first_contribution(
    platform: PluginPlatform, point: ContributionPoint[Any], label: str
) -> Any:
    """The lowest-order contribution to a single-provider point.

    None, or two at the same winning order, fails closed.
    """
    contributions = platform.get_contributions(point)
    if not contributions:
        raise LookupError(f"no {label} is contributed ({point.id})")
    if len(contributions) > 1 and contributions[0].order == contributions[1].order:
        raise LookupError(
            f"two {label}s are contributed at the same order ({point.id})"
        )
    return contributions[0].value


def optional_contribution(
    platform: PluginPlatform, point: ContributionPoint[Any], label: str
) -> Any | None:
    """Return what :func:`first_contribution` does, ``None`` when nothing is contributed."""
    if not platform.get_contributions(point):
        return None
    return first_contribution(platform, point, label)


def list_protocols(
    platform: PluginPlatform, tenant_id: Optional[str] = None
) -> list[ProtocolDescription]:
    """What the platform's protocol plugins say they are, one per protocol, by id.

    A lower-order description of the same protocol answers in place of the
    plugin's own (a plugin that implements it better).
    """
    by_id: dict[str, ProtocolDescription] = {}
    for contribution in reversed(platform.get_contributions(DESCRIPTIONS, tenant_id)):
        value = contribution.value
        if not isinstance(value, ProtocolDescription):
            raise TypeError(
                f"plugin {contribution.plugin} contributed {type(value).__name__} "
                "to protocols.description, not a ProtocolDescription"
            )
        by_id[value.id] = value
    return sorted(by_id.values(), key=lambda description: description.id)


__all__ = [
    "CORE_PLUGIN",
    "DEFAULT_ORDER",
    "DESCRIPTIONS",
    "ProtocolDescription",
    "ProtocolsCorePlugin",
    "build_protocols_reactor",
    "core_plugin",
    "first_contribution",
    "list_protocols",
    "optional_contribution",
    "protocols_platform",
]
