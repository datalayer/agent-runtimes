# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""RFC 9421 signature bases, as Web Bot Auth needs them.

Written here over ``http-sfv`` and ``cryptography`` because the maintained
Python library (``http-message-signatures`` 2.0.1) ignores a component's
``;key=`` parameter, and Web Bot Auth covers ``"signature-agent";key="…"``
on every request: that library signs the wrong base and fails the draft's
vectors (AGENT_PROTOCOLS PR-20). Only what the draft and its vectors use is
supported — the derived components ``@method``, ``@authority``, ``@scheme``,
``@target-uri``, ``@path``, ``@query`` and ``@request-target``, header fields
with ``;key=`` (a Dictionary member) and ``;req`` (the request's, on a
response) — and anything else is refused, never guessed.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass, field
from typing import Iterable, Mapping, Sequence
from urllib.parse import urlsplit

import http_sfv

#: The derived components this implementation can produce.
DERIVED_COMPONENTS = (
    "@method",
    "@authority",
    "@scheme",
    "@target-uri",
    "@path",
    "@query",
    "@request-target",
)

#: The component parameters it understands.
COMPONENT_PARAMETERS = ("key", "req")


class SignatureBaseError(ValueError):
    """A component cannot be put in a signature base as asked."""


@dataclass(frozen=True)
class Component:
    """One covered component: its name and its parameters, in order."""

    name: str
    params: tuple[tuple[str, str | bool], ...] = ()

    @classmethod
    def parse(cls, text: str) -> "Component":
        """A component from its serialized identifier, ``"name";key="x"``."""
        item = http_sfv.Item()
        item.parse(text.encode())
        return cls.from_item(item)

    @classmethod
    def from_item(cls, item: http_sfv.Item) -> "Component":
        if not isinstance(item.value, str):
            raise SignatureBaseError("a component identifier is a string")
        params = tuple((str(k), v) for k, v in item.params.items())
        for name, _ in params:
            if name not in COMPONENT_PARAMETERS:
                raise SignatureBaseError(
                    f"component parameter `{name}` is not supported"
                )
        return cls(name=item.value.lower(), params=params)

    @property
    def key(self) -> str | None:
        for name, value in self.params:
            if name == "key":
                return str(value)
        return None

    @property
    def req(self) -> bool:
        return any(name == "req" and value is True for name, value in self.params)

    def item(self) -> http_sfv.Item:
        item = http_sfv.Item()
        item.value = self.name
        for name, value in self.params:
            item.params[name] = value
        return item

    def serialize(self) -> str:
        return str(self.item())


@dataclass(frozen=True)
class Message:
    """What a signature base is read from: a request, or a response and its request.

    Headers are matched without regard to case; a header given twice is one
    field whose values are joined with ``", "`` (RFC 9421 §2.1).
    """

    method: str
    url: str
    headers: Mapping[str, str] = field(default_factory=dict)
    #: The request a response answers, for components marked ``;req``.
    request: "Message | None" = None
    #: Whether this is a response (its derived components come from ``request``).
    is_response: bool = False

    def header(self, name: str) -> str | None:
        wanted = name.lower()
        values = [
            str(value).strip()
            for key, value in _items(self.headers)
            if key.lower() == wanted
        ]
        return ", ".join(values) if values else None


def _items(
    headers: Mapping[str, str] | Iterable[tuple[str, str]],
) -> list[tuple[str, str]]:
    multi = getattr(headers, "multi_items", None)
    if callable(multi):
        return list(multi())
    if isinstance(headers, Mapping):
        return list(headers.items())
    return list(headers)


