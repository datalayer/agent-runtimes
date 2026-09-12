# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Composing and extending agent specs.

Tracked upstream as `datalayer/agentspecs#2`. Four specs that share a sandbox
variant, a toolset and a set of conventions should not drift apart by hand, so
a spec can say what it builds on:

    extends: loop-base:0.0.1        # inheritance — "the same agent, adjusted"
    includes: [notebook-surfaces]   # composition — "this bundle, wherever needed"

A **fragment** is not a runnable agent: no model, no system prompt, only
capability. That distinction is what avoids a recursion trap — if the notebook
specialists inherited from the base agent they would inherit its subagent list,
and `@NotebookCompactor` could delegate to itself. Shared capability goes in a
fragment; only the base declares subagents.

Resolution happens here, at generation time, so the generated catalogue stays
flat, the runtime keeps zero inheritance logic, the result is visible in a diff
— and the `runtimes-companion` sidecar, which forwards specs to the pod without
interpreting a single field (D33), never sees an unresolved `extends`.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

#: How deep an inheritance chain may go before it stops being readable.
MAX_EXTENDS_DEPTH = 3

#: Fields merged by appending, deduplicated, rather than replaced.
LIST_FIELDS = (
    "tags",
    "tools",
    "skills",
    "mcp_servers",
    "frontend_tools",
    "envvars",
    "suggestions",
)

#: Keyed collections merged entry by entry.
KEYED_FIELDS = {
    "frontend_render_tools": "tool",
}

#: Markers a child uses to drop something a parent granted.
REMOVE_PREFIX = "!remove "
REPLACE_MARKER = "!replace"


class CompositionError(ValueError):
    """A spec graph that cannot be resolved, named plainly."""


def _key_of(entry: Any) -> str:
    """The identity of a list entry, ignoring its version."""
    text = str(entry)
    base, _, version = text.rpartition(":")
    return base if base and "." in version else text


def merge_lists(parent: list[Any], child: list[Any]) -> list[Any]:
    """Append the child's entries to the parent's, honouring the markers.

    Append rather than replace, because the common case is "the parent's tools
    plus mine". `!replace` starts from nothing; `!remove x` drops one thing the
    parent granted — which a least-privilege specialist needs to be able to say.
    """
    if REPLACE_MARKER in child:
        remaining = [c for c in child if c != REPLACE_MARKER]
        return merge_lists([], remaining)

    removals = {
        _key_of(str(entry)[len(REMOVE_PREFIX) :])
        for entry in child
        if isinstance(entry, str) and entry.startswith(REMOVE_PREFIX)
    }
    additions = [
        entry
        for entry in child
        if not (isinstance(entry, str) and entry.startswith(REMOVE_PREFIX))
    ]

    merged: list[Any] = []
    seen: set[str] = set()
    for entry in [*parent, *additions]:
        key = _key_of(entry)
        if key in removals or key in seen:
            continue
        seen.add(key)
        merged.append(entry)
    return merged


def merge_keyed(parent: list[Any], child: list[Any], key: str) -> list[Any]:
    """Merge two lists of dicts by a key, child winning."""
    by_key: dict[str, Any] = {}
    order: list[str] = []
    for entry in [*parent, *child]:
        if not isinstance(entry, dict):
            continue
        identity = str(entry.get(key))
        if identity not in by_key:
            order.append(identity)
        by_key[identity] = {**by_key.get(identity, {}), **entry}
    return [by_key[identity] for identity in order]


def merge_spec(parent: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
    """Merge a child spec onto its parent."""
    merged = dict(parent)

    for field, value in child.items():
        if field in ("extends", "includes"):
            continue
        if field in LIST_FIELDS and isinstance(value, list):
            merged[field] = merge_lists(list(parent.get(field) or []), value)
        elif field in KEYED_FIELDS and isinstance(value, list):
            merged[field] = merge_keyed(
                list(parent.get(field) or []), value, KEYED_FIELDS[field]
            )
        elif field == "system_prompt_prepend":
            merged["system_prompt"] = (
                f"{value}\n\n{parent.get('system_prompt', '')}".strip()
            )
        elif field == "system_prompt_append":
            merged["system_prompt"] = (
                f"{parent.get('system_prompt', '')}\n\n{value}".strip()
            )
        else:
            # Scalars, and anything unlisted: the child wins.
            merged[field] = value

    return merged


def _lookup(
    ref: str,
    catalogue: dict[str, dict[str, Any]],
    kind: str,
) -> dict[str, Any]:
    base = _key_of(ref)
    spec = catalogue.get(base) or catalogue.get(ref)
    if spec is None:
        known = ", ".join(sorted(catalogue)[:8]) or "nothing"
        raise CompositionError(
            f"{kind} {ref!r} is not defined (known: {known}…)"
        )
    return spec


def resolve_spec(
    spec: dict[str, Any],
    specs: dict[str, dict[str, Any]],
    fragments: dict[str, dict[str, Any]],
    *,
    _seen: Optional[tuple[str, ...]] = None,
) -> dict[str, Any]:
    """Flatten one spec's `extends` chain and `includes`.

    Fragments are applied first and inheritance second, so a child's own
    `extends` parent can override capability a fragment brought in.
    """
    seen = _seen or ()
    identity = str(spec.get("id") or "")

    if identity in seen:
        chain = " → ".join([*seen, identity])
        raise CompositionError(f"Circular spec inheritance: {chain}")
    if len(seen) >= MAX_EXTENDS_DEPTH:
        raise CompositionError(
            f"Inheritance deeper than {MAX_EXTENDS_DEPTH} at {identity!r}: "
            "a spec graph nobody can read is worse than a repeated field"
        )

    resolved: dict[str, Any] = {}

    for include in spec.get("includes") or []:
        fragment = _lookup(str(include), fragments, "Fragment")
        resolved = merge_spec(resolved, {k: v for k, v in fragment.items() if k != "id"})

    parent_ref = spec.get("extends")
    if parent_ref:
        parent = _lookup(str(parent_ref), specs, "Parent spec")
        parent_resolved = resolve_spec(
            parent, specs, fragments, _seen=(*seen, identity)
        )
        resolved = merge_spec(resolved, parent_resolved)

    return merge_spec(resolved, spec)


def resolve_all(
    specs: Iterable[dict[str, Any]],
    fragments: Iterable[dict[str, Any]] = (),
) -> list[dict[str, Any]]:
    """Flatten a whole catalogue, leaving specs that compose nothing untouched."""
    by_id = {str(s.get("id")): s for s in specs if s.get("id")}
    fragments_by_id = {str(f.get("id")): f for f in fragments if f.get("id")}

    return [
        resolve_spec(spec, by_id, fragments_by_id)
        if (spec.get("extends") or spec.get("includes"))
        else spec
        for spec in by_id.values()
    ]
