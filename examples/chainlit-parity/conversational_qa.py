# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Conversational document QA — the example of Chainlit's documentation
(``examples/qa``), rebuilt with LOOP's API (LOOP P-27).

Chainlit asks for a text file until one comes (``AskFileMessage`` in a loop,
three minutes each time), says it is processing it and updates that message,
splits it into passages (1,000 characters, 100 over), and answers each
question with LangChain's conversational retrieval chain — the conversation
so far kept in its memory, so a follow-up question is understood — naming its
sources and showing each beside the conversation (``cl.Text``,
``display="side"``).

Here: ``session.ask(FileQuestion(...), timeout=180)`` asked again on
``AskTimeout``; ``session.send`` then ``message.update``; ``run_sync`` for
the split; a ``retrieval`` step; the application's agent, which keeps the
conversation from turn to turn itself, so a follow-up is understood with no
memory to wire; the passages shown in the side panel (``session.show(...,
where="panel")``), changed in place at each answer. The retriever is words in
common — the previous question's among them, standing in for the chain's
condensed question — not Chroma's embeddings: a store of vectors is the
developer's, in Chainlit's example as here.
"""

import re
from typing import List

from agent_runtimes.loop.apps import (
    Application,
    AskTimeout,
    FileQuestion,
    Session,
    UploadedFile,
    run_sync,
)

AGENT = "example-blank:0.0.1"

app = Application(
    id="conversational-qa",
    name="Conversational QA",
    agent=AGENT,
    description="Answers questions about a text file, follow-ups included, citing its passages.",
    instructions=(
        "Answer only from the passages you are given and from the conversation so "
        "far. When they do not hold the answer, say so; never guess."
    ),
)

CHUNK, OVERLAP = 1000, 100


def split(file: UploadedFile) -> List[str]:
    """Split the file into passages of 1,000 characters, each 100 over the one before."""
    text = file.content.decode("utf-8")
    return [
        text[start : start + CHUNK]
        for start in range(0, max(len(text), 1), CHUNK - OVERLAP)
    ]


def words(text: str) -> set:
    """Say its words of three letters or more, lowercase, a plural's ``s`` dropped."""
    return {word.rstrip("s") for word in re.findall(r"\w{3,}", text.lower())}


def retrieve(passages: List[str], question: str, k: int = 4) -> List[int]:
    """The passages with the most words in common with the question, best first."""
    asked = words(question)
    scored = [
        (len(asked & words(passage)), index) for index, passage in enumerate(passages)
    ]
    return [
        index
        for score, index in sorted(scored, key=lambda pair: (-pair[0], pair[1]))[:k]
        if score
    ]


@app.start
async def start(session: Session) -> None:
    file = None
    # Wait for the person to send a file.
    while file is None:
        try:
            file = await session.ask(
                FileQuestion(
                    "Please upload a text file to begin!",
                    accept=("text/plain",),
                    max_bytes=20 * 1024 * 1024,
                ),
                timeout=180,
            )
        except AskTimeout:
            file = None
    message = await session.send(f"Processing `{file.name}`...")
    session.state["passages"] = await run_sync(split, file)
    session.state["asked"] = ""
    await message.update(f"Processing `{file.name}` done. You can now ask questions!")


@app.message
async def main(session: Session, text: str) -> None:
    passages: List[str] = session.state["passages"]
    async with session.step("Retrieving", kind="retrieval", input=text) as step:
        # The question, and the one before it: a follow-up is read with it.
        found = retrieve(passages, f"{session.state['asked']} {text}")
        step.output = ", ".join(f"source_{index}" for index in found) or "nothing"
    session.state["asked"] = text
    context = "\n\n".join(f"source_{index}:\n{passages[index]}" for index in found)
    answer = await session.agent.run(
        f"Passages:\n\n{context or '(none)'}\n\nQuestion: {text}"
    )
    names = [f"source_{index}" for index in found]
    said = answer.text + (
        f"\nSources: {', '.join(names)}" if names else "\nNo sources found"
    )
    await session.send(said)
    if names:
        await session.show(
            [
                session.ui.text(f"source_{index}", text=passages[index])
                for index in found
            ],
            where="panel",
            title="Sources",
            id="sources",
        )