def _authority(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if not host:
        raise SignatureBaseError(f"`{url}` has no authority")
    if ":" in host:
        host = f"[{host}]"
    port = parts.port
    default = {"http": 80, "https": 443}.get(parts.scheme.lower())
    return host if port is None or port == default else f"{host}:{port}"


def _derived(name: str, message: Message) -> str:
    if message.is_response:
        raise SignatureBaseError(
            f"`{name}` of a response is read from its request (`;req`)"
        )
    parts = urlsplit(message.url)
    if name == "@method":
        return message.method.upper()
    if name == "@authority":
        return _authority(message.url)
    if name == "@scheme":
        return parts.scheme.lower()
    if name == "@target-uri":
        return message.url
    if name == "@path":
        return parts.path or "/"
    if name == "@query":
        return f"?{parts.query}"
    if name == "@request-target":
        return (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
    raise SignatureBaseError(f"derived component `{name}` is not supported")


def component_value(component: Component, message: Message) -> str:
    """The value a component takes in a message (RFC 9421 §2)."""
    source = message
    if component.req:
        if message.request is None:
            raise SignatureBaseError(f"`{component.serialize()}` needs the request")
        source = message.request
    if component.name.startswith("@"):
        if component.key is not None:
            raise SignatureBaseError("a derived component takes no `key`")
        return _derived(component.name, source)
    raw = source.header(component.name)
    if raw is None:
        raise SignatureBaseError(f"covered header `{component.name}` is absent")
    if component.key is None:
        return raw
    dictionary = http_sfv.Dictionary()
    try:
        dictionary.parse(raw.encode())
    except ValueError as error:
        raise SignatureBaseError(
            f"`{component.name}` is not a Dictionary: {error}"
        ) from error
    if component.key not in dictionary:
        raise SignatureBaseError(f"`{component.name}` has no member `{component.key}`")
    return str(dictionary[component.key])


@dataclass(frozen=True)
class SignatureParams:
    """The ``@signature-params`` of one signature, in the order they are written."""

    components: tuple[Component, ...]
    params: tuple[tuple[str, int | str], ...]

    @classmethod
    def from_inner_list(cls, inner: http_sfv.InnerList) -> "SignatureParams":
        components = tuple(Component.from_item(item) for item in inner)
        params = tuple((str(k), v) for k, v in inner.params.items())
        return cls(components=components, params=params)

    def get(self, name: str) -> int | str | None:
        for key, value in self.params:
            if key == name:
                return value
        return None

    def inner_list(self) -> http_sfv.InnerList:
        inner = http_sfv.InnerList()
        for component in self.components:
            inner.append(component.item())
        for name, value in self.params:
            inner.params[name] = value
        return inner

    def serialize(self) -> str:
        return str(self.inner_list())


def signature_base(params: SignatureParams, message: Message) -> bytes:
    """The bytes signed (RFC 9421 §2.5): one line per component, then the params."""
    seen: set[str] = set()
    lines = []
    for component in params.components:
        identifier = component.serialize()
        if identifier in seen:
            raise SignatureBaseError(f"`{identifier}` is covered twice")
        seen.add(identifier)
        value = component_value(component, message)
        if "\n" in value:
            raise SignatureBaseError(f"`{identifier}` holds a newline")
        lines.append(f"{identifier}: {value}")
    lines.append(f'"@signature-params": {params.serialize()}')
    return "\n".join(lines).encode()


def content_digest(body: bytes) -> str:
    """The ``Content-Digest`` field of a body, SHA-256 (RFC 9530)."""
    digest = base64.b64encode(hashlib.sha256(body).digest()).decode()
    return f"sha-256=:{digest}:"


def serialize_signature(label: str, signature: bytes) -> str:
    """One ``Signature`` dictionary member."""
    return f"{label}=:{base64.b64encode(signature).decode()}:"


def serialize_signature_input(label: str, params: SignatureParams) -> str:
    """One ``Signature-Input`` dictionary member."""
    return f"{label}={params.serialize()}"


def parse_signatures(
    signature_input: str, signature: str
) -> list[tuple[str, SignatureParams, bytes]]:
    """Every labelled signature of a message: label, params, signature bytes."""
    inputs = http_sfv.Dictionary()
    inputs.parse(signature_input.encode())
    values = http_sfv.Dictionary()
    values.parse(signature.encode())
    out = []
    for label, inner in inputs.items():
        if not isinstance(inner, http_sfv.InnerList):
            raise SignatureBaseError(
                f"`Signature-Input` member `{label}` is not an inner list"
            )
        value = values.get(label)
        if value is None:
            raise SignatureBaseError(f"no `Signature` for `{label}`")
        if not isinstance(value.value, (bytes, bytearray)):
            raise SignatureBaseError(
                f"`Signature` member `{label}` is not a byte sequence"
            )
        out.append((label, SignatureParams.from_inner_list(inner), bytes(value.value)))
    return out


def components_of(names: Sequence[str]) -> tuple[Component, ...]:
    """Parse components from their serialized identifiers or bare names."""
    out = []
    for name in names:
        out.append(
            Component.parse(name) if name.startswith('"') else Component(name=name)
        )
    return tuple(out)
