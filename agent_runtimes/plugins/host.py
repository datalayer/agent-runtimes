# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The runtime's plugin host for the session (MH-F01): the points read, the
refusals kept, ``loop plugins`` answered.

The platform is the runtime's own (``loop.apps.plugins.PLATFORM``, one per
process) with the ``agent-runtimes`` reactor extension registered on it, as
the protocols register theirs (``protocols_platform``), and every other
extension installed beside it discovered under
``datalayer.reactor.extensions`` — the reactor's group, nothing of our own.
A package whose entry point does not resolve is listed as refused with the
entry point and the error (Omnigent's ``extensions doctor``, borrowed); the
host runs with the rest.

A point is read through :func:`accepted`: what passed :func:`points.check`,
in order; what did not is in :func:`refusals` and said by ``loop plugins``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import Any, Dict, List, Optional

from reactor import ContributionPoint, PluginPlatform
from reactor.extensions import EXTENSION_ENTRY_POINT_GROUP

from agent_runtimes.plugins.points import POINTS, Refusal, check

logger = logging.getLogger(__name__)

#: The name of the runtime's own extension and of its built-in plugin.
EXTENSION = "agent-runtimes"
BUILTIN_PLUGIN = "agent-runtimes.sessions"


@dataclass
class HostState:
    """What the host knows beyond the platform: the refusals."""

    #: Entry points that did not resolve: ``name -> (entry point, error)``.
    failed: Dict[str, tuple[str, str]] = field(default_factory=dict)
    #: Whether discovery ran on this platform.
    discovered: bool = False


_STATES: Dict[int, HostState] = {}


def _state(platform: PluginPlatform) -> HostState:
    return _STATES.setdefault(id(platform), HostState())


def discover(platform: PluginPlatform, group: str = "") -> List[str]:
    """Register every extension installed under ``group`` — the platform's
    own (``datalayer.reactor.extensions``, the reactor's) when none is named
    — that the platform does not hold yet; one that does not load is kept as
    failed with its entry point and error, never retried as fatal. The names
    registered.
    """
    group = (
        group or getattr(platform, "extension_group", "") or EXTENSION_ENTRY_POINT_GROUP
    )
    state = _state(platform)
    registered: List[str] = []
    held = {entry["name"] for entry in platform.list_extensions()}
    for entry_point in entry_points(group=group):
        try:
            extension = entry_point.load()()
            name = getattr(extension, "name", None)
            if not isinstance(name, str) or not name:
                raise TypeError(
                    f"{entry_point.value} did not answer a ReactorExtension"
                )
            if name in held:
                state.failed.pop(entry_point.name, None)
                continue
            platform.register_extension_object(extension)
            held.add(name)
            registered.append(name)
            state.failed.pop(entry_point.name, None)
        except Exception as error:  # noqa: BLE001 - one broken extension is one missing extension
            reported = f"{type(error).__name__}: {error}"
            if state.failed.get(entry_point.name) != (entry_point.value, reported):
                logger.warning(
                    "Extension %r (%s) could not be loaded: %s",
                    entry_point.name,
                    entry_point.value,
                    reported,
                )
            state.failed[entry_point.name] = (entry_point.value, reported)
    state.discovered = True
    return registered


def session_platform(
    platform: Optional[PluginPlatform] = None, *, discover_installed: bool = True
) -> PluginPlatform:
    """The platform with the ``agent-runtimes`` extension on it, and what is
    installed beside it discovered once.
    """
    from agent_runtimes.loop.apps.plugins import PLATFORM
    from agent_runtimes.plugins.extension import extension

    platform = PLATFORM if platform is None else platform
    if EXTENSION not in {entry["name"] for entry in platform.list_extensions()}:
        platform.register_extension_object(extension())
    if discover_installed and not _state(platform).discovered:
        discover(platform)
    return platform


def accepted(
    platform: PluginPlatform,
    point: ContributionPoint[Any],
    tenant_id: Optional[str] = None,
) -> List[Any]:
    """The contributions of a point the seam accepts, in order."""
    passed, _ = check(point, platform.get_contributions(point, tenant_id))
    return passed


def refusals(platform: PluginPlatform) -> List[Refusal]:
    """Every contribution refused at the seam, over every point."""
    refused: List[Refusal] = []
    for point in POINTS:
        refused.extend(check(point, platform.get_contributions(point))[1])
    return refused


def describe_plugins(platform: PluginPlatform, name: str = "") -> Dict[str, Any]:
    """What ``loop plugins [<name>]`` says: every extension, its plugins and
    their contributions, and what was refused — one name given, that
    extension (or that failed entry point) alone.
    """
    by_plugin: Dict[str, List[Dict[str, Any]]] = {}
    for point in POINTS:
        passed, _ = check(point, platform.get_contributions(point))
        for contribution in passed:
            by_plugin.setdefault(contribution.plugin, []).append(
                {"point": point.id, "id": contribution.id, "order": contribution.order}
            )
    for described in platform.describe_contributions():
        if described["point"] in {point.id for point in POINTS}:
            continue
        for entry in described["contributions"]:
            by_plugin.setdefault(entry["plugin"], []).append(
                {
                    "point": described["point"],
                    "id": entry["id"],
                    "order": entry["order"],
                }
            )
    plugins = {held["name"]: held for held in platform.list_plugins()}
    extensions = []
    for extension in platform.list_extensions():
        if name and extension["name"] != name:
            continue
        extensions.append(
            {
                "name": extension["name"],
                "version": extension["version"],
                "description": extension["description"],
                "plugins": [
                    {
                        "name": plugin_name,
                        "enabled": plugins.get(plugin_name, {}).get("enabled", False),
                        "contributions": by_plugin.get(plugin_name, []),
                    }
                    for plugin_name in extension["plugins"]
                ],
            }
        )
    refused = [
        {
            "plugin": r.plugin,
            "point": r.point,
            "id": r.contribution_id,
            "reason": r.reason,
        }
        for r in refusals(platform)
        if not name or r.plugin == name or r.plugin.startswith(name + ".")
    ]
    failed = [
        {"name": entry_name, "entry_point": entry_point, "error": error}
        for entry_name, (entry_point, error) in _state(platform).failed.items()
        if not name or entry_name == name
    ]
    return {
        "extensions": extensions,
        "refused": refused,
        "failed": failed,
        "name": name,
        "known": [entry["name"] for entry in platform.list_extensions()],
    }


def plugins_lines(description: Dict[str, Any]) -> List[str]:
    """The description, as ``loop plugins`` prints it."""
    lines: List[str] = []
    for extension in description["extensions"]:
        lines.append(
            f"{extension['name']} {extension['version']} — {extension['description']}".rstrip(
                " —"
            )
        )
        for plugin in extension["plugins"]:
            said = (
                ", ".join(f"{c['point']} ({c['id']})" for c in plugin["contributions"])
                or "nothing contributed"
            )
            lines.append(
                f"  {plugin['name']}{'' if plugin['enabled'] else ' (disabled)'}: {said}"
            )
    if description["refused"] or description["failed"]:
        lines.append("Refused:")
        for failed in description["failed"]:
            lines.append(
                f"  {failed['name']} (entry point {failed['entry_point']}): {failed['error']}"
            )
        for refused in description["refused"]:
            lines.append(f"  {refused['reason']}")
    if (
        description["name"]
        and not description["extensions"]
        and not description["refused"]
        and not description["failed"]
    ):
        lines.append(
            f"There is no extension named {description['name']!r}: one of "
            + ", ".join(description["known"])
            + "."
        )
    return lines


__all__ = [
    "BUILTIN_PLUGIN",
    "EXTENSION",
    "HostState",
    "accepted",
    "describe_plugins",
    "discover",
    "plugins_lines",
    "refusals",
    "session_platform",
]
