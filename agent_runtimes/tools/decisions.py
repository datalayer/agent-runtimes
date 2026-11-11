# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``decide`` tool: typed questions asked of an agent's decision model.

An agent decides only when its spec names a decisions spec (agentspecs
``decisions/``, for example ``decisions: jev:0.0.1``). The capability brings
this tool: the agent may ask typed questions about a text — the *state* — and
get typed answers back:

- ``noul``: does a statement hold? Answered with its probability.
- ``choice``: which of at least two named options? A probability per option
  and a confidence.
- ``score``: which step of a rubric of at least two, lowest first? A
  probability per step and a confidence.

They are asked of the model the agent's decisions spec names (Jev on Workers
AI, ``cloudflare:wrk/typesafe/jev``, for ``jev``), within the spec's limits,
at datalayer-ai-inference's ``POST /decisions``, with the token this runtime
calls its models with (:func:`agent_runtimes.models.offered.inference_token`).
With no token, or none configured ai-inference, it asks nothing and says why
in a sentence. An agent whose spec names no decisions is refused in a
sentence, here and at the runtime's route. Its action class is ``read``: it
reaches nothing but ai-inference.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable, Literal

import httpx
from pydantic import BaseModel, Field

from agent_runtimes.types import DECIDE_TOOL, DecisionsSpec

logger = logging.getLogger(__name__)

#: How long one decision may take.
DECISION_TIMEOUT = 60.0

#: How an agent's spec gets the capability, said wherever it is refused.
HOW_TO_DECIDE = "add `decisions: jev:0.0.1` to its agentspec"


class NoDecisions(ValueError):
    """An agent that does not decide, or names decisions that cannot be used: the sentence says why."""


def no_decisions(agent_id: str) -> str:
    """The sentence refusing a decision for an agent whose spec names none."""
    return (
        f"Nothing was decided: the agent {agent_id} does not decide, its spec "
        f"names no decisions. To give it the capability, {HOW_TO_DECIDE}."
    )


def decisions_spec(ref: str) -> DecisionsSpec:
    """
    Give the decisions spec a reference names.

    Parameters
    ----------
    ref : str
        ``id`` or ``id:version``, as an agent's spec names it.

    Returns
    -------
    DecisionsSpec
        The spec of the catalogue.

    Raises
    ------
    NoDecisions
        When the catalogue has no such spec, or it is not enabled.
    """
    from agent_runtimes.specs.decisions import get_decisions

    spec = get_decisions(ref)
    if spec is None:
        raise NoDecisions(
            f"Nothing was decided: the decisions catalogue has no {ref!r}."
        )
    if not spec.enabled:
        raise NoDecisions(
            f"Nothing was decided: the decisions {ref!r} are not enabled."
        )
    return spec


def agent_decisions(agent_id: str) -> DecisionsSpec | None:
    """
    Give the decisions spec of an agent of this runtime, or ``None``.

    Parameters
    ----------
    agent_id : str
        An agent running here.

    Returns
    -------
    DecisionsSpec | None
        The spec its agentspec names; ``None`` when it names none, or when no
        such agent runs here.
    """
    from agent_runtimes.routes.agents import get_stored_agent_spec

    stored = get_stored_agent_spec(agent_id) or {}
    ref = stored.get("decisions")
    return decisions_spec(str(ref)) if ref else None


def decisions_info(spec: DecisionsSpec | None) -> dict[str, Any] | None:
    """
    Say an agent's decisions as its clients read them, or ``None`` without any.

    Parameters
    ----------
    spec : DecisionsSpec | None
        The agent's decisions spec.

    Returns
    -------
    dict[str, Any] | None
        ``spec`` (``id:version``), ``name``, ``model`` and ``model_name``,
        ``questions`` and the limits ``max_questions``, ``max_text_length``.
    """
    if spec is None:
        return None
    from agent_runtimes.specs.models import get_model

    model = get_model(spec.model)
    return {
        "spec": spec.ref,
        "name": spec.name,
        "model": spec.model,
        "model_name": model.name if model is not None else spec.model,
        "questions": list(spec.questions),
        "max_questions": spec.max_questions,
        "max_text_length": spec.max_text_length,
    }


