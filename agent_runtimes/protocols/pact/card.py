# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Brand's A2A Agent Card, as PACT 1.0 reads it (§2.1, §5.1; AGENT_PROTOCOLS PR-11).

- the **interface URL**: the ``supportedInterfaces`` entry with
  ``protocolBinding: "HTTP+JSON"`` and ``protocolVersion: "1.0"`` — chosen
  by binding and version, never by position;
- the **personal-agent JWT** scheme: an ``httpAuthSecurityScheme`` with
  ``scheme: "Bearer"``, listed alone in one ``securityRequirements`` entry
  (required: a card without it is not a PACT card);
- the **delegation** (optional, the *Delegated* profile): an
  ``oauth2SecurityScheme`` with a ``deviceCode`` flow, required together with
  the JWT in a second entry — its device authorization and token URLs, its
  RFC 8414 metadata URL and its scopes, ``{id: description}``, each mapped to
  an action class (F-10) for Rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

#: Words in a scope id that make it change something: `orders:cancel` is a write.
_WRITE_WORDS = (
    "write",
    "cancel",
    "change",
    "update",
    "create",
    "delete",
    "rebook",
    "issue",
    "refund",
    "manage",
    "book",
)


class PactCardError(ValueError):
    """The card is not a PACT 1.0 card."""


@dataclass(frozen=True)
class PactScope:
    """A scope a Brand offers: its id, its description shown verbatim on consent."""

    id: str
    description: str

    @property
    def action_class(self) -> str:
        """``read`` or ``write`` (F-10), from the id; unknown is the most restricted."""
        verb = self.id.rsplit(":", 1)[-1].lower()
        if verb in ("read", "view", "list", "status", "lookup"):
            return "read"
        if any(word in verb for word in _WRITE_WORDS):
            return "write"
        # A Brand's own word nobody classed: never taken for a reader.
        return "write"


@dataclass(frozen=True)
class PactDelegation:
    """The card's delegated authority (the *Delegated* profile)."""

    device_authorization_url: str
    token_url: str
    metadata_url: str
    scopes: tuple[PactScope, ...]

    def scope(self, scope_id: str) -> PactScope:
        for scope in self.scopes:
            if scope.id == scope_id:
                return scope
        raise KeyError(scope_id)


@dataclass(frozen=True)
class PactCard:
    """What a personal agent needs of a Brand's card."""

    name: str
    interface_url: str
    identity_scheme: str
    delegation: Optional[PactDelegation] = None
    skills: tuple[str, ...] = field(default_factory=tuple)

    @property
    def profile(self) -> str:
        return "delegated" if self.delegation else "identity"


def _bearer(scheme: Mapping[str, Any]) -> bool:
    http = scheme.get("httpAuthSecurityScheme")
    return isinstance(http, Mapping) and str(http.get("scheme", "")).lower() == "bearer"


def read_card(card: Mapping[str, Any]) -> PactCard:
    """A Brand's card as PACT 1.0 reads it; :class:`PactCardError` when it is not one."""
    interfaces = [
        entry
        for entry in card.get("supportedInterfaces") or []
        if entry.get("protocolBinding") == "HTTP+JSON"
        and entry.get("protocolVersion") == "1.0"
    ]
    if not interfaces:
        raise PactCardError("the card offers no HTTP+JSON 1.0 interface")
    interface_url = str(interfaces[0]["url"]).rstrip("/")
    schemes = card.get("securitySchemes") or {}
    requirements = [
        dict(entry.get("schemes") or {})
        for entry in card.get("securityRequirements") or []
    ]
    alone = [
        names
        for names in requirements
        if len(names) == 1 and _bearer(schemes.get(next(iter(names)), {}))
    ]
    if not alone:
        raise PactCardError("the card does not ask for the personal-agent JWT alone")
    identity = next(iter(alone[0]))
    delegation = None
    for names in requirements:
        if len(names) != 2 or identity not in names:
            continue
        other = next(name for name in names if name != identity)
        oauth = (schemes.get(other) or {}).get("oauth2SecurityScheme")
        device = ((oauth or {}).get("flows") or {}).get("deviceCode")
        if not oauth or not device:
            continue
        if not oauth.get("oauth2MetadataUrl"):
            raise PactCardError("the delegation names no RFC 8414 metadata")
        delegation = PactDelegation(
            device_authorization_url=device["deviceAuthorizationUrl"],
            token_url=device["tokenUrl"],
            metadata_url=oauth["oauth2MetadataUrl"],
            scopes=tuple(
                PactScope(id=scope_id, description=str(description))
                for scope_id, description in (device.get("scopes") or {}).items()
            ),
        )
        break
    return PactCard(
        name=str(card.get("name", "")),
        interface_url=interface_url,
        identity_scheme=identity,
        delegation=delegation,
        skills=tuple(str(skill.get("id")) for skill in card.get("skills") or []),
    )


__all__ = ["PactCard", "PactCardError", "PactDelegation", "PactScope", "read_card"]
