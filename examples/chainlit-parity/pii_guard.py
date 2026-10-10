# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Security, personal data — the example of Chainlit's documentation
(``examples/security``), rebuilt with LOOP's API (LOOP P-27).

Chainlit looks for personal data in what the person wrote before anything
is done with it (Microsoft Presidio's analyzer); when it finds some, it asks
the person whether to continue (``AskActionMessage``, *Continue* or
*Cancel*), stops on *Cancel*, and on *Continue* gives the model the text with
each piece of personal data replaced by its kind (Presidio's anonymizer:
``<PERSON>``, ``<CREDIT_CARD>``…).

Here: the same, in the message's code — ``session.ask(ChoiceQuestion(...))``
for the two buttons, and the application's agent given the anonymized text.
The detector is a few patterns — an e-mail, a phone number, a credit card —
standing in for Presidio, which is the developer's library in Chainlit's
example as here: names and places, which Presidio finds with a language
model of its own, the patterns do not; what the agent says is checked by the platform on top
(the Sensitive Data Guard, and credentials never shown to the model).
"""

import re
from typing import List, Tuple

from agent_runtimes.loop.apps import Application, ChoiceQuestion, Session

AGENT = "example-blank:0.0.1"

app = Application(
    id="pii-guard",
    name="Personal Data Guard",
    agent=AGENT,
    description="Asks before it passes on personal data, and passes it on anonymized.",
    instructions=(
        "You are a helpful assistant. Placeholders such as <EMAIL_ADDRESS> stand "
        "for data you are not shown: keep them as they are."
    ),
)

#: What it looks for, by kind, as Presidio names them.
PATTERNS = {
    "EMAIL_ADDRESS": r"[\w.+-]+@[\w-]+\.[\w.]+",
    "CREDIT_CARD": r"\b(?:\d{4}[- ]?){3}\d{1,4}\b",
    "PHONE_NUMBER": r"\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b",
}

CONTINUE, CANCEL = "✅ Continue", "❌ Cancel"


def analyze(text: str) -> List[Tuple[str, int, int]]:
    """Each piece of personal data found: its kind, where it starts and ends."""
    found: List[Tuple[str, int, int]] = []
    for kind, pattern in PATTERNS.items():
        for match in re.finditer(pattern, text):
            if not any(
                start < match.end() and match.start() < end for _, start, end in found
            ):
                found.append((kind, match.start(), match.end()))
    return sorted(found, key=lambda item: item[1])


def anonymize(text: str, found: List[Tuple[str, int, int]]) -> str:
    """The text, each piece of personal data replaced by its kind."""
    for kind, start, end in reversed(found):
        text = text[:start] + f"<{kind}>" + text[end:]
    return text


@app.message
async def main(session: Session, text: str) -> None:
    found = analyze(text)
    if found:
        answer = await session.ask(ChoiceQuestion("PII detected", (CONTINUE, CANCEL)))
        if answer == CANCEL:
            await session.send("Cancelled: nothing was sent.")
            return
        text = anonymize(text, found)
    reply = await session.agent.run(text)
    await session.send(reply.text)
