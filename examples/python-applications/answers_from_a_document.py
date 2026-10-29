# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that answers questions from a document it is given.

The document is ``handbook.txt``, beside this file. Each question finds the
paragraph with the most words in common — shown as a ``retrieval`` step —
and the agent is asked the question with that passage as its context, inside
a ``model`` step; the answer is sent with the passage under it. A question
no paragraph matches is answered by the code alone, without the agent.

Runs in this process with no key and no network: the person is played by a
``MemoryChannel``, the agent by pydantic-ai's ``TestModel``, and the record
is kept in a list here rather than sent anywhere.

    python answers_from_a_document.py
"""

import asyncio
import re
from pathlib import Path

from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.apps import (
    AppHost,
    Application,
    MemoryChannel,
    Session,
    Step,
    cache,
    run_sync,
)

HANDBOOK = Path(__file__).with_name("handbook.txt")

app = Application(
    id="handbook-desk",
    kind="chat",
    agent="example-blank:0.0.1",
    name="Handbook desk",
    instructions="Answer from the passage you are given, in one or two sentences.",
)
app.starter("Days off", "How many days off do I get?")
app.starter("Expenses", "Do I need to ask before I take a taxi?")


@cache
def paragraphs() -> list[str]:
    """The document's paragraphs, read once for every session of the process."""
    text = HANDBOOK.read_text(encoding="utf-8")
    return [p.strip() for p in text.split("\n\n") if p.strip()]


def words_of(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 3}


def best_passage(question: str) -> tuple[str, int]:
    """The paragraph sharing the most words with the question, and how many."""
    asked = words_of(question)
    scored = [(len(asked & words_of(p)), p) for p in paragraphs()]
    common, passage = max(scored, key=lambda s: s[0])
    return passage, common


@app.start
async def opening(session: Session) -> None:
    count = len(await run_sync(paragraphs))
    await session.send(f"I answer from {HANDBOOK.name}: {count} paragraphs. Ask away.")


@app.message
async def answer(session: Session, text: str) -> None:
    async with session.step(
        "Finding the passage", kind="retrieval", input=text
    ) as found:
        passage, common = await run_sync(best_passage, text)
        found.output = passage if common else None
    if not common:
        await session.send("The handbook says nothing about that.")
        return
    async with session.step("Answering", kind="model", input=text) as thought:
        reply = await session.agent.run(text, passage=passage)
        thought.output = reply.text
    await session.send(f"{reply.text}\n> {passage}")


async def main() -> None:
    channel = MemoryChannel()
    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(
            TestModel(custom_output_text="Here is what the handbook says.")
        ),
    )
    session = await host.open(opened_by="ada")
    print(channel.messages[-1].text)

    for question in ("How many days off do I get?", "Who feeds the office cat?"):
        await host.message(session, question)
        print(f"\n{question}")
        print(f"{channel.messages[-1].author}: {channel.messages[-1].text}")
    steps = [e for e in channel.events if isinstance(e, Step) and e.ended_at]
    print("\nsteps:", ", ".join(f"{s.name} ({s.kind})" for s in steps))


asyncio.run(main())
