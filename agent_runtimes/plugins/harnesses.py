# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Each harness of the catalogue as a plugin of the ``agent-runtimes`` extension.

A harness engine — Claude Code, Codex, OpenCode, pi and the ones listed but
not offered — is a Reactor plugin, ``agent-runtimes.harnesses.<id>``: it
contributes its :class:`~agent_runtimes.plugins.points.HarnessContribution`
(its spec and the ACP adapter that drives it) to the ``harness`` point, at
``order=0`` as the built-in plugin contributes its own, and its manifest is
its harness spec (``agentspecs/harnesses``, generated into
:mod:`agent_runtimes.specs.harnesses`; the user, 21 November 2026): its name
and description, the distribution that ships it, its tags, and the whole
spec under ``metadata.harness`` — the capabilities table a session relies on
(``resume``, ``fork_history``, ``interrupt``, ``steering``, ``images``,
``compaction``, ``modes``, ``auto_run``), what it requires (the keys it
takes locally only, the binaries), how it is launched over ACP, its terms
and its register entry (how its calls are answered on Datalayer). One
source: the YAML, the generated spec, then this.

Each depends on the built-in plugin, ``agent-runtimes.sessions``, which
declares ``harness``.
"""

from __future__ import annotations

from typing import Any

from reactor import PluginManifest, hookimpl

from agent_runtimes.plugins.host import BUILTIN_PLUGIN
from agent_runtimes.plugins.points import HARNESSES, HarnessContribution

#: A harness plugin's name, before its harness id.
HARNESS_PLUGIN_PREFIX = "agent-runtimes.harnesses."
#: The distribution that ships the harness plugins.
PACKAGE = "agent-runtimes"
#: Every harness plugin's own version; the spec's is under ``metadata.harness.version``.
PLUGIN_VERSION = "1.0.0"
#: Where a harness plugin's manifest keeps its spec.
HARNESS_KEY = "harness"
#: Every harness plugin's icon.
OCTICON = "terminal"
#: The order of its contribution: the built-in plugin's.
DEFAULT_ORDER = 0


def harness_plugin_name(harness_id: str) -> str:
    """The plugin of a harness of the catalogue."""
    return f"{HARNESS_PLUGIN_PREFIX}{harness_id}"


def harness_manifest(spec: Any) -> PluginManifest:
    """The manifest of a harness spec's plugin."""
    return PluginManifest(
        name=harness_plugin_name(spec.id),
        version=PLUGIN_VERSION,
        display_name=spec.name,
        description=" ".join(spec.description.split()),
        octicon=OCTICON,
        package=PACKAGE,
        tags=["agent-runtimes", *spec.tags],
        dependencies=[BUILTIN_PLUGIN],
        metadata={HARNESS_KEY: spec.model_dump(mode="json")},
    )


class HarnessPlugin:
    """Contributes one harness of the catalogue, with its ACP adapter."""

    def __init__(self, spec: Any) -> None:
        self.spec = spec

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        from agent_runtimes.adapters.acp_agent import acp_harness_agent

        harness = HarnessContribution(spec=self.spec, adapter=acp_harness_agent)
        contributions.contribute(
            HARNESSES, harness, contribution_id=harness.id, order=DEFAULT_ORDER
        )


def harness_plugins() -> list[tuple[PluginManifest, HarnessPlugin]]:
    """Every harness of the catalogue as its plugin, in the catalogue's order."""
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    return [
        (harness_manifest(spec), HarnessPlugin(spec))
        for spec in HARNESS_CATALOGUE.values()
    ]


__all__ = [
    "DEFAULT_ORDER",
    "HARNESS_KEY",
    "HARNESS_PLUGIN_PREFIX",
    "OCTICON",
    "PACKAGE",
    "PLUGIN_VERSION",
    "HarnessPlugin",
    "harness_manifest",
    "harness_plugin_name",
    "harness_plugins",
]
