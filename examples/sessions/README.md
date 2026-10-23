# Sessions: open, swap, clone, export, import

A session is one conversation of one person with one application's agent,
kept in the application's record — one id a person lists, resumes, hands to
another agent, clones, exports and ends. These examples do with the session
API what a person does on the web or with `loop sessions`.

**What they need.** A checkout of agent-runtimes with its Python environment
(`pip install -e .`). No key, no Datalayer account, nothing running: the
runtime's own routes run in the process, the application's agent is a model
that answers what it was told, and the sessions are kept in a file store of
the run's own. Run each from this folder. Each script is run by
`agent_runtimes/tests/test_the_sessions_examples.py`, which asserts what it
prints.

## A session's life, in process

`sessions_in_process.py` opens a session, has two turns with it, swaps its
agent in place — a framework agentspec of the library, so no key and no
organization's policy to pull as a harness would need; the new agent is told
in a sentence —, clones it from turn 1
(a new session, paused, with its lineage), exports it as a
`datalayer-session/1` file, imports that file as a new session and resumes
it, lists what the record holds, and ends the first.

```bash
python sessions_in_process.py
```

```text
opened     e67a52b2…: Claude: Plan the refactor
turn 2     Claude: Start with the tests
swapped    <an agentspec of the library> is told: "This conversation was with notes-claude until turn 2; from here it is with <its name>. What was said stays; what notes-claude kept for itself is gone."
turn 3     Second: Go on
cloned     c1a9f0e3… (paused, 1 turn, from e67a52b2… at turn 1)
refused    Session e67a52b2… has 3 turns; there is no turn 9 to clone it at.
exported   3 turns, 11 entries, 0 redactions → e67a52b2….session.jsonl
imported   7d2c4b10… (paused, 3 turns, from sha256:…)
resumed    7d2c4b10…: 3 turns replayed
listed     …
ended      e67a52b2… (ended)
```

On a real runtime the swap binds the other agent through
`configure-from-spec`; here, with no model, a stand-in re-registers the agent
with a second answering model (`_rebind`), so what the swap itself does —
the refusals, the sentence, the record's `swapped` row — is the runtime's.

## The same against Datalayer

With a kept deployment of an application on Datalayer, the same verbs from
the terminal, signed with the token `datalayer login` left (`--cloud`) and
pointed at the deployment's runtime (`--server`, as the Studio shows it):

```bash
loop sessions list --app shield-mvp --cloud --server https://…/agent-runtimes/01m5d3e8
loop sessions swap e67a52b2 --agent shield-mvp-codex --cloud --server …
loop sessions clone e67a52b2 --at 1 --title "Before the refactor" --cloud --server …
loop sessions export e67a52b2 -o before.session.jsonl --cloud --server …
loop sessions import before.session.jsonl --agent shield-mvp-claude-code --cloud --server …
```

The session id is the same in both, because the record is one.
