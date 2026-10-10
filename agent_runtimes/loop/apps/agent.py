# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's agent: the agent it names, with its rules, checks and record.

Whoever runs an application — a runtime's create route configured with its
spec, or an ``app.py`` driven in-process — builds its agent's capabilities
here and nowhere else (`app_capabilities`): its rules decide every tool call,
its checks look at what the rules let through, its record keeps what
happened, and its tools — documents, saving, learning — are the same on a
cloud runtime as in a terminal (LOOP R-25).

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
from pydantic_ai.settings import ModelSettings
from reactor import PluginPlatform

from agent_runtimes.loop.apps.composer import ModeEffect
from agent_runtimes.loop.apps.documents import AppDocumentsCapability, knows_documents
from agent_runtimes.loop.apps.enforcement import AppRulesCapability
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


def unattended_when_woken(rules: AppRulesCapability, recorder: AppRecorder) -> None:
    """A session nobody opened — woken by a schedule — has nobody present: it
    only reads, unless a rule says otherwise (LOOP R-16).

    Said on the rules of every agent of an application: the one made in
    process (`app_capabilities`) and the one a runtime makes for it.
    """
    from agent_runtimes.loop.apps.record import current_session

    rules.unattended = lambda: bool(recorder.woken(current_session()))


def signed_as_recorded(rules: AppRulesCapability, recorder: AppRecorder) -> None:
    """What it sends through a connection is signed with its byline (LOOP
    I-10): the application, and the person it acts for in the current
    session, by name — or *on its own* in a session nobody opened.
    """
    from agent_runtimes.loop.apps.record import current_session
    from agent_runtimes.loop.apps.saving import signature

    def sentence() -> str:
        session = current_session()
        on_its_own = bool(recorder.woken(session))
        return signature(
            rules.app,
            on_its_own=on_its_own,
            for_name="" if on_its_own else recorder.acts_for(session),
        )

    rules.signature = sentence


def app_capabilities(
    app: AppSpec,
    *,
    recorder: AppRecorder,
    agent_id: Optional[str] = None,
    ask_rule: Optional[RuleAsk] = None,
    ask_check: Optional[CheckAsk] = None,
    platform: Optional[PluginPlatform] = None,
    given: Optional[List[Any]] = None,
    organization: Optional[OrganizationFrames] = None,
) -> List[Any]:
    """The capabilities an application's agent runs with, in their order.

    The one builder for every agent of an application: the one made in
    process (the terminal, a framework's), and the one a runtime's create
    route makes for a Preview or a deployment — so a cloud runtime's agent
    has exactly what the terminal's has, saving included (LOOP R-24, R-25).

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
    platform : PluginPlatform, optional
        The Reactor platform the rules are found on; the runtime's when unsaid.
    given : list, optional
        What the runtime already made the agent with, from its agent's spec
        (its guardrails, its context usage): placed after the record, before
        the application's own tools.
    organization : OrganizationFrames, optional
        The contexts of the organization it belongs to, which the Required
        Frame Guard reads at a session's start (R-06); none known when unsaid.

    Returns
    -------
    list
        Its rules first, then its checks — a call the rules refuse is not
        checked, and a Guard reads what the rules decided — then its record,
        what was ``given``, the tool that searches its documents when it
        names some, the tool that saves a result when a Space is granted to
        write, and what it learns when it is saved on Datalayer (R-26).
    """
    from agent_runtimes.loop.apps.notifications import AppNotifier

    rules = rules_for(app, agent_id=agent_id, platform=platform)
    rules.record = recorder.decided
    # What the person answered when asked is an entry of its own (LOOP R-07).
    rules.answered = recorder.answered
    rules.app_uid = recorder.app_uid
    unattended_when_woken(rules, recorder)
    signed_as_recorded(rules, recorder)
    if ask_rule is not None:
        rules.ask = ask_rule
    # Who is asked before it acts is told through the channels it names,
    # as its principal on a deployment (LOOP R-37).
    notifier = AppNotifier(
        app=app,
        recorder=recorder,
        app_uid=recorder.app_uid,
        deployment_uid=recorder.deployment_uid,
    )
    rules.notify = notifier.approval_asked
    # *Do it if I asked* decided from what the person approved in advance,
    # read from IAM as it acts (LOOP U-25); an application the platform does
    # not know has none.
    if recorder.app_uid:
        from agent_runtimes.loop.apps.grants import StandingApprovals

        rules.granted = StandingApprovals(
            app_uid=recorder.app_uid,
            deployment_uid=recorder.deployment_uid,
            unread=recorder.approvals_unread,
        ).granted
    checks = AppChecksCapability(
        checks=AppChecks.of(app),
        agent_id=agent_id,
        app_uid=recorder.app_uid,
        ask=ask_check,
        decide=rules.decide,
        record=recorder.checked,
        notify=notifier.approval_asked,
        answered=recorder.answered,
        # What the Required Frame Guard reads at a session's start (R-06).
        organization=organization,
    )
    capabilities: List[Any] = [
        rules,
        checks,
        AppRecordCapability(recorder=recorder),
        *(given or []),
    ]
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
    # Approve and save (LOOP R-24): the tool that saves a result as a page of
    # a Space it is granted to write, once a person approved it.
    from agent_runtimes.loop.apps.saving import AppSavingCapability, saves

    if saves(app):
        capabilities.append(
            AppSavingCapability(
                app=app,
                app_uid=recorder.app_uid,
                deployment_uid=recorder.deployment_uid,
                # Who it acts for: who opened the session, or nobody (I-10).
                person=recorder.opener,
                woken=recorder.woken,
                # The user the host's server signed, embedded (D-21).
                user=recorder.signed_user,
                # Who its byline names: that user, or who opened it, by name (I-10).
                named=recorder.acts_for,
            )
        )
    # What it learns (LOOP R-26): skills proposed for its owner to review,
    # and those approved, used — an application saved on Datalayer only.
    if recorder.app_uid:
        from agent_runtimes.loop.apps.learning import AppLearningCapability

        capabilities.append(
            AppLearningCapability(
                app=app,
                app_uid=recorder.app_uid,
                deployment_uid=recorder.deployment_uid,
            )
        )
    # Credentials are never shown to the model (LOOP R-19), last of all.
    from agent_runtimes.guardrails.credentials import credentials_withheld

    return credentials_withheld(capabilities)


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
    return _agent_from_spec(app, organization, as_browser=False)


