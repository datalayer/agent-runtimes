# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that asks the person before it acts.

A reply desk: the code drafts a reply, then stops and asks — a
``ChoiceQuestion`` with *Send* and *Keep it as a draft* — before the send
step runs. The answer decides: sent, the reply is in the outbox; kept, it is
a draft, and nothing left.

The second half is the same question asked by a rule rather than by the
code: ``app.rule(..., applies_to="send", behaviour="ask_first")`` and a tool
that ``does="send"``. When the agent calls that tool, the host asks the
person *Allow* or *Refuse* before the tool runs; refused, the tool does not
run and the turn ends with ``AppRuleBlockedError``, which the code catches
and says.

Runs in this process with no key and no network: the person is played by a
``MemoryChannel`` (``channel.reply`` answers the next question), the agent
by pydantic-ai's ``TestModel``, which calls every tool it is given once.

    python asks_before_it_acts.py
"""

import asyncio

from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    AppRuleBlockedError,
    ChoiceQuestion,
    MemoryChannel,
    Session,
)
from agent_runtimes.loop.apps.record import AppRecorder

OUTBOX: list[tuple[str, str]] = []
DRAFTS: list[tuple[str, str]] = []
TO = "ada@example.com"

app = Application(
    id="reply-desk",
    kind="chat",
    agent="example-blank:0.0.1",
    name="Reply desk",
    instructions="Write short, plain replies, and send them with send_reply.",
)
app.rule("send a reply", applies_to="send", behaviour="ask_first")


@app.tool(does="send")
def send_reply(to: str, text: str) -> str:
    """Send a reply to somebody."""
    OUTBOX.append((to, text))
    return f"Sent to {to}."


@app.message
async def draft_then_ask(session: Session, text: str) -> None:
    """The code drafts, asks, and the answer decides."""
    draft = f"Hello Ada, {text.rstrip('.')}. Best, the desk"
    await session.send(f"Draft: {draft}")
    choice = await session.ask(
        ChoiceQuestion(f"Send it to {TO}?", ("Send", "Keep it as a draft"))
    )
    if choice == "Send":
        async with session.step("Sending", kind="tool", input=TO) as step:
            step.output = send_reply(TO, draft)
        await session.send(f"Sent to {TO}.")
    else:
        DRAFTS.append((TO, draft))
        await session.send("Kept as a draft. Nothing was sent.")


@app.command("agent", "Let the agent write and send the reply")
async def agent_sends(session: Session, words: str) -> None:
    """The agent acts; the rule asks the person before its tool runs."""
    try:
        reply = await session.agent.run(f"Reply to Ada: {words}")
    except AppRuleBlockedError:
        await session.send("You refused: the agent sent nothing.")
        return
    await session.send(reply.text)


async def main() -> None:
    channel = MemoryChannel()
    record: list = []

    async def keep(body: dict) -> None:
        record.append(body)

    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(
            TestModel(custom_output_text="Done: the reply is sent.")
        ),
        recorder=AppRecorder(app=app.spec, send=keep),
    )
    session = await host.open(user="ada")

    print("The code asks")
    channel.reply("Send")
    await host.message(session, "the invoice is paid")
    print(
        " ", channel.questions[-1].prompt, "->", "Send", "->", channel.messages[-1].text
    )
    channel.reply("Keep it as a draft")
    await host.message(session, "the meeting moved to Tuesday")
    print(
        " ",
        channel.questions[-1].prompt,
        "->",
        "Keep it as a draft",
        "->",
        channel.messages[-1].text,
    )

    print("The rule asks")
    channel.reply("Refuse")
    await host.message(session, "/agent the office is closed on Friday")
    print(
        " ",
        channel.questions[-1].prompt,
        "->",
        "Refuse",
        "->",
        channel.messages[-1].text,
    )
    channel.reply("Allow")
    await host.message(session, "/agent the office is closed on Friday")
    print(
        " ",
        channel.questions[-1].prompt,
        "->",
        "Allow",
        "->",
        channel.messages[-1].text,
    )

    print(f"outbox {len(OUTBOX)}, drafts {len(DRAFTS)}")


asyncio.run(main())
