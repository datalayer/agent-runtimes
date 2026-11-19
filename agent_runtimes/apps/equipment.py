# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application's agent is equipped with, said to its page.

An application's composer lists the MCP servers and the skills its agent
declares — every one, running or not — each with its state and, when it is
off, why (the user, 18 November 2026: "those selectors should indicate all
the available (enabled or disabled)"):

- an **MCP server** is ``started``, ``starting``, ``failed`` (with the
  reason its start gave), ``not_started``, or ``left_out``: optional, and the
  secrets it needs are not set up on this runtime;
- a **skill** is ``active``, or ``not_activated``: optional or under an
  any-of rule, and what it needs is not set up.

Why one is off is said by the *names* of the variables it needs, never by a
value (``LeftOut.as_names``, :mod:`agent_runtimes.guardrails.declared_secrets`).
What is left out is decided in one place (``routes.agents.left_out_of``), on
this runtime's environment as it is now; the servers' states are the
lifecycle manager's. The route only reads: it gives nobody a way to switch
anything.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional

#: The states of an MCP server, as a page shows them.
MCP_STATES = ("started", "starting", "failed", "not_started", "left_out")

#: The states of a skill.
SKILL_STATES = ("active", "not_activated")


def _bare(ref: Any) -> str:
    """An id without its version: ``crawl:0.0.1`` is ``crawl``."""
    return str(ref or "").split(":", 1)[0]


def _field(item: Any, name: str) -> Any:
    """A field of a spec's item, whether a model or the dict of one."""
    if isinstance(item, Mapping):
        return item.get(name)
    return getattr(item, name, None)


def _id_of(item: Any) -> str:
    return _bare(item if isinstance(item, str) else _field(item, "id"))


def _optional_ids(spec: Any, kind: str) -> List[str]:
    """What a spec says optional, of a kind (``mcp_servers``, ``skills``)."""
    return [_bare(each) for each in (_field(_field(spec, "optional"), kind) or [])]


def _skill_row(skill_id: str) -> Dict[str, Any]:
    """A skill's name and description, as the catalogue says them."""
    from agent_runtimes.specs.skills import get_skill_spec

    known = get_skill_spec(skill_id)
    return {
        "id": skill_id,
        "name": (known.name if known is not None else "") or skill_id,
        "description": (known.description if known is not None else "") or "",
    }


def equipment(
    spec: Any,
    *,
    left_out: Optional[Mapping[str, Any]] = None,
    any_of: Iterable[str] = (),
    mcp_status: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """The MCP servers and skills a spec declares, each with its state and why.

    Parameters
    ----------
    spec : Any
        The agent's spec: an ``Agentspec`` or the dict of one. Its
        ``mcp_servers`` and ``skills``, in its order, and what it says
        ``optional``.
    left_out : Optional[Mapping[str, Any]]
        What the agent starts without here, by name (``LeftOut.as_names()``).
    any_of : Iterable[str]
        The ids of the skills under an any-of rule: left out when unmet,
        whether or not the spec lists them under ``optional``.
    mcp_status : Optional[Mapping[str, Any]]
        The servers' live status (``get_config_mcp_toolsets_status()``).

    Returns
    -------
    Dict[str, Any]
        ``mcp_servers`` and ``skills``, a row each: ``id``, ``name``,
        ``optional``, ``state``, ``reason`` (a sentence's worth, or None) and
        the variable names (``missing_env_vars``; ``one_of_env_vars`` for a
        skill). Never a value.
    """
    left = left_out or {}
    left_servers: Mapping[str, Any] = left.get("mcp_servers") or {}
    left_skills: Mapping[str, Any] = left.get("skills") or {}
    live = {
        _bare(each.get("id")): each
        for each in ((mcp_status or {}).get("servers") or [])
        if isinstance(each, Mapping)
    }
    optional_servers = set(_optional_ids(spec, "mcp_servers"))
    optional_skills = set(_optional_ids(spec, "skills")) | {_bare(s) for s in any_of}

    servers: List[Dict[str, Any]] = []
    for item in _field(spec, "mcp_servers") or []:
        server_id = _id_of(item)
        if not server_id or any(row["id"] == server_id for row in servers):
            continue
        row: Dict[str, Any] = {
            "id": server_id,
            "name": ("" if isinstance(item, str) else _field(item, "name"))
            or server_id,
            "optional": server_id in optional_servers,
            "state": "not_started",
            "reason": None,
            "missing_env_vars": [],
        }
        if server_id in left_servers:
            said = left_servers[server_id]
            row.update(
                state="left_out",
                reason=said.get("reason"),
                missing_env_vars=list(said.get("missing_env_vars") or []),
            )
        elif server_id in live:
            status = str(live[server_id].get("status") or "")
            row["state"] = status if status in MCP_STATES else "not_started"
            if row["state"] == "failed":
                row["reason"] = (
                    live[server_id].get("reason")
                    or live[server_id].get("error")
                    or None
                )
            if row["state"] == "started":
                row["tools"] = int(live[server_id].get("tools_count") or 0)
        servers.append(row)

    skills: List[Dict[str, Any]] = []
    for item in _field(spec, "skills") or []:
        skill_id = _id_of(item)
        if not skill_id or any(row["id"] == skill_id for row in skills):
            continue
        row = {
            **_skill_row(skill_id),
            "optional": skill_id in optional_skills,
            "state": "active",
            "reason": None,
            "missing_env_vars": [],
            "one_of_env_vars": [],
        }
        if skill_id in left_skills:
            said = left_skills[skill_id]
            row.update(
                state="not_activated",
                reason=said.get("reason"),
                missing_env_vars=list(said.get("missing_env_vars") or []),
                one_of_env_vars=list(said.get("one_of_env_vars") or []),
            )
        skills.append(row)
    return {"mcp_servers": servers, "skills": skills}


def equipment_of_agent(agent_id: str) -> Optional[Dict[str, Any]]:
    """What an agent of this runtime is equipped with, now; None for no such agent.

    Its spec is the one forwarded at its creation, else the library's; what
    it starts without is decided as at its creation (``left_out_of``), on
    this runtime's environment as it is now.
    """
    from agent_runtimes.guardrails.declared_secrets import declared_secrets
    from agent_runtimes.mcp import get_config_mcp_toolsets_status
    from agent_runtimes.routes.agents import (
        get_library_agent_spec,
        get_stored_agent_spec,
        left_out_of,
    )

    stored = get_stored_agent_spec(agent_id)
    if stored is None:
        return None
    spec_id = stored.get("agent_spec_id")
    library = (
        get_library_agent_spec(spec_id)
        if isinstance(spec_id, str) and spec_id
        else None
    )
    forwarded = stored.get("agent_spec") or None
    spec = forwarded if forwarded else library
    if spec is None:
        return {"agent": agent_id, "mcp_servers": [], "skills": []}
    declared = declared_secrets(
        library,
        forwarded_spec=forwarded or {},
        app_spec=stored.get("app_spec"),
        app_instance=stored.get("app_instance"),
        resolve_agent=get_library_agent_spec,
    )
    prefix = "the skill "
    left_out = left_out_of(declared).as_names()
    # On the visitors' runtime, a server fenced to the demo account's own
    # secrets (the Traveller's google-maps) is listed only as it runs with
    # them, and not at all otherwise (`battle_books`).
    from agent_runtimes.apps.battle_books import owners_secret_servers_shown

    hidden, running = owners_secret_servers_shown(
        (stored.get("app_spec") or {}).get("connections") or [],
        stored.get("app_instance"),
    )
    for server_id in running:
        left_out["mcp_servers"].pop(server_id, None)
    found = equipment(
        spec,
        left_out=left_out,
        any_of=[
            label[len(prefix) :]
            for label in declared.any_of
            if label.startswith(prefix)
        ],
        mcp_status=get_config_mcp_toolsets_status(),
    )
    if hidden:
        found["mcp_servers"] = [
            row for row in found["mcp_servers"] if row["id"] not in hidden
        ]
    return {"agent": agent_id, **found}
