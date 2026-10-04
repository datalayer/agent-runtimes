# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The plugins an organization has turned off, for the checks of an application (LOOP C-12).

An organization keeps the UI plugins of the catalogue it has turned off in IAM
(`GET /api/iam/v1/organizations/{uid}/plugins-off`, catalogue ids such as
``a2ui``). An application whose page uses a block of one of them says so in
its setup notes, in the words of the Studio's Canvas (agent-runtimes'
`blockSetupNotes`): `loop apps validate` and a runtime configured with the
application read the list with the caller's token. With no organization, or
when IAM cannot be read, none is off, and the reading says why.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from agent_runtimes.specs.ui_plugins import list_ui_plugins


@dataclass(frozen=True)
class PluginsOff:
    """The plugins turned off, and where the list came from, in a sentence."""

    plugins: List[str]
    says: str


def read_plugins_off(
    organization_uid: Optional[str],
    *,
    iam_url: str,
    token: Optional[str],
    timeout: float = 10.0,
) -> PluginsOff:
    """The plugins the organization has turned off, read from IAM with the caller's token.

    Parameters
    ----------
    organization_uid : str or None
        The organization the application runs for; none read without one.
    iam_url : str
        IAM's address.
    token : str or None
        The caller's token; IAM is not asked without one.
    timeout : float
        Seconds to wait for IAM.

    Returns
    -------
    PluginsOff
        The list, empty when it could not be read, and the sentence saying so.
    """
    import httpx

    if not organization_uid:
        return PluginsOff(
            [],
            "No organization was named: every plugin of the catalogue is taken as on.",
        )
    if not token:
        return PluginsOff(
            [],
            f"Not signed in: the plugins organization {organization_uid} has turned off "
            "were not read, and every plugin is taken as on.",
        )
    url = (
        f"{iam_url.rstrip('/')}/api/iam/v1/organizations/{organization_uid}/plugins-off"
    )
    try:
        response = httpx.get(
            url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout
        )
    except httpx.HTTPError as error:
        return PluginsOff(
            [],
            f"IAM could not be reached ({type(error).__name__}): the plugins organization "
            f"{organization_uid} has turned off were not read, and every plugin is taken as on.",
        )
    if response.status_code != 200:
        return PluginsOff(
            [],
            f"IAM answered {response.status_code} for the plugins organization "
            f"{organization_uid} has turned off: none was read, and every plugin is taken as on.",
        )
    plugins = [str(plugin) for plugin in response.json()["plugins_off"]]
    return PluginsOff(
        plugins,
        f"Organization {organization_uid} has turned off: {', '.join(plugins)}."
        if plugins
        else f"Organization {organization_uid} has turned no plugin off.",
    )


def components_used_by(interface: Any) -> List[str]:
    """The components an application's page names: those it may use, and those its surface places."""
    used: List[str] = []
    surface = interface.surface
    nodes: Sequence[Dict[str, Any]] = surface.components if surface is not None else []
    for name in [*interface.components, *(str(node["component"]) for node in nodes)]:
        if name not in used:
            used.append(name)
    return used


def unknown_plugins_off(plugins_off: Sequence[str]) -> List[str]:
    """The ids turned off that no UI plugin of the catalogue has."""
    known = {plugin.id for plugin in list_ui_plugins()}
    return [plugin for plugin in plugins_off if plugin not in known]


def plugins_off_setup_notes(interface: Any, plugins_off: Sequence[str]) -> List[str]:
    """What an application's page uses from a UI plugin that is off, one sentence per plugin.

    The sentence the Studio's Canvas says (`blockSetupNotes`). A UI plugin the
    catalogue does not offer contributes no block, so it takes nothing off.

    Parameters
    ----------
    interface : agentspecs.apps.AppInterface
        The application's interface: its components and its surface.
    plugins_off : sequence of str
        The catalogue ids its organization has turned off.

    Returns
    -------
    list of str
        One note per UI plugin whose blocks its page uses.
    """
    off = [
        plugin
        for plugin in list_ui_plugins()
        if plugin.id in plugins_off and plugin.enabled and plugin.components
    ]
    notes: List[str] = []
    used = components_used_by(interface)
    for plugin in off:
        names = [
            component.name
            for name in used
            for component in plugin.components
            if component.id == name
        ]
        if not names:
            continue
        one = len(names) == 1
        notes.append(
            f"The UI plugin “{plugin.name}” is not enabled, and its page uses its "
            f"{'block' if one else 'blocks'} {', '.join(names)}: "
            f"{'it is' if one else 'they are'} off the Canvas until it is."
        )
    return notes
