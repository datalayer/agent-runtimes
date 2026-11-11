# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /decisions - Ask the agent's decision model typed questions about a text.

An agent decides only when its agentspec names a decisions spec
(``decisions: jev:0.0.1``). The command is offered — listed in ``/help`` and
in the ``/`` menu — only for such an agent (:func:`OFFERED`); typed for
another, the runtime's sentence says its spec names no decisions and how to
add them.

The questions go to the session's runtime (``POST
/api/v1/configure/inference/decisions``), which asks them as the agent's
``decide`` tool does: of the model its decisions spec names, at ai-inference's
``/decisions``, with the token the runtime calls its models with. Locally and
on Datalayer alike, nothing is asked from this process.
"""

from __future__ import annotations

import re
import shlex
from typing import TYPE_CHECKING, Any, Literal, Optional

import httpx

from agent_runtimes.tools.decisions import DecisionQuestion

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "decisions"
ALIASES: list[str] = ["decide"]
DESCRIPTION = "Ask typed questions about a text: yes or no, a choice, a score"
SHORTCUT = None
GROUP = "Agents"

USAGE = (
    '/decisions "<text>" --yes-no "<question>" '
    '[--choice "<question>" A,B,C] [--score "<question>" 1-5]'
)
EXAMPLE = (
    '/decisions "Payouts have failed for 3 days." --yes-no "Is it urgent?" '
    '--choice "Which team?" Billing,Tech,Sales'
)


#: The flags, and the type of question each asks.
KINDS: dict[str, Literal["noul", "choice", "score"]] = {
    "--yes-no": "noul",
    "--choice": "choice",
    "--score": "score",
}


class Unasked(ValueError):
    """The line does not say what to ask: the sentence says why."""


def _session_key(tux: "CliTux") -> tuple[str, str]:
    """The runtime and the agent a session's decisions were read for."""
    return (str(tux.server_url), str(getattr(tux, "agent_id", "") or ""))


async def refresh(tux: "CliTux") -> Optional[dict[str, Any]]:
    """
    Read whether the session's agent decides, and remember it for the session.

    The runtime says it (``GET /api/v1/agents/{agent_id}``, ``decisions``): the
    decisions spec its agentspec names and the model asked, or nothing. Read
    once per runtime and agent; a runtime that cannot be read, or one too old
    to say it, says nothing, and is read again the next time.

    Parameters
    ----------
    tux : CliTux
        The session.

    Returns
    -------
    Optional[dict[str, Any]]
        ``spec``, ``name``, ``model``, ``model_name``, ``questions`` and the
        limits; ``None`` when the agent does not decide.
    """
    key = _session_key(tux)
    known = getattr(tux, "decisions", None)
    if known is not None and known[0] == key:
        return known[1]
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{key[0]}/api/v1/agents/{key[1]}", timeout=5.0)
    except httpx.HTTPError:
        return None
    if response.status_code != 200 or "decisions" not in response.json():
        return None
    said = response.json()["decisions"]
    tux.decisions = (key, said if isinstance(said, dict) else None)
    return tux.decisions[1]


def _answered(tux: "CliTux") -> bool:
    """Whether the runtime said, for this session's agent, if it decides."""
    known = getattr(tux, "decisions", None)
    return known is not None and known[0] == _session_key(tux)


def not_offered(tux: "CliTux") -> str:
    """The sentence for ``/decisions`` typed for an agent that does not decide."""
    from agent_runtimes.tools.decisions import HOW_TO_DECIDE

    agent = getattr(tux, "agent_id", "") or "this agent"
    return (
        f"The agent {agent} does not decide: its spec names no decisions. "
        f"To give it the capability, {HOW_TO_DECIDE}."
    )


def OFFERED(tux: "CliTux") -> bool:
    """Whether ``/decisions`` is offered now: the session's agent decides."""
    return bool(_answered(tux) and tux.decisions[1])


def header_value(decisions: Optional[dict[str, Any]]) -> Optional[str]:
    """
    Say an agent's decisions on one line of the terminal's header.

    Parameters
    ----------
    decisions : Optional[dict[str, Any]]
        What the runtime says of the agent's decisions, if it decides.

    Returns
    -------
    Optional[str]
        ``jev:0.0.1 (cloudflare:wrk/typesafe/jev)``; ``None`` for an agent
        that does not decide.
    """
    if not decisions:
        return None
    return f"{decisions['spec']} ({decisions['model']})"


def _name(question: str) -> str:
    """Return the name an answer comes back under: the question, as a slug."""
    return re.sub(r"[^a-z0-9]+", "_", question.lower()).strip("_")[:40]


def _options(raw: str) -> list[str]:
    """Return a choice's or a score's options: ``A,B,C``, or a range ``1-5``."""
    bounds = re.fullmatch(r"\s*(-?\d+)\s*-\s*(-?\d+)\s*", raw)
    if bounds:
        low, high = int(bounds.group(1)), int(bounds.group(2))
        return [str(step) for step in range(low, high + 1)]
    return [option.strip() for option in raw.split(",") if option.strip()]