def tools_with_decisions(
    tool_ids: list[str], decisions: str | None, agent_id: str
) -> list[str]:
    """
    Give an agent's backend tools as its decisions make them.

    The capability brings the tool: an agent that names decisions has
    ``decide``, and one that names none may not list it.

    Parameters
    ----------
    tool_ids : list[str]
        The backend tools the agent lists.
    decisions : str | None
        The decisions spec it names, if any.
    agent_id : str
        The agent, for the sentence.

    Returns
    -------
    list[str]
        The tools, with ``decide`` when it decides.

    Raises
    ------
    NoDecisions
        When it lists ``decide`` and names no decisions, or names decisions
        the catalogue cannot give.
    """
    listed = DECIDE_TOOL in [tool.rpartition(":")[0] or tool for tool in tool_ids]
    if not decisions:
        if listed:
            raise NoDecisions(
                f"The agent {agent_id} lists the backend tool `{DECIDE_TOOL}` but its "
                f"spec names no decisions: {HOW_TO_DECIDE}, which brings the tool."
            )
        return list(tool_ids)
    decisions_spec(decisions)
    return list(tool_ids) if listed else [*tool_ids, DECIDE_TOOL]


class DecisionQuestion(BaseModel):
    """One typed question about the state."""

    name: str = Field(
        ..., description="A short name for the question; its answer comes back under it"
    )
    type: Literal["noul", "choice", "score"] = Field(
        ...,
        description=(
            "noul: does a statement hold (yes or no, with its probability); "
            "choice: which of the options; score: which step of the options, "
            "lowest first"
        ),
    )
    instructions: str = Field(
        ..., description="The statement (noul) or the question (choice, score)"
    )
    options: list[str] = Field(
        default_factory=list,
        description=(
            "choice: at least two named options; score: at least two rubric "
            "steps, lowest first; noul: none"
        ),
    )


def _criteria(question: DecisionQuestion) -> Any:
    """The question's criteria as ai-inference takes them."""
    if question.type == "choice":
        return {option: option for option in question.options}
    if question.type == "score":
        return list(question.options)
    return None


def _refusal_of(
    spec: DecisionsSpec, state: str, questions: list[DecisionQuestion]
) -> str | None:
    """Why the questions cannot be asked as they are, in a sentence, or ``None``."""
    if not questions:
        return "Nothing was decided: ask at least one question."
    if len(questions) > spec.max_questions:
        return (
            f"Nothing was decided: {spec.name} takes at most {spec.max_questions} "
            f"questions in one call, not {len(questions)}."
        )
    if len(state) > spec.max_text_length:
        return (
            f"Nothing was decided: {spec.name} takes a text of at most "
            f"{spec.max_text_length} characters, not {len(state)}."
        )
    for question in questions:
        if question.type not in spec.questions:
            return (
                f"Nothing was decided: {spec.name} answers no {question.type} "
                f"question ('{question.name}'): {', '.join(spec.questions)}."
            )
    names = [question.name.strip() for question in questions]
    if any(not name for name in names):
        return "Nothing was decided: every question needs a name."
    if len(set(names)) != len(names):
        return "Nothing was decided: two questions have the same name."
    for question in questions:
        if question.type in ("choice", "score") and len(question.options) < 2:
            return (
                f"Nothing was decided: the {question.type} question "
                f"'{question.name}' needs at least two options."
            )
    return None


def _decisions_url() -> str | None:
    """The URL of ai-inference's ``/decisions``, or ``None`` when none is configured."""
    from agent_runtimes.models.models import _normalize_ai_inference_base_url

    raw = (os.getenv("DATALAYER_AI_INFERENCE_URL") or "").strip()
    if not raw:
        return None
    return f"{_normalize_ai_inference_base_url(raw)}/decisions"


def _detail_of(response: httpx.Response) -> str:
    """What ai-inference said when it refused, or nothing."""
    try:
        body = response.json()
    except ValueError:
        return ""
    detail = body.get("detail") if isinstance(body, dict) else None
    return str(detail) if detail else ""


