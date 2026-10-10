# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Text to SQL — Chainlit's cookbook ``bigquery``, rebuilt with LOOP's API (LOOP P-27).

Chainlit runs a chain of three steps for each question about an ``order``
table: a model writes the SQL, the query runs, and a model explains the
result to a support operator; the explanation carries a *Take action* button,
whose callback answers *Contacting shipping carrier...*.

Here: three ``tool`` steps inside a ``run`` step (``session.step``, nested),
the application's agent for both model calls, the result shown as the
catalog's Table, and the button an ``@app.action``. The table is SQLite in
this process rather than BigQuery — the warehouse is the developer's, in
Chainlit's example as here. Chainlit streams the SQL into its step as it is
written; a LOOP step shows its output when it ends.
"""

import re
import sqlite3
from datetime import date

from agent_runtimes.loop.apps import Application, Session

AGENT = "example-a2a-writer:0.0.1"

app = Application(
    id="text-to-sql",
    name="Text to SQL",
    agent=AGENT,
    description="Writes the SQL for a question about orders, runs it, and explains the result.",
    instructions="You write SQLite queries and explain query results to customer support, briefly.",
)

SQL_PROMPT = """You have a SQLite table named `orders`.
The table contains information about orders, including `order_id`, `order_date`, `estimated_delivery_date`, and `status`.
Write one SQL query, and nothing else, to retrieve the full order based on the given question:

{input}"""

EXPLAIN_PROMPT = """Today is {date}
You received a query from a customer support operator regarding the orders table.
They executed a SQL query and provided the results in Markdown table format.
Analyze the table and explain the problem to the operator.

Markdown Table:

{table}

Short and concise analysis:"""

ORDERS = [
    (1001, "2026-09-20", "2026-09-27", "delivered"),
    (1002, "2026-09-28", "2026-10-03", "shipped"),
    (1003, "2026-10-01", "2026-10-06", "processing"),
]


def database() -> sqlite3.Connection:
    """The orders, in a database of this process."""
    connection = sqlite3.connect(":memory:")
    connection.execute(
        "create table orders (order_id integer, order_date text, estimated_delivery_date text, status text)"
    )
    connection.executemany("insert into orders values (?, ?, ?, ?)", ORDERS)
    return connection


def sql_of(text: str) -> str:
    """The query in what the model wrote, fenced or not."""
    fenced = re.search(r"```(?:sql)?\s*(.+?)```", text, re.S | re.I)
    return (fenced.group(1) if fenced else text).strip().rstrip(";")


@app.message
async def main(session: Session, text: str) -> None:
    async with session.step("chain", kind="run", input=text):
        async with session.step("gen_query", kind="tool", input=text) as step:
            step.output = sql_of(
                (await session.agent.run(SQL_PROMPT.format(input=text))).text
            )
        query = step.output
        async with session.step("execute_query", kind="tool", input=query) as step:
            if not re.match(r"(?is)^\s*select\b", query):
                raise ValueError(f"Only a SELECT is run: {query}")
            cursor = database().execute(query)
            columns = [column[0] for column in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
            table = (
                "| "
                + " | ".join(columns)
                + " |\n|"
                + "---|" * len(columns)
                + "\n"
                + "\n".join(
                    "| " + " | ".join(str(row[column]) for column in columns) + " |"
                    for row in rows
                )
            )
            step.output = table
        async with session.step("analyze", kind="tool", input=table) as step:
            analysis = await session.agent.run(
                EXPLAIN_PROMPT.format(date=date.today(), table=table)
            )
            step.output = analysis.text
    await session.send(
        analysis.text,
        show=[
            session.ui.table("result", columns=columns, rows={"path": "/rows"}),
            session.ui.button(
                "take-action",
                child="take-action-label",
                action={"event": {"name": "take_action"}},
            ),
            session.ui.text("take-action-label", text="Take action"),
        ],
        data={"rows": rows},
    )


@app.action("take_action")
async def take_action(session: Session, payload: dict) -> None:
    await session.send("Contacting shipping carrier...")