def parse(argv: str) -> tuple[str, list[DecisionQuestion]]:
    """
    Read the text and the questions from what was typed after ``/decisions``.

    Parameters
    ----------
    argv : str
        ``"<text>"`` then ``--yes-no "<question>"``, ``--choice "<question>"
        A,B,C`` and ``--score "<question>" 1-5``, as many as wanted.

    Returns
    -------
    tuple[str, list[DecisionQuestion]]
        The text and the questions, each named after itself.

    Raises
    ------
    Unasked
        When the line says no text, no question, or a flag lacks its parts.
    """
    try:
        words = shlex.split(argv)
    except ValueError as error:
        raise Unasked(f"The line could not be read ({error}).") from None
    state: Optional[str] = None
    questions: list[DecisionQuestion] = []
    index = 0
    while index < len(words):
        word = words[index]
        kind = KINDS.get(word)
        if kind is None:
            if word.startswith("--"):
                raise Unasked(f"{word} is not a question: --yes-no, --choice, --score.")
            if state is not None:
                raise Unasked("Quote the text: it is one argument.")
            state = word
            index += 1
            continue
        wanted = 1 if kind == "noul" else 2
        parts = words[index + 1 : index + 1 + wanted]
        if len(parts) < wanted or any(part.startswith("--") for part in parts):
            raise Unasked(
                f"{word} needs a question{'' if kind == 'noul' else ' and its options'}."
            )
        questions.append(
            DecisionQuestion(
                name=_name(parts[0]),
                type=kind,
                instructions=parts[0],
                options=_options(parts[1]) if kind != "noul" else [],
            )
        )
        index += 1 + wanted
    if not state:
        raise Unasked("Say the text the questions are about.")
    if not questions:
        raise Unasked("Ask at least one question: --yes-no, --choice or --score.")
    return state, questions


def answer_lines(answers: dict[str, Any]) -> list[str]:
    """
    Say each typed answer in a line.

    Parameters
    ----------
    answers : dict[str, Any]
        The answers ai-inference gave, by question name.

    Returns
    -------
    list[str]
        ``name: yes (0.87)`` for a yes or no, with the probability that it
        holds; ``name: Billing (0.91)`` for a choice, with its confidence;
        ``name: 3 (0.50)`` for a score, its most likely step with its
        probability, and the score.
    """
    lines: list[str] = []
    for name, answer in answers.items():
        kind = answer["type"]
        if kind == "noul":
            probability = float(answer["probability"])
            verdict = "yes" if probability >= 0.5 else "no"
            lines.append(f"{name}: {verdict} ({probability:.2f} that it holds)")
        elif kind == "choice":
            lines.append(
                f"{name}: {answer['choice']} "
                f"(confidence {float(answer['confidence']):.2f})"
            )
        else:
            probabilities = answer["probabilities"]
            step = max(probabilities, key=lambda key: probabilities[key])
            legend = answer["legend"]
            lines.append(
                f"{name}: {legend[step]} ({float(probabilities[step]):.2f}), "
                f"score {float(answer['score']):.1f} of {len(legend) - 1}, "
                f"confidence {float(answer['confidence']):.2f}"
            )
    return lines


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Ask the agent's decision model the questions typed, through the session's runtime, and say the answers."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    decides = await refresh(tux)
    if _answered(tux) and not decides:
        tux.console.print(f"[red]{not_offered(tux)}[/red]")
        return None
    if not argv.strip():
        tux.console.print()
        tux.console.print(f"  {USAGE}", style=STYLE_ACCENT)
        tux.console.print(f"  For example: {EXAMPLE}", style=STYLE_MUTED)
        tux.console.print()
        return None
    try:
        state, questions = parse(argv)
    except Unasked as unasked:
        tux.console.print(f"[red]Nothing was asked: {unasked}[/red]")
        tux.console.print(f"  {USAGE}", style=STYLE_MUTED)
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/configure/inference/decisions",
                json={
                    "state": state,
                    "questions": [question.model_dump() for question in questions],
                    "agent_id": getattr(tux, "agent_id", None) or None,
                },
                timeout=90.0,
            )
    except httpx.HTTPError as error:
        tux.console.print(f"[red]Unable to ask: {error}[/red]")
        return None
    if response.status_code == 404:
        from ..older_runtime import older_runtime

        said = await older_runtime(tux, "decisions (/decisions)")
        tux.console.print(f"[red]{said}[/red]")
        return None
    response.raise_for_status()
    body = response.json()

    tux.console.print()
    if "refusal" in body:
        tux.console.print(f"[red]{body['refusal']}[/red]")
        tux.console.print()
        return None
    by = f"{decides['name']} ({body['model']})" if decides else body["model"]
    tux.console.print(f"● Decided by {by}", style=STYLE_PRIMARY)
    for line in answer_lines(body["answers"]):
        tux.console.print(f"  {line}", style=STYLE_ACCENT)
    tux.console.print()
    return None