async def ask_decisions(
    spec: DecisionsSpec, state: str, questions: list[DecisionQuestion]
) -> dict[str, Any] | str:
    """
    Ask a decisions spec's model typed questions about a text.

    Parameters
    ----------
    spec : DecisionsSpec
        The decisions spec of the agent asking: its model and its limits.
    state : str
        The text the questions are about: a ticket, a message, a review.
    questions : list[DecisionQuestion]
        One or more typed questions, each named.

    Returns
    -------
    dict[str, Any] | str
        ``model`` and ``answers`` by question name: a noul answer carries
        ``probability`` (that the statement holds); a choice answer
        ``choice``, ``confidence`` and ``probabilities``; a score answer
        ``score`` (the step, from 0), ``confidence``, ``probabilities`` and
        ``legend``. A sentence when nothing was decided, saying why.
    """
    from agent_runtimes.models.offered import inference_token, inference_token_refusal

    refused = _refusal_of(spec, state, questions)
    if refused:
        return refused
    url = _decisions_url()
    if url is None:
        return (
            "Nothing was decided: no ai-inference is configured "
            "(DATALAYER_AI_INFERENCE_URL is unset)."
        )
    token_refusal = inference_token_refusal()
    if token_refusal:
        return f"Nothing was decided. {token_refusal}"
    payload = {
        "model": spec.model,
        "state": state,
        "questions": {
            question.name.strip(): {
                "type": question.type,
                "instructions": question.instructions,
                **(
                    {"criteria": _criteria(question)}
                    if _criteria(question) is not None
                    else {}
                ),
            }
            for question in questions
        },
    }
    try:
        async with httpx.AsyncClient(timeout=DECISION_TIMEOUT) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {inference_token()}"},
            )
    except httpx.HTTPError as error:
        logger.warning("ai-inference could not be reached for a decision: %s", error)
        return f"Nothing was decided: ai-inference could not be reached ({type(error).__name__})."
    if response.status_code >= 400:
        detail = _detail_of(response)
        return (
            f"Nothing was decided: ai-inference refused it ({response.status_code})"
            + (f": {detail}" if detail else ".")
        )
    body = response.json()
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    return {
        "model": data.get("model", spec.model),
        "answers": data.get("answers", {}),
    }


#: The tool as an agent calls it: a text and typed questions in, answers out.
DecideTool = Callable[[str, list[DecisionQuestion]], Awaitable["dict[str, Any] | str"]]


def decide_tool(spec: DecisionsSpec) -> DecideTool:
    """
    Give the ``decide`` tool of an agent whose spec names ``spec``.

    Parameters
    ----------
    spec : DecisionsSpec
        The agent's decisions spec.

    Returns
    -------
    DecideTool
        The tool, asking that spec's model within its limits.
    """

    async def decide(
        state: str, questions: list[DecisionQuestion]
    ) -> dict[str, Any] | str:
        return await ask_decisions(spec, state, questions)

    decide.__doc__ = f"""
    Ask {spec.name} typed questions about a text, and get the typed answers back.

    Use it to decide whether something holds (noul), which of named options
    fits (choice) or where something sits on a scale (score). Put the text the
    questions are about in ``state``, and quote it as it was given. It answers
    {", ".join(spec.questions)} questions, at most {spec.max_questions} in one
    call, about a text of at most {spec.max_text_length} characters.

    Parameters
    ----------
    state : str
        The text the questions are about: a ticket, a message, a review.
    questions : list[DecisionQuestion]
        One or more typed questions, each named.

    Returns
    -------
    dict[str, Any] | str
        ``model`` and ``answers`` by question name: a noul answer carries
        ``probability`` (that the statement holds); a choice answer
        ``choice``, ``confidence`` and ``probabilities``; a score answer
        ``score`` (the step, from 0), ``confidence``, ``probabilities`` and
        ``legend``. A sentence when nothing was decided, saying why.
    """
    return decide


async def decide(state: str, questions: list[DecisionQuestion]) -> str:
    """
    Refuse a decision asked without a decisions spec.

    The catalogue binds the ``decide`` backend tool to this name; an agent's
    own tool is :func:`decide_tool`, made from the decisions spec its
    agentspec names. Called as it is, it decides nothing.

    Parameters
    ----------
    state : str
        The text the questions are about.
    questions : list[DecisionQuestion]
        The typed questions.

    Returns
    -------
    str
        The sentence saying that an agent decides only when its spec names
        decisions.
    """
    return (
        "Nothing was decided: an agent decides only when its spec names "
        f"decisions. To give it the capability, {HOW_TO_DECIDE}."
    )


__all__ = [
    "DECIDE_TOOL",
    "HOW_TO_DECIDE",
    "DecisionQuestion",
    "NoDecisions",
    "agent_decisions",
    "ask_decisions",
    "decide",
    "decide_tool",
    "decisions_info",
    "decisions_spec",
    "no_decisions",
    "tools_with_decisions",
]
