# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent at its four addresses: what its servers share.

:class:`AddressedAgent` is one agent — a company's application, a published
one, or a person's own — with what its MCP, API and web servers and its agent
host answer from: its spec, its ``openapi`` (or the one ``ask`` operation of
an agent that declares none), its four hosts, who may call it, its PAP role,
and how its agent is reached for a call.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional

from agentspecs.openapi import OpenApiOperation, ask_document, openapi_operations

from agent_runtimes.addresses.access import (
    AddressAccess,
    AddressPolicy,
    Caller,
    TokenChecker,
)
from agent_runtimes.addresses.calls import CallRecord, CallRecorder, timed
from agent_runtimes.addresses.hosts import AddressHosts
from agent_runtimes.addresses.operations import (
    OperationAgent,
    OperationError,
    call_operation,
)
from agent_runtimes.types import AppSpec

#: What an agent is to the people and agents that reach it (its `poppy.json` says).
Role = Literal["company", "personal", "app"]

#: How the agent that answers a call is reached.
AgentSource = Callable[[], Awaitable[OperationAgent]]


@dataclass
class AddressedAgent:
    """One agent, at its addresses."""

    app: AppSpec
    access: AddressAccess
    agent_source: AgentSource
    hosts: Optional[AddressHosts] = None
    role: Role = "app"
    #: For a person's own agent: the handle of the person it acts for.
    acts_for: str = ""
    #: Where its calls are recorded (a runtime launched for a deployment); none locally.
    calls: Optional[CallRecorder] = None
    #: For a company served at its agent host: its PAP company
    #: (``PapCompanyCapability``), which its MCP server verifies tokens with.
    company: Any = None
    #: Whose a Datalayer token is, for its MCP server: the access check's token
    #: checker before the company's own tokens were added to it.
    platform_tokens: Optional[TokenChecker] = None

    def __post_init__(self) -> None:
        self.document: Dict[str, Any] = copy.deepcopy(
            self.app.openapi or ask_document(self.app.name, self.app.description)
        )
        self.operations: List[OpenApiOperation] = openapi_operations(self.document)
        if self.role == "company" and not self.app.pap.company.enabled:
            raise ValueError(
                f"{self.app.id} is no company: its pap.company is not enabled."
            )
        if self.role == "personal" and not self.acts_for:
            raise ValueError("A person's own agent says whom it acts for.")

    def operation(self, operation_id: str) -> OpenApiOperation:
        """The operation ``operation_id``; :class:`OperationError` 404 when it has none."""
        for operation in self.operations:
            if operation.operation_id == operation_id:
                return operation
        raise OperationError(
            404, f"{self.app.name} answers no operation {operation_id!r}."
        )

    async def call(
        self,
        operation_id: str,
        inputs: Dict[str, Any],
        *,
        interface: str = "api",
        caller: Optional[Caller] = None,
    ) -> Any:
        """Answer ``operation_id`` with ``inputs`` (:func:`call_operation`), the call
        recorded (:attr:`calls`) with who made it by which address."""
        elapsed = timed()
        usage: Dict[str, int] = {}
        status = 200
        try:
            operation = self.operation(operation_id)
            return await call_operation(
                await self.agent_source(), operation, inputs, usage
            )
        except OperationError as error:
            status = error.status
            raise
        except Exception:
            status = 500
            raise
        finally:
            if self.calls is not None:
                self.calls.record(
                    CallRecord(
                        interface=interface,
                        operation=operation_id,
                        caller=caller.kind if caller is not None else "anonymous",
                        person=caller.uid if caller is not None else "",
                        status=status,
                        duration_ms=elapsed(),
                        tokens=usage.get("tokens", 0),
                    )
                )

    def published_document(self) -> Dict[str, Any]:
        """Its ``openapi`` as its API publishes it: served from its API host."""
        document = copy.deepcopy(self.document)
        if self.hosts is not None:
            document["servers"] = [{"url": self.hosts.api}]
        return document


def role_of(app: AppSpec) -> Role:
    """A company when its ``pap.company`` is enabled; an application otherwise."""
    return "company" if app.pap.company.enabled else "app"


def app_from(reference: str) -> AppSpec:
    """An application by path (a YAML Appspec, its ``openapi`` read beside it) or by
    catalogue id."""
    from agentspecs import apps as spec

    from agent_runtimes.apps.loading import load_app

    path = Path(reference)
    if path.suffix in (".yaml", ".yml") or path.is_file():
        if not path.is_file():
            raise ValueError(f"{reference} is not a file.")
        return load_app(spec.dump_app(spec.load_app(path)))
    from agent_runtimes.specs.apps import get_app

    found = get_app(reference)
    if found is None:
        raise ValueError(
            f"No application {reference!r}: give a path to its Appspec, or a catalogue id."
        )
    return found


def local_agent_source(app: AppSpec) -> AgentSource:
    """The application's agent, made in this process from its spec (``local_agent``)."""
    from agent_runtimes.apps.agent import local_agent

    made: Dict[str, OperationAgent] = {}

    async def source() -> OperationAgent:
        if "agent" not in made:
            made["agent"] = OperationAgent(agent=local_agent(app))
        return made["agent"]

    return source


def runtime_agent_source(agent_id: str) -> AgentSource:
    """The agent of this runtime registered as ``agent_id``, with the toolsets of its runs."""

    async def source() -> OperationAgent:
        from agent_runtimes.routes.acp import _agents

        registered = _agents.get(agent_id)
        if registered is None:
            raise OperationError(503, f"The agent {agent_id} is not running here yet.")
        adapter = registered[0]
        pydantic_agent = getattr(adapter, "pydantic_agent", None)
        if pydantic_agent is None:
            raise OperationError(503, f"The agent {agent_id} answers no operation.")
        toolsets = await adapter.operation_toolsets()
        return OperationAgent(agent=pydantic_agent, toolsets=toolsets)

    return source


def local_addressed(
    reference: str,
    *,
    name: Optional[str] = None,
    policy: Optional[AddressPolicy] = None,
    access: Optional[AddressAccess] = None,
) -> AddressedAgent:
    """An application served by ``agent-runtimes serve --mode`` in this process."""
    from agent_runtimes.addresses.access import policy_from_environment

    app = app_from(reference)
    return AddressedAgent(
        app=app,
        access=access or AddressAccess(policy or policy_from_environment()),
        agent_source=local_agent_source(app),
        hosts=AddressHosts.of(name) if name else None,
        role=role_of(app),
    )


__all__ = [
    "AddressedAgent",
    "AgentSource",
    "Role",
    "app_from",
    "local_addressed",
    "local_agent_source",
    "role_of",
    "runtime_agent_source",
]
