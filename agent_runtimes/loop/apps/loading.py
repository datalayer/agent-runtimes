# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application read for a runtime: validated by agentspecs, typed for the runtime.

An Appspec arrives as a document — the YAML or JSON of its file. It is
validated by the spec's own rules (`agentspecs.apps`), so that a runtime never
runs an application its builder's checks would refuse, and is then read into
the runtime's own type (`agent_runtimes.types.AppSpec`), which the rules and
the session work on.
"""

from __future__ import annotations

from typing import Any, List, Mapping

from agent_runtimes.types import AppSpec


class AppNotRunnable(ValueError):
    """An application that cannot be run, with the reasons, in sentences."""

    def __init__(self, problems: List[str]):
        self.problems = problems
        super().__init__(" ".join(problems))


def load_app(document: Mapping[str, Any]) -> AppSpec:
    """An application from its document, validated, or `AppNotRunnable`."""
    from agentspecs import apps as spec

    try:
        validated = spec.parse_app(dict(document))
    except spec.AppError as error:
        raise AppNotRunnable([str(error)]) from None
    problems = spec.app_problems(validated)
    if problems:
        raise AppNotRunnable(problems)
    data = spec.dump_app(validated)
    for rule in data.get("rules") or []:
        if isinstance(rule.get("applies_to"), str):
            rule["applies_to"] = [rule["applies_to"]]
    interface = data.setdefault("interface", {})
    interface.setdefault("layout", validated.layout.value)
    record = data.setdefault("record", {})
    record["retention_days"] = validated.record.retention_days
    data["setup"] = spec.app_setup(validated)
    return AppSpec.model_validate(data)


def agent_id_of(app: AppSpec) -> str:
    """The agent an application runs, without its version."""
    reference = app.agent or app.team
    base, _, version = reference.rpartition(":")
    return base if base and "." in version else reference


def connected_server_ids(app: AppSpec) -> List[str]:
    """The MCP servers an application reaches, without their versions: all it reaches."""
    ids: List[str] = []
    for connection in app.connections:
        base, _, version = connection.server.rpartition(":")
        server = base if base and "." in version else connection.server
        if server not in ids:
            ids.append(server)
    return ids
