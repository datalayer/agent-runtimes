# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Text to SQL — the example of Chainlit's documentation (``examples/openai-sql``),
rebuilt with LOOP's API (LOOP P-27).

Chainlit offers a starter (*>50 minutes watched*), fills a prompt template
with what the person asked, calls the model with its own settings
(temperature 0, at most 500 tokens, stopping at the closing fence), and
streams the query into a message shown as SQL.

Here: ``app.starter``, the same template, ``session.agent.stream`` with
``model_settings`` for this call, and ``session.stream`` writing the query
into a message, fenced as SQL, as the model writes it. Nothing of Chainlit's
OpenAI client is the developer's: the application's agent is the model.
"""

from agent_runtimes.loop.apps import Application, Session

AGENT = "example-blank:0.0.1"

app = Application(
    id="sql-from-words",
    name="SQL from Words",
    agent=AGENT,
    description="Writes the SQL query a question asks for, on a streaming service's tables.",
    # Chainlit's template ends on an open fence, which its model continues;
    # Claude opens a fence of its own, where the stop sequence would cut it
    # short: it is told to write the query bare, and shown fenced as SQL.
    instructions=(
        "You write SQL queries, and nothing else: the query alone, with no "
        "fence and no words around it."
    ),
)
app.starter(
    ">50 minutes watched",
    "Compute the number of customers who watched more than 50 minutes of video this month.",
)

TEMPLATE = """SQL tables (and columns):
* Customers(customer_id, signup_date)
* Streaming(customer_id, video_id, watch_date, watch_minutes)

A well-written SQL query that {input}:
```"""

#: Chainlit's settings, as this model takes them: Claude refuses a
#: temperature and a ``top_p`` both said, so ``top_p`` (1, its default) is not.
SETTINGS = {
    "temperature": 0,
    "max_tokens": 500,
    "stop_sequences": ["```"],
}


async def fenced(pieces):
    """The query as the model writes it, fenced as SQL — Chainlit's ``language="sql"``.

    Yields
    ------
    str
        The opening fence, the model's pieces, the closing fence.
    """
    yield "```sql\n"
    async for piece in pieces:
        yield piece
    yield "\n```"


@app.message
async def main(session: Session, text: str) -> None:
    await session.stream(
        fenced(
            session.agent.stream(TEMPLATE.format(input=text), model_settings=SETTINGS)
        )
    )
