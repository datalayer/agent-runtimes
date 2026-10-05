# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's agent: the agent it names, with its rules, checks and record.

Whoever runs an application — a runtime configured with its spec, or an
``app.py`` driven in-process — attaches the same three capabilities to its
agent (`app_capabilities`): its rules decide every tool call, its checks look
at what the rules let through, and its record keeps what happened.

`AppAgent` is what a session's code calls (``session.agent``): one agent, one
conversation, its history kept from turn to turn.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, List, Optional

from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)
from pydantic_ai.run import AgentRunResultEvent
from reactor import ContributionRegistry

from agent_runtimes.loop.apps.documents import AppDocumentsCapability, knows_documents
from agent_runtimes.loop.apps.enforcement import Ask as RuleAsk
from agent_runtimes.loop.apps.frames import (
    NO_ORGANIZATION,
    OrganizationFrames,
    frames_instructions,
)
from agent_runtimes.loop.apps.guards import AppChecks, AppChecksCapability
from agent_runtimes.loop.apps.guards import Ask as CheckAsk
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.plugins import rules_for
from agent_runtimes.loop.apps.record import AppRecordCapability, AppRecorder
from agent_runtimes.types import Agentspec, AppSpec

#: How a host builds the agent an application runs, from its spec.
AgentFactory = Callable[[AppSpec], Agent]


def app_capabilities(
    app: AppSpec,
    *,
    recorder: AppRecorder,
    agent_id: Optional[str] = None,
    ask_rule: Optional[RuleAsk] = None,
    ask_check: Optional[CheckAsk] = None,
    registry: Optional[ContributionRegistry] = None,
) -> List[Any]:
    """The capabilities an application's agent runs with, in their order.

    Parameters
    ----------
    app : AppSpec
        The application.
    recorder : AppRecorder
        Where its record is kept until it is sent.
    agent_id : str, optional
        The runtime's id of the agent, for the tool-approval path.
    ask_rule : callable, optional
        How the person is asked when a rule says so; the tool-approval path when unsaid.
    ask_check : callable, optional
        How the person is asked when a Gate says so; the tool-approval path when unsaid.
    registry : ContributionRegistry, optional
        The Reactor registry the rules are found in; the runtime's when unsaid.

    Returns
    -------
    list
        Its rules first, then its checks — a call the rules refuse is not
        checked, and a Guard reads what the rules decided — then its record,
        and the tool that searches its documents when it names some.
    """
    rules = rules_for(app, agent_id=agent_id, registry=registry)
    rules.record = recorder.decided
    if ask_rule is not None:
        rules.ask = ask_rule
    checks = AppChecksCapability(
        checks=AppChecks.of(app),
        agent_id=agent_id,
        ask=ask_check,
        decide=rules.decide,
        record=recorder.checked,
    )
    capabilities: List[Any] = [rules, checks, AppRecordCapability(recorder=recorder)]
    # Answers that may be heard are written for the ear too (VOICE.md VO-44).
    from agent_runtimes.voice import voice_capability

    voicing = voice_capability(app)
    if voicing is not None:
        capabilities.append(voicing)
    # What it knows: the tool that searches its documents (LOOP R-29). Run
    # from a file, nothing was read for it on Datalayer, and the tool says so.
    if knows_documents(app):
        capabilities.append(
            AppDocumentsCapability(
                app=app,
                app_uid=recorder.app_uid,
                deployment_uid=recorder.deployment_uid,
            )
        )
    return capabilities


def _agent_spec(reference: str) -> Optional[Agentspec]:
    """An agent of the catalogue, or a Cog's: an agent equipped with Frames."""
    from agent_runtimes.specs.agents import get_agent_spec
    from agent_runtimes.specs.cogs import get_cog

    spec = get_agent_spec(reference)
    if spec is not None:
        return spec
    cog = get_cog(reference)
    return cog.spec if cog is not None else None


