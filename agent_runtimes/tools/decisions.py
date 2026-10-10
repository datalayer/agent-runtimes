# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``decide`` tool: typed questions asked of Jev through ai-inference.

An agent that lists ``decide:0.0.1`` (agentspecs ``tools/decide.yaml``) may
ask typed questions about a text — the *state* — and get typed answers back:

- ``noul``: does a statement hold? Answered with its probability.
- ``choice``: which of at least two named options? A probability per option
  and a confidence.
- ``score``: which step of a rubric of at least two, lowest first? A
  probability per step and a confidence.

They are asked of Jev on Workers AI (``cloudflare:wrk/typesafe/jev``) at
datalayer-ai-inference's ``POST /decisions``, with the token this runtime
calls its models with (:func:`agent_runtimes.models.offered.inference_token`).
With no token, or none configured ai-inference, it asks nothing and says why
in a sentence. Its action class is ``read``: it reaches nothing but
ai-inference.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

#: The model the decisions are asked of: Jev at Workers AI's own endpoint.
DECISION_MODEL = "cloudflare:wrk/typesafe/jev"

#: How long one decision may take.
DECISION_TIMEOUT = 60.0


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


def _refusal_of(questions: list[DecisionQuestion]) -> str | None:
    """Why the questions cannot be asked as they are, in a sentence, or ``None``."""
    if not questions:
        return "Nothing was decided: ask at least one question."
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


async def decide(state: str, questions: list[DecisionQuestion]) -> dict[str, Any] | str:
    """
    Ask Jev typed questions about a text, and get the typed answers back.

    Use it to decide whether something holds (noul), which of named options
    fits (choice) or where something sits on a scale (score). Put the text the
    questions are about in ``state``, and quote it as it was given.

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
    from agent_runtimes.models.offered import inference_token, inference_token_refusal

    refused = _refusal_of(questions)
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
        "model": DECISION_MODEL,
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
        "model": data.get("model", DECISION_MODEL),
        "answers": data.get("answers", {}),
    }


__all__ = ["DECISION_MODEL", "DecisionQuestion", "decide"]
