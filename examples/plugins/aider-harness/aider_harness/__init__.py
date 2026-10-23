# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness contributed by a pip package: ``aider``, through the reactor.

The package declares one entry point under ``datalayer.reactor.extensions``
(``pyproject.toml``) and :func:`extension` returns a ``ReactorExtension``
with one plugin, whose ``provide_contributions`` contributes the harness —
its spec read from ``aider.yaml`` beside this module, in the catalogue's
schema, and the ACP adapter that drives every ACP harness. Installed beside
agent-runtimes, ``loop harnesses`` lists it and an agent spec may say
``harness: aider``. Nothing in agent-runtimes is edited.

A yaml missing ``terms`` is refused at the seam, naming this plugin: a
harness whose terms are unknown is not served. ``AIDER_HARNESS_YAML`` names
another yaml to read, which is how the refusal is shown.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from reactor import ExtensionManifest, PluginManifest, ReactorExtension, hookimpl

PLUGIN = "aider-harness"


def spec_path() -> Path:
    return Path(
        os.environ.get("AIDER_HARNESS_YAML") or Path(__file__).with_name("aider.yaml")
    )


def harness_spec() -> Any:
    """The harness, as agent-runtimes types it (its register entry derived from the yaml)."""
    from agent_runtimes.types import HarnessRegisterEntry, HarnessSpec

    data = yaml.safe_load(spec_path().read_text(encoding="utf-8")) or {}
    terms = dict(data.get("terms") or {})
    registered = HarnessRegisterEntry(
        adapter=str(data.get("acp", {}).get("command") or ""),
        version=str(data.get("version") or ""),
        licence_source=str(data.get("docs") or ""),
        terms_source=str(data.get("docs") or ""),
        credential="None: the fake agent takes none",
    )
    # A yaml missing `terms` is contributed as it is: the seam refuses it, naming this plugin.
    data.setdefault("terms", {"served_to_third_parties": "unknown", "licence": ""})
    data["terms"] = {
        "served_to_third_parties": terms.get("served_to_third_parties", "unknown"),
        "licence": terms.get("licence", ""),
    }
    return HarnessSpec.model_validate({**data, "registered": registered.model_dump()})


class AiderPlugin:
    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        from agent_runtimes.adapters.acp_agent import acp_harness_agent
        from agent_runtimes.plugins.points import HARNESSES, HarnessContribution

        spec = harness_spec()
        contributions.contribute(
            HARNESSES,
            HarnessContribution(spec=spec, adapter=acp_harness_agent),
            contribution_id=spec.id,
        )


def extension() -> ReactorExtension:
    """The entry point."""
    return ReactorExtension(
        manifest=ExtensionManifest(
            name="aider-harness",
            version="0.0.1",
            display_name="Aider harness",
            description="Aider as a harness of agent-runtimes, from a package of its own.",
        ),
        plugins=[
            (
                PluginManifest(
                    name=PLUGIN,
                    version="0.0.1",
                    description="Contributes the aider harness.",
                ),
                AiderPlugin(),
            )
        ],
    )
