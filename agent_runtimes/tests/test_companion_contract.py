# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The contract with the pod companion (D33).

Every runtime pod runs a `runtimes-companion` sidecar that boots it, snapshots
it, checkpoints it and ends it — and it does that by calling *this* server on a
fixed in-pod port. Those routes are a contract between two processes in one pod,
not internal detail.

The failure these tests exist to catch is quiet and expensive: an innocent
rename in `/api/v1/configure/*` or `/api/v1/agents/*` fails pod boot in
Kubernetes while every local test still passes. They belong to Phase 3 — the
first phase that touches those routes — rather than to the phase that
eventually breaks them.

The URLs below are copied from the companion's own source
(`k8s/services/runtimes-companion`). If one changes there, this file should be
the next thing that changes.
"""

from __future__ import annotations

import pytest
from fastapi.routing import APIRoute

from agent_runtimes.routes import agents_router, configure_router, history_router

#: Exactly what the companion calls on `127.0.0.1:8765`, with the API prefix
#: stripped — the shape the sidecar depends on.
COMPANION_CALLS: tuple[tuple[str, str, str], ...] = (
    ("POST", "/agents/configure-from-spec", "run-start-hooks configures the agent"),
    ("POST", "/agents/prepare-checkpoint", "checkpoint flushes DBOS state"),
    ("POST", "/agents/post-restore", "restore relaunches DBOS"),
    ("POST", "/agents/mcp-servers/start", "run-start-hooks starts MCP servers"),
    ("GET", "/history", "light checkpoint restore rehydrates history"),
    ("POST", "/agents/{agent_id}/trigger/run", "a trigger fires a run"),
)


def _routes() -> set[tuple[str, str]]:
    """Every (method, path) this server exposes on the routers the companion uses."""
    exposed: set[tuple[str, str]] = set()
    for router in (agents_router, configure_router, history_router):
        for route in router.routes:
            if isinstance(route, APIRoute):
                for method in route.methods:
                    exposed.add((method, route.path))
    return exposed


class TestInPodContract:
    @pytest.mark.parametrize(
        ("method", "path", "why"),
        COMPANION_CALLS,
        ids=[call[1] for call in COMPANION_CALLS],
    )
    def test_the_companion_can_still_reach_it(
        self, method: str, path: str, why: str
    ) -> None:
        assert (method, path) in _routes(), (
            f"The pod companion calls {method} {path} ({why}). Renaming or "
            "removing it fails pod boot in Kubernetes while every local test "
            "still passes — add a new route instead, and leave this one."
        )

    def test_configure_from_spec_still_takes_a_whole_spec(self) -> None:
        """The companion forwards `agent_spec` as-is, interpreting no field."""
        from agent_runtimes.routes.agents import ConfigureFromSpecRequest

        fields = ConfigureFromSpecRequest.model_fields
        for required in ("agent_spec_id", "agent_spec", "env_vars", "user_token"):
            assert required in fields, (
                f"The companion sends {required!r}; dropping it from the request "
                "model makes pod boot fail with a validation error."
            )

    def test_a_flattened_spec_round_trips(self) -> None:
        """A resolved spec is what travels; the pod cannot resolve one itself.

        The companion interprets no fields, so an unresolved `extends` would
        arrive somewhere that has no idea what to do with it (D29, D33).
        """
        from agent_runtimes.routes.agents import ConfigureFromSpecRequest
        from agent_runtimes.specs.agents.agents import AGENTSPECS

        spec = AGENTSPECS["jupyter-cell-fixer"]
        payload = spec.model_dump(by_alias=False)

        assert "extends" not in payload
        assert "includes" not in payload
        # And the composition really happened before it was generated.
        assert payload["frontend_tools"] == ["jupyter-notebook-propose:0.0.1"]

        request = ConfigureFromSpecRequest(
            agent_spec_id=spec.id, agent_spec=payload
        )
        assert request.agent_spec is not None
        assert request.agent_spec["id"] == "jupyter-cell-fixer"


class TestAdditiveOnly:
    def test_the_configure_router_still_answers_its_old_routes(self) -> None:
        """Phase 3 added to `/configure`; it must not have moved anything."""
        exposed = _routes()
        for path in (
            "/configure/inference/models",
            "/configure/inference/provider",
            "/configure/codemode/status",
            "/configure/agents/{agent_id:path}/spec",
        ):
            assert any(p == path for _, p in exposed), (
                f"{path} disappeared from the configure router. The companion and "
                "the web application both read these."
            )

    def test_the_new_routes_are_additions(self) -> None:
        exposed = _routes()
        # What Phase 3 added, beside the old ones rather than in place of them.
        assert ("GET", "/configure/models") in exposed
        assert ("GET", "/configure/skills") in exposed
