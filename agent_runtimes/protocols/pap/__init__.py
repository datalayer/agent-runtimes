# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Personal Agent Protocol as a Reactor plugin of the ``agent-protocols`` Extension.

PAP's own plugins come with its SDK (``personal-agent-protocol.core`` and
``personal-agent-protocol.company``, the ``pap.*`` and ``pap.company.*``
points), registered on the PAP Reactor each personal agent or company builds
(``build_pap_reactor``, ``build_company``). This plugin says what a runtime
implements of PAP on ``protocols.description`` and declares the one point the
runtime adds between a company service and the application it asks:

- ``pap.company.operationTickets``: where a perform turn's one-use ticket is
  redeemed for the operation the person confirmed (PAP_DATALAYER B-04). The
  default is Datalayer's company service (ai-agents); a local company
  (:class:`agent_runtimes.pap.PapCompanyCapability`) contributes its own
  tickets at a lower order on the runtime's platform.

The agent's surfaces are the capabilities of :mod:`agent_runtimes.pap`.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from reactor import PluginManifest, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription

PLUGIN = "agent-runtimes.protocols.pap"

#: Where a perform turn's ticket is redeemed (single: the lowest order answers).
OPERATION_TICKETS = define_contribution_point("pap.company.operationTickets")

POINTS = (OPERATION_TICKETS.id,)


@runtime_checkable
class OperationTickets(Protocol):
    """Redeems a one-use ticket for the operation the person confirmed.

    Answers ``{"action", "tool", "terms"}`` once; ``None``, or an error, for a
    ticket it does not honour (unknown, used, expired): nothing is performed then. ``credential`` is the run's own
    (the token the company service minted for it), for a service that checks it.
    """

    async def redeem(self, ticket: str, credential: str) -> dict[str, Any] | None: ...


class CompanyServiceTickets:
    """The default: Datalayer's company service (ai-agents) redeems the ticket."""

    async def redeem(self, ticket: str, credential: str) -> dict[str, Any] | None:
        import httpx  # noqa: PLC0415
        from datalayer_core.utils.urls import DatalayerURLs  # noqa: PLC0415

        base = (
            getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        ).rstrip("/")
        if not base:
            raise RuntimeError("No company service to redeem the operation at")
        headers = {"Authorization": f"Bearer {credential}"} if credential else {}
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            answered = await client.post(
                f"{base}/api/ai-agents/v1/pap-company/operations/redeem",
                json={"ticket": ticket},
            )
        if answered.status_code != 200:
            raise RuntimeError(
                f"The company service did not honour the ticket ({answered.status_code})"
            )
        body = answered.json()
        return body if isinstance(body, dict) else None


def _version() -> str:
    from personal_agent_protocol import PROTOCOL_PROFILE  # noqa: PLC0415

    return str(PROTOCOL_PROFILE)


class PapPlugin:
    """Contributes PAP's description and the company service's tickets."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            DESCRIPTIONS,
            ProtocolDescription(
                id="pap",
                name="Personal Agent Protocol",
                layer="consent",
                version=_version(),
                roles=("personal-agent", "company"),
                status="implemented",
                specification="https://personalagentprotocol.org/docs/spec",
                plugin=PLUGIN,
                catalogue="pap",
                points=POINTS,
            ),
            contribution_id="pap",
            order=DEFAULT_ORDER,
        )
        contributions.contribute(
            OPERATION_TICKETS,
            CompanyServiceTickets(),
            contribution_id="company-service",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, PapPlugin]:
    """The PAP plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description="Personal Agent Protocol: a person's agent at companies, and an application as a company, over the PAP SDK.",
            tags=["agent-protocols", "consent"],
            contribution_points=list(POINTS),
        ),
        PapPlugin(),
    )


__all__ = [
    "OPERATION_TICKETS",
    "PLUGIN",
    "POINTS",
    "CompanyServiceTickets",
    "OperationTickets",
    "PapPlugin",
    "plugin",
]
