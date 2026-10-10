# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Document QA — Chainlit's cookbook ``pdf-qa``, rebuilt with LOOP's API (LOOP P-27).

Chainlit asks for a PDF or a text file when the chat starts (``AskFileMessage``),
says it is processing it and updates that message when it is done, splits it
into passages (1,000 characters, 100 over), and answers each question from
the passages a retriever finds, naming them as ``source_<n>`` and showing them.

Here: ``session.ask(FileQuestion(...))``, ``session.send`` then
``message.update``, ``run_sync`` for the blocking split (Chainlit's
``make_async``), a ``retrieval`` step, the application's agent, and the
passages shown as the catalog's Evidence. The retriever is words in common,
not Pinecone's embeddings — a store of vectors is the developer's, as it is in
Chainlit's example; on Datalayer, *What it knows* reads documents into a
search of its own (U-24).
"""

import io
import re
from typing import List

from agent_runtimes.loop.apps import (
    Application,
    FileQuestion,
    Session,
    UploadedFile,
    run_sync,
)

AGENT = "example-a2a-writer:0.0.1"

app = Application(
    id="document-qa",
    name="Document QA",
    agent=AGENT,
    description="Answers questions about a PDF or a text file, citing its passages.",
    instructions=(
        "Answer only from the passages you are given, and name the ones you used as "
        "source_<n>. When they do not hold the answer, say so; never guess."
    ),
)

WELCOME = """Welcome to the Document QA demo! To get started:
1. Upload a PDF or text file
2. Ask a question about the file
"""

CHUNK, OVERLAP = 1000, 100


def text_of(file: UploadedFile) -> str:
    """The file's text: a PDF read page by page, a text file as it is."""
    if file.media_type == "application/pdf":
        from pypdf import PdfReader

        return "\n".join(
            page.extract_text() or ""
            for page in PdfReader(io.BytesIO(file.content)).pages
        )
    return file.content.decode("utf-8")


def split(file: UploadedFile) -> List[str]:
    """Split the file into passages of 1,000 characters, each 100 over the one before."""
    text = text_of(file)
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
    file = await session.ask(
        FileQuestion(
            WELCOME,
            accept=("text/plain", "application/pdf"),
            max_bytes=20 * 1024 * 1024,
        ),
        timeout=180,
    )
    message = await session.send(f"Processing `{file.name}`...")
    session.state["passages"] = await run_sync(split, file)
    await message.update(f"`{file.name}` processed. You can now ask questions!")


@app.message
async def main(session: Session, text: str) -> None:
    passages: List[str] = session.state["passages"]
    async with session.step("Retrieving", kind="retrieval", input=text) as step:
        found = retrieve(passages, text)
        step.output = ", ".join(f"source_{index}" for index in found) or "nothing"
    context = "\n\n".join(f"source_{index}:\n{passages[index]}" for index in found)
    answer = await session.agent.run(
        f"Passages:\n\n{context or '(none)'}\n\nQuestion: {text}"
    )
    names = [f"source_{index}" for index in found]
    said = answer.text + (
        f"\nSources: {', '.join(names)}" if names else "\nNo sources found"
    )
    await session.send(
        said,
        show=[
            session.ui.evidence(
                "sources", title="Sources", sources={"path": "/sources"}
            )
        ]
        if names
        else [],
        data={
            "sources": [
                {"title": f"source_{index}", "passage": passages[index]}
                for index in found
            ]
        },
    )
