# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""File analysis — Chainlit's cookbook ``openai-data-analyst``, rebuilt with
LOOP's API (LOOP P-27).

Chainlit hands the files a user sends with a message to an OpenAI Assistant
with its code interpreter, streams its steps, and shows the images it draws
(the Tesla stock price CSV it ships, charted).

Here: files sent without being asked for are an ``@app.file`` (its kinds and
sizes limited in the Appspec, P-21); the CSV is read in code in a ``tool``
step, its figures computed there — never estimated — and charted with the
catalog's Chart, and the application's agent says what they show. On
Datalayer the agent itself runs code in its sandbox (``report-from-a-file``,
its catalogue's twin); in this process the code is the application's.
"""

import csv
import io
from typing import List, Optional

from agent_runtimes.loop.apps import Application, Session, UploadedFile

AGENT = "example-blank:0.0.1"

app = Application.from_spec(
    {
        "schema": "loop.app/v1",
        "id": "file-analysis",
        "name": "File Analysis",
        "kind": "chat",
        "agent": AGENT,
        "description": "Reads a CSV you send, computes its figures, charts them and says what they show.",
        "instructions": (
            "You are a data analyst. Explain the figures you are given in a few "
            "sentences; never invent one. The chart is drawn beside your answer: "
            "never write code."
        ),
        # What may be sent: a CSV of at most 10 MB (LOOP P-21).
        "interface": {"uploads": {"kinds": [{"type": ".csv", "max_mb": 10}]}},
    }
)


def number(value: str) -> Optional[float]:
    """A cell as a number, or None."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@app.file
async def analyse(session: Session, files: List[UploadedFile], text: str) -> None:
    for file in files:
        async with session.step(
            "Reading the file", kind="tool", input=file.name
        ) as step:
            rows = list(csv.DictReader(io.StringIO(file.content.decode("utf-8"))))
            if not rows:
                raise ValueError(f"{file.name} holds no row.")
            columns = list(rows[0])
            x = columns[0]
            numeric = [
                column
                for column in columns[1:]
                if all(number(row[column]) is not None for row in rows)
            ]
            figures = {
                column: {
                    "min": min(number(row[column]) for row in rows),
                    "max": max(number(row[column]) for row in rows),
                    "first": number(rows[0][column]),
                    "last": number(rows[-1][column]),
                }
                for column in numeric
            }
            step.output = {"rows": len(rows), "columns": columns, "figures": figures}
        y = "Close" if "Close" in numeric else numeric[0]
        answer = await session.agent.run(
            f"{text or 'What does this file show?'}\n\nThe file {file.name}: {len(rows)} rows, "
            f"columns {', '.join(columns)}. Computed figures: {figures}. "
            f"The chart of {y} by {x} is drawn beside your answer: say what it "
            "shows, in words."
        )
        await session.send(
            answer.text,
            show=[
                session.ui.chart(
                    "trend",
                    kind="line",
                    x=x,
                    y=y,
                    title=f"{y} by {x}",
                    points={"path": "/points"},
                )
            ],
            data={"points": [{x: row[x], y: number(row[y])} for row in rows]},
        )
