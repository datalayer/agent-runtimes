# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that runs on a schedule.

A morning digest: ``@app.schedule(cron)`` declares a schedule trigger in the
Appspec and gives it a handler. Each tick runs the handler in a session of
its own, with nobody present, and the session's record says what woke it
(``woken_by``). The application is a ``worker``: a chat starts when somebody
opens it, and refuses triggers.

Here the ticks are fired by hand — ``host.schedule(name)`` is what the
platform's scheduler does on each cron tick — three times, with items
arriving in between. Each tick is a new session, so what the handler keeps
across ticks lives outside the session (``SEEN``, a module variable here; a
file or a store on a runtime). The last run shows ``host.scheduled(session,
name)``, a tick run inside a session already open, which is what a runtime
does when the scheduler wakes a session over the Session API.

Runs in this process with no key and no network: a ``MemoryChannel`` reads
what is sent, pydantic-ai's ``TestModel`` stands in for the model, and the
record is kept in a list here.

    python runs_on_a_schedule.py
"""

import asyncio

from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.loop.apps import AppHost, Application, MemoryChannel, Session
from agent_runtimes.loop.apps.record import AppRecorder

INBOX: list[str] = []
SEEN = 0

app = Application(
    id="morning-digest",
    kind="worker",
    agent="example-blank:0.0.1",
    name="Morning digest",
    goal="A digest of what arrived, each weekday morning.",
)


@app.schedule("0 9 * * 1-5", description="The morning digest")
async def digest(session: Session) -> None:
    global SEEN
    new = INBOX[SEEN:]
    SEEN = len(INBOX)
    if not new:
        await session.send("Nothing new since the last digest.")
        return
    summary = await session.agent.run("Summarise these items.", items="; ".join(new))
    kept = await session.record(
        {"items": new, "summary": summary.text}, summary=f"{len(new)} new items"
    )
    await session.send(f"{len(new)} new: {', '.join(new)}. {summary.text}")
    session.state["kept"] = kept


async def main() -> None:
    spec = app.spec
    print(
        f"trigger: {spec.triggers[0].type} {spec.triggers[0].cron!r}, handler {app.schedule_at(0)!r}"
    )

    channel = MemoryChannel()
    record: list = []

    async def keep(body: dict) -> None:
        record.append(body)

    # The record keeps an entry only when the Appspec's `record.include` names
    # its kind. No plain call declares it, and `Application.from_spec` refuses a
    # worker before `@app.schedule` can add its trigger: so the recorder is
    # given a copy of the spec that includes `outputs`.
    kept_spec = spec.model_copy(
        update={"record": spec.record.model_copy(update={"include": ["outputs"]})}
    )
    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(
            TestModel(custom_output_text="Two deliveries and a visit.")
        ),
        recorder=AppRecorder(app=kept_spec, send=keep),
    )

    ids = []
    for tick, arrived in enumerate(([], ["parcel", "invoice"], ["visitor"]), start=1):
        INBOX.extend(arrived)
        session = await host.schedule("digest")
        ids.append(session.id)
        woke = record[-1]["woken_by"]
        print(f"tick {tick}: {channel.messages[-1].text}")
        print(
            f"  woken by {woke['kind']} {woke['schedule']!r} ({woke['cron']}), kept: {session.state.get('kept', '-')}"
        )
    print(f"sessions: {len(set(ids))} of {len(ids)} ticks are their own session")

    INBOX.append("letter")
    opened = await host.open()
    await host.scheduled(opened, "digest")
    print(f"in an open session: {channel.messages[-1].text}")


asyncio.run(main())
