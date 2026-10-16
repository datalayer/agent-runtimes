# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A Agent Card extensions, read and published (PR-02).

An Agent Card lists the extensions its agent supports under
``capabilities.extensions`` (A2A 1.0, *Extensions*): each a ``uri``, an
optional ``description``, ``required`` and ``params``. A client that does
not understand an extension the card marks ``required`` must not call the
agent; one it does not understand and that is not required, it ignores.

Reading accepts a card as JSON (camelCase), as a mapping in snake_case, or
as a ``fasta2a`` / ``a2a-sdk`` model; publishing gives ``fasta2a``'s
``AgentExtension``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping
from urllib.parse import urlsplit


@dataclass(frozen=True)
class CardExtension:
    """One extension an Agent Card advertises."""

    uri: str
    description: str = ""
    required: bool = False
    params: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        parts = urlsplit(self.uri)
        if not parts.scheme or not (parts.netloc or parts.scheme == "urn"):
            raise ValueError(f"an extension is named by a URI, not `{self.uri}`")

    def to_json(self) -> dict[str, Any]:
        """Return it as the card's JSON writes it."""
        out: dict[str, Any] = {"uri": self.uri}
        if self.description:
            out["description"] = self.description
        if self.required:
            out["required"] = True
        if self.params:
            out["params"] = dict(self.params)
        return out

    def to_fasta2a(self) -> Any:
        """Return it as ``fasta2a`` publishes it on a card it serves."""
        from fasta2a.schema import AgentExtension

        return AgentExtension(
            uri=self.uri,
            description=self.description,
            required=self.required,
            params=dict(self.params),
        )


def _get(value: Any, *names: str) -> Any:
    for name in names:
        if isinstance(value, Mapping):
            if name in value:
                return value[name]
        elif hasattr(value, name):
            return getattr(value, name)
    return None


def _model_dump(card: Any) -> Any:
    dump = getattr(card, "model_dump", None)
    if callable(dump):
        return dump(by_alias=True, exclude_none=True)
    return card


def extensions_of(card: Any) -> list[CardExtension]:
    """Every extension a card advertises, in its order.

    ``ValueError`` when the card's extensions are not a list of objects with
    a ``uri``, or a URI is advertised twice.
    """
    card = _model_dump(card)
    capabilities = _get(card, "capabilities")
    raw = _get(capabilities, "extensions") if capabilities is not None else None
    if raw is None:
        return []
    if not isinstance(raw, (list, tuple)):
        raise ValueError("capabilities.extensions is a list")
    out: list[CardExtension] = []
    for entry in raw:
        entry = _model_dump(entry)
        uri = _get(entry, "uri")
        if not isinstance(uri, str):
            raise ValueError("an extension of the card has no uri")
        params = _get(entry, "params") or {}
        if not isinstance(params, Mapping):
            raise ValueError(f"extension {uri}: params is an object")
        out.append(
            CardExtension(
                uri=uri,
                description=str(_get(entry, "description") or ""),
                required=bool(_get(entry, "required") or False),
                params=dict(params),
            )
        )
    uris = [extension.uri for extension in out]
    if len(set(uris)) != len(uris):
        raise ValueError("the card advertises an extension twice")
    return out


def find_extension(card: Any, uri: str) -> CardExtension | None:
    """The extension of a card with this URI, or ``None``."""
    return next((e for e in extensions_of(card) if e.uri == uri), None)


def unsupported_required(card: Any, supported: Iterable[str]) -> list[str]:
    """The extensions a card requires that the caller does not support.

    A client calls the agent only when this is empty.
    """
    known = set(supported)
    return [e.uri for e in extensions_of(card) if e.required and e.uri not in known]


def merge_extensions(
    builtin: Iterable[CardExtension],
    declared: Iterable[CardExtension | Mapping[str, Any]],
) -> list[CardExtension]:
    """The extensions a card publishes: the runtime's, then the declared ones.

    A declared extension is a :class:`CardExtension` or its JSON; one that
    names a URI already published is refused, never silently replaced.
    """
    out = list(builtin)
    seen = {extension.uri for extension in out}
    for entry in declared:
        extension = (
            entry
            if isinstance(entry, CardExtension)
            else CardExtension(
                uri=str(entry["uri"]),
                description=str(entry.get("description", "")),
                required=bool(entry.get("required", False)),
                params=dict(entry.get("params") or {}),
            )
        )
        if extension.uri in seen:
            raise ValueError(f"extension {extension.uri} is published twice")
        seen.add(extension.uri)
        out.append(extension)
    return out


__all__ = [
    "CardExtension",
    "extensions_of",
    "find_extension",
    "merge_extensions",
    "unsupported_required",
]
