# Three applications in Python

Three small applications written with `agent_runtimes.apps` — an
`Application`, its handlers, an `AppHost` that drives it — each doing one
thing the reference ([Applications in Python](../../docs/docs/apps/python-applications.mdx))
describes: answering from a document, asking before acting, running on a
schedule.

**What they need.** A checkout of agent-runtimes with its Python environment
(`pip install -e .`). No key, no Datalayer account, nothing running: the
person is played by a `MemoryChannel`, the agent by pydantic-ai's
`TestModel`, and each session's record is kept in memory — the host's
default when no recorder is given (`host.recorder.entries` reads it) —
rather than sent anywhere. Run each from this folder. Each script is run by
`agent_runtimes/tests/test_the_python_applications_examples.py`, which
asserts what it prints.

## Answers from a document

`answers_from_a_document.py` answers questions from `handbook.txt`, beside
it. A `@app.start` handler says what it answers from; `@app.message` finds
the paragraph with the most words in common with the question in a
`retrieval` step (`run_sync` reads the file in a thread, `@cache` keeps the
paragraphs for the whole process), asks the agent with that passage as
context in a `model` step, and sends the answer with the passage quoted under
it. A question no paragraph matches is answered by the code alone.

```bash
python answers_from_a_document.py
```

```text
I answer from handbook.txt: 6 paragraphs. Ask away.

How many days off do I get?
Handbook desk: Here is what the handbook says.
> Days off. Everybody has twenty-five days off a year, taken in whole or half days. Ask your lead a week ahead for one day, a month ahead for a week or more.

Who feeds the office cat?
Handbook desk: The handbook says nothing about that.

steps: Finding the passage (retrieval), Answering (model), Finding the passage (retrieval)
```

## Asks before it acts

`asks_before_it_acts.py` is a reply desk that stops before it sends. Two ways
of asking, both answered by `channel.reply(...)` here and by a press of a
button on a page:

- **The code asks.** `@app.message` drafts a reply, then
  `await session.ask(ChoiceQuestion("Send it to …?", ("Send", "Keep it as a draft")))`
  stops the turn until the person answers. The answer decides: _Send_ runs
  the send step and the reply is in the outbox; the other keeps it as a draft.
- **The rule asks.** `app.rule("send a reply", applies_to="send",
behaviour="ask_first")` and a `@app.tool(does="send")`: when the agent
  calls the tool (`/agent …` runs it through an `@app.command`), the host asks
  the person _Allow_ or _Refuse_ before the tool runs; the question names the
  tool and its arguments, then the rule. Refused, the tool does not run and
  `session.agent.run` raises `AppRuleBlockedError`, which the code catches
  and says. Each decision is on the record (`host.recorder.entries`), since
  `app.record(include=["decisions"])` keeps them.

```bash
python asks_before_it_acts.py
```

```text
The code asks
  Send it to ada@example.com? -> Send -> Sent to ada@example.com.
  Send it to ada@example.com? -> Keep it as a draft -> Kept as a draft. Nothing was sent.
The rule asks
  send_reply(to='a', text='a') — Your rule “send a reply”: ask you first. -> Refuse -> You refused: the agent sent nothing.
  send_reply(to='a', text='a') — Your rule “send a reply”: ask you first. -> Allow -> Done: the reply is sent.
outbox 2, drafts 1
decisions on the record: 2
```

## Runs on a schedule

`runs_on_a_schedule.py` is a morning digest, a `worker` (a chat starts when
somebody opens it, and refuses triggers). `@app.schedule("0 9 * * 1-5")`
declares the schedule trigger in the Appspec and gives it a handler; each
tick runs the handler in a session of its own, with nobody present, and the
record says what woke it (`woken_by`). The ticks are fired by hand with
`host.tick("digest")` — what the platform's scheduler does on each cron
tick — three times, with items arriving in between; `host.tick("digest",
session=opened)` then runs a tick inside a session already open, as a runtime
does when the scheduler wakes one over the Session API. Each tick being a new
session, what the handler keeps across ticks lives outside it (a module
variable here).

```bash
python runs_on_a_schedule.py
```

```text
trigger: schedule '0 9 * * 1-5', handler 'digest'
tick 1: Nothing new since the last digest.
  woken by schedule 'digest' (0 9 * * 1-5), kept: -
tick 2: 2 new: parcel, invoice. Two deliveries and a visit.
  woken by schedule 'digest' (0 9 * * 1-5), kept: True
tick 3: 1 new: visitor. Two deliveries and a visit.
  woken by schedule 'digest' (0 9 * * 1-5), kept: True
sessions: 3 of 3 ticks are their own session
in an open session: 1 new: letter. Two deliveries and a visit.
```

`kept: True` because `app.record(include=["outputs"])` says so: an
application keeps nothing in its record unless its Appspec says so.
