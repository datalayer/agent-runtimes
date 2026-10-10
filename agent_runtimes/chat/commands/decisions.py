# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /decisions - Ask Jev typed questions about a text.

The questions go to the session's runtime (``POST
/api/v1/configure/inference/decisions``), which asks them as the agent's
``decide`` tool does: at ai-inference's ``/decisions``, with the token the
runtime calls its models with. Locally and on Datalayer alike, nothing is
asked from this process.
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
DESCRIPTION = "Ask Jev typed questions about a text: yes or no, a choice, a score"
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
    """Ask Jev the questions typed, through the session's runtime, and say the answers."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

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
    tux.console.print(f"● Decided by {body['model']}", style=STYLE_PRIMARY)
    for line in answer_lines(body["answers"]):
        tux.console.print(f"  {line}", style=STYLE_ACCENT)
    tux.console.print()
    return None