def local_agent(
    app: AppSpec, organization: Optional[OrganizationFrames] = None
) -> Agent:
    """The agent of an application, built in this process from its spec.

    Its model is the application's, else its agent's; its instructions are its
    agent's prompt, the contexts it works under as its organization reads them
    (LOOP U-31), then the application's own, as on a runtime. What
    only a runtime brings — connections to MCP servers, skills, tools, a team —
    is refused rather than left out: an application that would run without
    what it names is not that application.

    Parameters
    ----------
    app : AppSpec
        The application.
    organization : OrganizationFrames, optional
        The contexts of the organization it belongs to
        (`read_organization_frames`); the catalogue's when unsaid.

    Returns
    -------
    Agent
        A pydantic-ai agent with no capabilities: they are attached per run.

    Raises
    ------
    AppNotRunnable
        When the application needs a runtime, names no model, or names a
        context its organization does not have.
    """
    from agent_runtimes.models.models import resolve_model_for_inference_provider

    spec = _agent_spec(app.agent) if app.agent else None
    problems: List[str] = []
    if app.team:
        problems.append(
            f"{app.id} runs the team {app.team}, which only a runtime runs."
        )
    if app.agent and spec is None:
        problems.append(
            f"{app.id} runs the agent {app.agent}, which is not known here."
        )
    needs = [
        (app.connections, "connections"),
        (app.skills, "skills"),
        (app.backend_tools, "backend tools"),
        (spec.skills if spec else [], "its agent's skills"),
        (spec.backend_tools if spec else [], "its agent's backend tools"),
    ]
    for items, what in needs:
        if items:
            problems.append(
                f"{app.id} has {what}, which this process does not bring: "
                "run it on a runtime, or give the host an agent of your own."
            )
    model = app.model or (spec.model if spec is not None else "") or ""
    if not model:
        problems.append(f"{app.id} names no model, nor does its agent.")
    if problems:
        raise AppNotRunnable(problems)
    # As the runtime's create route builds it: the agent's own prompt (a
    # Cog's, its Frames included), its contexts, then the application's.
    frames = frames_instructions(app.context, organization or NO_ORGANIZATION)
    parts = [spec.system_prompt if spec else "", frames, app.instructions or ""]
    instructions = "\n\n".join(part for part in parts if part) or None
    provider = spec.inference_provider if spec is not None else None
    return Agent(
        resolve_model_for_inference_provider(model, provider),
        instructions=instructions,
    )


@dataclass(frozen=True)
class Answer:
    """What the agent answered in one turn."""

    text: str
    """The answer as text."""

    output: Any
    """The answer as the agent typed it; the text for a text agent."""


def _context(context: dict[str, Any]) -> Optional[str]:
    if not context:
        return None
    return "\n".join(f"{key}: {value}" for key, value in context.items())


@dataclass
class AppAgent:
    """An application's agent in one session: its rules, checks and record attached.

    Every run is a turn of the session's conversation: the session's id is the
    run's conversation, so the record of a turn is the session's, and the
    history of earlier turns is given back to the model.
    """

    app: AppSpec
    """The application."""

    agent: Agent
    """The pydantic-ai agent the application runs."""

    session_id: str
    """The session this agent answers in."""

    capabilities: List[Any] = field(default_factory=list)
    """What every run is given: `app_capabilities`."""

    history: List[ModelMessage] = field(default_factory=list)
    """The conversation so far, as the model saw it."""

    toolsets: List[Any] = field(default_factory=list)
    """What every run reaches besides the agent's own tools: on a runtime,
    the MCP servers and sandbox its agent was made with (LOOP R-04)."""

    async def run(self, prompt: str, **context: Any) -> Answer:
        """Ask the agent, and wait for its whole answer.

        Parameters
        ----------
        prompt : str
            What the agent is asked.
        **context : Any
            What the agent is told for this turn, by name (``goal="…"``).

        Returns
        -------
        Answer
            Its answer.
        """
        result = await self.agent.run(
            prompt,
            conversation_id=self.session_id,
            message_history=self.history or None,
            instructions=_context(context),
            capabilities=self.capabilities,
            toolsets=self.toolsets or None,
        )
        self.history = result.all_messages()
        return Answer(text=str(result.output), output=result.output)

    async def stream(self, prompt: str, **context: Any) -> AsyncIterator[str]:
        """Ask the agent, and yield its answer as it comes, piece by piece.

        Parameters
        ----------
        prompt : str
            What the agent is asked.
        **context : Any
            What the agent is told for this turn, by name.

        Yields
        ------
        str
            The pieces of the answer's text, in order.
        """
        async with self.agent.run_stream_events(
            prompt,
            conversation_id=self.session_id,
            message_history=self.history or None,
            instructions=_context(context),
            capabilities=self.capabilities,
            toolsets=self.toolsets or None,
        ) as events:
            async for event in events:
                if isinstance(event, PartStartEvent) and isinstance(
                    event.part, TextPart
                ):
                    if event.part.content:
                        yield event.part.content
                elif isinstance(event, PartDeltaEvent) and isinstance(
                    event.delta, TextPartDelta
                ):
                    if event.delta.content_delta:
                        yield event.delta.content_delta
                elif isinstance(event, AgentRunResultEvent):
                    self.history = event.result.all_messages()


__all__ = [
    "AgentFactory",
    "Answer",
    "AppAgent",
    "app_capabilities",
    "local_agent",
]
