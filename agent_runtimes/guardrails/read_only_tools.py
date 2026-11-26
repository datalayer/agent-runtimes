# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The MCP tools that run without asking: those the catalogue classes ``read``.

A tool of an MCP server asks a person before it runs, until that person
approves it in the chat's tool menu. A tool the catalogue classes ``read``
only (`agentspecs.actions`: it looks, and changes nothing) is approved by
default instead: it runs without asking, and a tool that writes or acts
still asks (the user, 26 November 2026). The person can still turn approval
on for such a tool in the menu, and that choice wins (``streams.pubsub``).

Only the catalogue says what a tool does. A server's own ``readOnlyHint`` is
a claim by that server and is never read here, the catalogue's servers
included: their tools are classed in the catalogue by somebody who looked.
And the catalogue answers only for its own servers: a running server is the
catalogue's when it is reached exactly as the catalogue reaches it (the same
url, command and arguments). A server of an ``mcp.json``, a request's body
or a Kagent template that only borrows a catalogue id is not, and its tools
ask, as does every tool the catalogue does not class (an unknown tool is
never taken for a reader).

What else may ask is decided elsewhere and is not loosened by this default:
an agent spec's approval patterns (``ToolsGuardrailCapability``), an
application's Rules (``apps.enforcement``) and the Shield's policies each ask
on their own.

@module agent_runtimes.guardrails.read_only_tools
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Mapping, Optional, Set

logger = logging.getLogger(__name__)


def _python_name(server_id: str) -> str:
    """A server id as codemode names it: ``google-workspace`` is ``google_workspace``."""
    return "".join(c if c.isalnum() or c == "_" else "_" for c in server_id)


def catalogue_id_of(server_id: str) -> Optional[str]:
    """The catalogue id a running server's id stands for, or None.

    The runtime knows a catalogue server by its id, and codemode by that id
    as a Python name.
    """
    from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

    bare = str(server_id or "").split(":", 1)[0].strip()
    if not bare:
        return None
    if bare in MCP_SERVER_CATALOG:
        return bare
    for catalogue_id in MCP_SERVER_CATALOG:
        if _python_name(catalogue_id) == bare:
            return catalogue_id
    return None


#: What codemode's registries were built with, by the server's Python name:
#: (url, command, args) of each config one of them executes (review of 1.8.10).
_CODEMODE_CONFIGS: Dict[str, Set[tuple]] = {}


def note_codemode_config(
    name: str, url: str, command: str, args: Iterable[str]
) -> None:
    """Remember a config a codemode registry executes a server with, by its Python name."""
    _CODEMODE_CONFIGS.setdefault(_python_name(name), set()).add(
        (str(url or ""), str(command or ""), tuple(str(a) for a in args or []))
    )


def _running_configs(server_id: str, catalogue_id: str) -> list:
    """Every config the runtime runs a server with under this id.

    Its lifecycle's, its manager's, and those codemode's registries execute:
    a tool may be called through any of them, so each must be the catalogue's.
    """
    names = {server_id, catalogue_id}
    found: list = []
    try:
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        for instance in get_mcp_lifecycle_manager().get_all_running_servers():
            if instance.server_id in names:
                found.append(instance.config)
    except Exception:
        logger.debug("No MCP lifecycle manager to read %s from", server_id)
    try:
        from agent_runtimes.mcp import get_mcp_manager

        manager = get_mcp_manager()
        for name in (catalogue_id, server_id):
            config = manager.get_server(name)
            if config is not None:
                found.append(config)
    except Exception:
        logger.debug("No MCP manager to read %s from", server_id)
    for name in {_python_name(server_id), _python_name(catalogue_id)}:
        for url, command, args in _CODEMODE_CONFIGS.get(name, ()):
            found.append(_Reached(url, command, list(args)))
    return found


class _Reached:
    """How a codemode registry reaches a server, as ``reached_as_catalogued`` reads it."""

    def __init__(self, url: str, command: str, args: list) -> None:
        self.url, self.command, self.args = url, command, args


def reached_as_catalogued(config: Any, catalogued: Any) -> bool:
    """Whether a server is reached exactly as the catalogue reaches it."""
    if config is None or catalogued is None:
        return False
    return (
        str(getattr(config, "url", "") or "") == str(catalogued.url or "")
        and str(getattr(config, "command", "") or "") == str(catalogued.command or "")
        and list(getattr(config, "args", None) or []) == list(catalogued.args or [])
    )


def vouched_catalogue_id(server_id: str) -> Optional[str]:
    """The catalogue id of a running server the catalogue vouches for, or None."""
    from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

    catalogue_id = catalogue_id_of(server_id)
    if catalogue_id is None:
        return None
    configs = _running_configs(server_id, catalogue_id)
    catalogued = MCP_SERVER_CATALOG[catalogue_id]
    # Vouched only when every way the runtime reaches it is the catalogue's:
    # one custom endpoint under the same id, and its tools ask.
    if not configs or not all(reached_as_catalogued(c, catalogued) for c in configs):
        return None
    return catalogue_id


def read_only_tools(server_id: str, tool_names: Iterable[str]) -> Set[str]:
    """The tools of a running server that only read, as the catalogue classes them.

    Empty for a server the catalogue does not vouch for.
    """
    from agent_runtimes.apps.rules import classes_of, is_read_only

    catalogue_id = vouched_catalogue_id(server_id)
    if catalogue_id is None:
        return set()
    readers: Set[str] = set()
    for name in tool_names:
        bare = str(name or "").strip()
        if "__" in bare:
            bare = bare.split("__", 1)[1]
        # Everything the tool can do: what it is asked is not known yet.
        if bare and is_read_only(classes_of(f"{catalogue_id}.{bare}")):
            readers.add(bare)
    return readers


def read_only_tools_by_server(
    tools_by_server: Mapping[str, Iterable[str]],
) -> Dict[str, Set[str]]:
    """The tools that only read, by running server; servers with none left out."""
    result: Dict[str, Set[str]] = {}
    for server_id, names in tools_by_server.items():
        try:
            readers = read_only_tools(server_id, names)
        except Exception:
            # Fail safe: a server that cannot be read asks for each of its tools.
            logger.warning(
                "Could not read the classes of %s's tools: they ask", server_id
            )
            readers = set()
        if readers:
            result[server_id] = readers
    return result