def browser_agent(
    app: AppSpec, organization: Optional[OrganizationFrames] = None
) -> Agent:
    """The agent of an application as a visitor's browser plays it (LOOP A-13, A-14).

    A scene's member *in the browser* — Sales, the entry of Sales & Accounting —
    is played by the page with its model (the application's, else its
    agent's), its agent's prompt, its contexts and its own instructions, and
    the tools the page gives it: one to ask each member it talks to over A2A
    (`useA2ATeam`). What only a runtime brings — connections, skills, backend
    tools — the browser has not, and so leaves out, where `local_agent`
    refuses: the rehearsal plays a browser member as the browser does.

    Raises
    ------
    AppNotRunnable
        When the application runs a team, names an agent that is not known
        here, names no model, or names a context its organization does not have.
    """
    return _agent_from_spec(app, organization, as_browser=True)


def _agent_from_spec(
    app: AppSpec, organization: Optional[OrganizationFrames], *, as_browser: bool
) -> Agent:
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
        if items and not as_browser:
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


def _context(context: dict[str, Any], mode: str = "") -> Optional[str]:
    said = "\n".join(f"{key}: {value}" for key, value in context.items())
    return "\n\n".join(part for part in (mode, said) if part) or None


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

    mode: ModeEffect = field(default_factory=ModeEffect)
    """What the modes the person chose tell every run, and the model it runs
    on (LOOP P-19); set by the session."""

    inference_provider: Optional[str] = None
    """Where a model the person's modes choose is called (P-19): on a
    runtime, through the provider its agent was made with — ``datalayer``,
    ai-inference — never around it."""

    app_instance: Optional[dict[str, Any]] = None
    """The application instance it serves on a runtime: a model its modes
    choose names its application and deployment on every call, as the
    agent's own model does, so it is metered on them (STUDIO R-09)."""

    def _run_kwargs(
        self, context: dict[str, Any], model_settings: Optional[ModelSettings] = None
    ) -> dict[str, Any]:
        """What a run is given: its turn's context and modes, the session's
        history, and the model's settings for this call (LOOP P-27).
        """
        from agent_runtimes.models.models import resolve_model_for_inference_provider

        return {
            **({"model_settings": model_settings} if model_settings else {}),
            "conversation_id": self.session_id,
            "message_history": self.history or None,
            "instructions": _context(context, self.mode.instructions),
            "capabilities": self.capabilities,
            "toolsets": self.toolsets or None,
            **(
                {
                    "model": resolve_model_for_inference_provider(
                        self.mode.model,
                        self.inference_provider,
                        app_instance=self.app_instance,
                    )
                }
                if self.mode.model
                else {}
            ),
        }

    async def run(
        self,
        prompt: str,
        *,
        model_settings: Optional[ModelSettings] = None,
        **context: Any,
    ) -> Answer:
        """Ask the agent, and wait for its whole answer.

        Parameters
        ----------
        prompt : str
            What the agent is asked.
        model_settings : ModelSettings, optional
            How the model answers this call — ``{"temperature": 0,
            "max_tokens": 500, "stop_sequences": ["```"]}`` — over the
            agent's own (LOOP P-27).
        **context : Any
            What the agent is told for this turn, by name (``goal="…"``).

        Returns
        -------
        Answer
            Its answer.
        """
        result = await self.agent.run(
            prompt, **self._run_kwargs(context, model_settings)
        )
        self.history = result.all_messages()
        return Answer(text=str(result.output), output=result.output)

    async def stream(
        self,
        prompt: str,
        *,
        model_settings: Optional[ModelSettings] = None,
        **context: Any,
    ) -> AsyncIterator[str]:
        """Ask the agent, and yield its answer as it comes, piece by piece.

        Parameters
        ----------
        prompt : str
            What the agent is asked.
        model_settings : ModelSettings, optional
            How the model answers this call, over the agent's own (LOOP P-27).
        **context : Any
            What the agent is told for this turn, by name.

        Yields
        ------
        str
            The pieces of the answer's text, in order.
        """
        async with self.agent.run_stream_events(
            prompt, **self._run_kwargs(context, model_settings)
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
