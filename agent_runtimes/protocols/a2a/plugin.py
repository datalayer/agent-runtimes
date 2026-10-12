# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A as a Reactor plugin (AGENT_PROTOCOLS PR-02).

A2A's extension mechanism (A2A 1.0, *Extensions*) names each extension by a
URI on the Agent Card's ``capabilities.extensions``. Each extension this
runtime implements is a Contribution Point of this plugin,
``a2a.extension.<name>``, whose contributions are :class:`A2AExtension`
providers; ``a2a.extension.other`` takes any extension a host or an
application adds by its URI. What a card publishes is what is contributed
there (:func:`card_extensions`); what a client may use with an agent is
negotiated from the same contributions (:func:`negotiate_extensions`).

Points:

- ``a2a.extension.orchestration`` — Datalayer's orchestration extension
  (pause at a checkpoint, steer): default ``datalayer``.
- ``a2a.extension.face`` — the agent's face (emoji, avatar): default
  ``datalayer``, published only when the card has a face.
- ``a2a.extension.other`` — any other extension, keyed by its URI: no
  default.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Protocol, runtime_checkable

from reactor import PluginManifest, PluginPlatform, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription
from .extensions import (
    CardExtension,
    extensions_of,
    merge_extensions,
    unsupported_required,
)

PLUGIN = "agent-runtimes.protocols.a2a"
SPECIFICATION = "1.0"

#: Datalayer's face extension URI (the same as ``routes.a2a.FACE_EXTENSION_URI``).
FACE_URI = "https://datalayer.ai/extensions/face/v1"


@dataclass(frozen=True)
class CardContext:
    """What an extension may read to say its params on one agent's card."""

    agent_id: str
    api_prefix: str = ""
    face: Mapping[str, str] | None = None
    extra: Mapping[str, Any] = field(default_factory=dict)


@runtime_checkable
class A2AExtension(Protocol):
    """One A2A extension this runtime implements."""

    uri: str
    description: str
    required: bool

    def params(self, context: CardContext) -> Optional[Mapping[str, Any]]:
        """Its params on this card; ``None`` when it is not published there."""
        ...


@dataclass(frozen=True)
class OrchestrationExtension:
    """Pause at a checkpoint and resume from it; steer a task while it works (O2-05)."""

    description: str = (
        "Pause at a checkpoint and resume from it; steer a task while it works."
    )
    required: bool = False

    @property
    def uri(self) -> str:
        from agent_runtimes.context.delegation import EXTENSION_URI

        return EXTENSION_URI

    def params(self, context: CardContext) -> Optional[Mapping[str, Any]]:
        return {
            "pause": f"{context.api_prefix}/a2a/pause",
            "steer": f"{context.api_prefix}/a2a/steer",
        }


@dataclass(frozen=True)
class FaceExtension:
    """Its face, for the clients that draw one: an emoji, and an avatar when it has one."""

    uri: str = FACE_URI
    description: str = "Its face: an emoji, and an avatar when it has one."
    required: bool = False

    def params(self, context: CardContext) -> Optional[Mapping[str, Any]]:
        return dict(context.face) if context.face else None


ORCHESTRATION = define_contribution_point("a2a.extension.orchestration")
FACE = define_contribution_point("a2a.extension.face")
OTHER = define_contribution_point("a2a.extension.other")
#: The extension points, in the order a card lists what they hold.
EXTENSION_POINTS = (ORCHESTRATION, FACE, OTHER)
POINTS = EXTENSION_POINTS

DESCRIPTION = ProtocolDescription(
    id="a2a",
    name="Agent2Agent",
    layer="transport",
    version=SPECIFICATION,
    roles=("client", "server"),
    status="implemented",
    specification="https://a2a-protocol.org/latest/specification/",
    plugin=PLUGIN,
    points=tuple(point.id for point in POINTS),
)


class A2APlugin:
    """Contributes A2A's description and Datalayer's two extensions."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contribute = contributions.contribute
        contribute(
            DESCRIPTIONS, DESCRIPTION, contribution_id="a2a", order=DEFAULT_ORDER
        )
        contribute(
            ORCHESTRATION,
            OrchestrationExtension(),
            contribution_id="datalayer",
            order=DEFAULT_ORDER,
        )
        contribute(
            FACE, FaceExtension(), contribution_id="datalayer", order=DEFAULT_ORDER
        )


def plugin() -> tuple[PluginManifest, A2APlugin]:
    """The A2A plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description="Agent2Agent 1.0: the extensions an agent card publishes and a client negotiates.",
            tags=["agent-protocols", "transport"],
            contribution_points=[point.id for point in POINTS],
        ),
        A2APlugin(),
    )


def _providers(platform: PluginPlatform) -> list[A2AExtension]:
    out: list[A2AExtension] = []
    for point in EXTENSION_POINTS:
        contributions = platform.get_contributions(point)
        if point is OTHER:
            out.extend(contribution.value for contribution in contributions)
        elif contributions:
            if (
                len(contributions) > 1
                and contributions[0].order == contributions[1].order
            ):
                raise LookupError(
                    f"two implementations of {point.id} at the same order"
                )
            out.append(contributions[0].value)
    return out


def card_extensions(
    platform: PluginPlatform,
    context: CardContext,
    declared: list[CardExtension | Mapping[str, Any]] | None = None,
) -> list[CardExtension]:
    """What one agent's card publishes: what is contributed, then what the card declares.

    A URI published twice is refused.
    """
    contributed = []
    for provider in _providers(platform):
        params = provider.params(context)
        if params is None:
            continue
        contributed.append(
            CardExtension(
                uri=provider.uri,
                description=provider.description,
                required=provider.required,
                params=dict(params),
            )
        )
    return merge_extensions(contributed, declared or [])


def negotiate_extensions(card: Any, platform: PluginPlatform) -> list[str]:
    """The extensions a client activates with an agent: those of its card it implements.

    ``ValueError`` when the card requires one nothing implements here: the
    agent is not called.
    """
    implemented = {provider.uri for provider in _providers(platform)}
    missing = unsupported_required(card, implemented)
    if missing:
        raise ValueError(
            f"the agent requires extensions not implemented here: {', '.join(missing)}"
        )
    return [
        extension.uri
        for extension in extensions_of(card)
        if extension.uri in implemented
    ]


__all__ = [
    "A2AExtension",
    "A2APlugin",
    "CardContext",
    "DESCRIPTION",
    "EXTENSION_POINTS",
    "FACE",
    "FACE_URI",
    "FaceExtension",
    "ORCHESTRATION",
    "OTHER",
    "OrchestrationExtension",
    "PLUGIN",
    "POINTS",
    "card_extensions",
    "negotiate_extensions",
    "plugin",
]
