# The Shield, from Python and in the browser

Examples of a coding agent — Claude Code, Codex, any agent speaking the
[Agent Client Protocol](https://agentclientprotocol.com) — run behind the
Shield (box SH-23). Each runs on a **fake
agent** first: the ACP SDK agent the tests drill every harness on
([`agent_runtimes/tests/fixtures/acp_fake_agent.py`](../../agent_runtimes/tests/fixtures/acp_fake_agent.py)),
which needs no model and no key. What a prompt makes it do: `edit` asks to
edit `hello.txt` and writes it, `read [<path>]` reads a file, `run <command>`
opens a terminal, `push` asks for a `git push`, `outside` reads
`/etc/hostname`, `plan` reports a plan.

**What they need.** A checkout of agent-runtimes with its Python
environment (`pip install -e .`), which brings `datalayer-agent-shield` and
its `agent-shield` command. No key, no Datalayer account, nothing running.
Run each from this folder. The outputs below are as printed on 16 October
2026 (agent-runtimes 1.5.42, agent-shield 0.2.0); the workspace is a fresh
temporary directory each time, and the runtime's own log lines go to
standard error, left out here.

`fake_harness.py` is not an example: it describes the fake agent as a
harness (the way the catalogue describes Claude Code) and makes a workspace.

Each script is run by `agent_runtimes/tests/test_the_shield_examples.py`,
which asserts what it prints, and `docs/scripts/check_examples.py` checks
that every script is named here and that what they import exists.

## A coding agent on the local runtime

`harness_on_the_runtime.py` starts what `loop --harness <id>` starts: the
runtime's server on this machine, the harness made at startup through the
create route, the workspace it guards. It sends one AG-UI turn over HTTP, as
the terminal and the web chat do, and prints what the runtime streamed: the
harness's own tool calls with the Shield's decision, the Shield's own rows
(*Write hello.txt — do it*) and the change as a `diff` display.

```bash
python harness_on_the_runtime.py
```

```text
Harness    fake
Workspace  /tmp/shield-example-d5ylbw1u

> edit and read README.md
  tool call  Edit hello.txt (edit) — decided: Edit hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)
  tool call  Write hello.txt — do it (edit)
  diff       hello.txt: None -> 'hello, shield\n'
  diff       hello.txt: '' -> 'hello, shield\n'
  tool call  Read README.md (read) — decided: Read README.md: ask me first — no rule names it, and nothing unsaid is done
  tool call  Read README.md — do it (read)
  agent      done
  finished

In the workspace: hello.txt says 'hello, shield\n'
```

The harness's own notification of its read carries no path, so the decision
written beside it is the cautious one (*ask me first*); the read itself is
the Shield's answer to `fs/read_text_file`, decided with its path: *do it*.

**Claude Code** is the same script with its adapter installed and a funded
key — without them it is refused in the runtime's sentence, before anything
starts:

```bash
agent-shield setup --harness claude-code        # the pinned adapter, in ~/.agent-shield
export ANTHROPIC_API_KEY=...                    # a key with credit
python harness_on_the_runtime.py --harness claude-code --prompt "Add a line to README.md saying hello"
```

```text
Claude Code's adapter @agentclientprotocol/claude-agent-acp@0.91.0 is not installed: neither /home/you/.agent-shield/harnesses/claude-code@0.91.0/node_modules/.bin/claude-agent-acp (`agent-shield setup --harness claude-code`) nor 'claude-agent-acp' on the PATH (the runtime image installs it at build, SH-05).
```

Not run with Claude Code itself here: the only Anthropic key at hand has no
credit (*Credit balance is too low*, said by the Shield as a sentence on r1).

`python harness_on_the_runtime.py --serve` serves the runtime on port 8765
until interrupted, for the web chat below.

## The proxy, driven from Python

`proxy_from_python.py` is the ACP client an editor would be, in front of
`agent-shield run -- <the fake agent>`: Datalayer's default policy
(decision 5) in an `agent-shield.yaml`, an audit file of its own. An edit
inside the workspace is *do it* — the agent's permission request never
reaches the client; a `git push` is *ask me first* — the question reaches the
client, which says no; a read outside the workspace is refused in a sentence.
Then the audit is read back, as `agent-shield log` reads it.

```bash
python proxy_from_python.py
```

```text
Workspace  /tmp/shield-example-_az6jl6a
Policy     Datalayer's default (decision 5)

Connected  agent-shield 0.2.0

> edit
  tool call  Edit hello.txt (edit, pending)
  tool call  Write hello.txt — do it (edit, in_progress)
  tool call  shield_1 completed
  tool call  c1 completed
  agent      done
  ended      end_turn

> push
  asked      git push origin main? (Allow, Reject) -> Reject
  agent      push: field_meta=None option_id='reject' outcome='selected'
  agent      done
  ended      end_turn

> outside
  tool call  Read /etc/hostname — leave it to me (read, in_progress)
  tool call  shield_2 failed
  agent      [Shield] Read /etc/hostname: leave it to me — /etc/hostname is outside the workspace /tmp/shield-example-_az6jl6a, and the Shield answers files only inside it
  agent      outside refused: Read /etc/hostname: leave it to me — /etc/hostname is outside the workspace /tmp/shield-example-_az6jl6a, and the Shield answers files only inside it
  agent      done
  ended      end_turn

The audit, read back
  session     initialize  [shield]
  session     new  [shield]
  turn        prompt  [shield]
  tool_call   Edit hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)  [policy]
  permission  Edit hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)  [policy]
  fs_write    Write hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)  [policy]
  fs_write      [shield]
  tool_call   completed  [agent]
  tool_call   completed  [agent]
  turn        ended  [shield]
  turn        prompt  [shield]
  permission  git push origin main (`git push origin main`): ask me first — session rule 'git push' (the command is shown)  [person]
  turn        ended  [shield]
  turn        prompt  [shield]
  fs_read     Read /etc/hostname: leave it to me — /etc/hostname is outside the workspace /tmp/shield-example-_az6jl6a, and the Shield answers files only inside it  [policy]
  turn        ended  [shield]

The edit was done without asking, the push was asked and refused.
```

## A rule tightened on a running session

`session_rule.py` runs the runtime's harness agent (`ACPAgent`) and does what
`POST /api/v1/apps/sessions/{uid}/rules` does — `session_rules().add(uid,
rule_from(body))` — between two turns: the rule *no reads* holds from the
next action; a rule that would allow commands freely is refused because the
organization's rules ask first (on Datalayer, read from IAM; given here as a
document); taken back (`DELETE …/rules/no reads`), reading is done again.

```bash
python session_rule.py
```

```text

> read README.md
  Shield     Read README.md — do it
  agent      done

Added      {'name': 'no reads', 'decision': 'deny', 'classes': ['read']} -> the session's rules: ['no reads']

> read README.md
  Shield     Read README.md — leave it to me
  agent      [Shield] Read README.md (README.md): leave it to me — session rule 'no reads'
  agent      [Shield] Read README.md: leave it to me — session rule 'no reads'
  agent      read refused: Read README.md (README.md): leave it to me — session rule 'no reads'
  agent      done

Refused    The session rule is refused, it would permit more than the organization's policy: the session rule 'run freely' says do it where the organization rule 'commands ask' says ask me first; a session policy tightens the organization's and cannot loosen it.

Removed    no reads

> read README.md
  Shield     Read README.md — do it
  agent      done
```

## The audit, read back from the record

`audit_read_back.py` gives the harness agent the application's recorder —
the one a shipped application's runtime sends to ai-agents — whose `send`
keeps what would be sent. One turn edits a file (*do it*, a diff) and runs a
command naming a key (*ask me first*, approved by the script as a person
would in *Waiting for you*). The record's `include` names `diffs` and
`terminals`, so both are kept whole; the key is redacted in every entry
before anything keeps it.

```bash
python audit_read_back.py
```

```text
> edit and run echo sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx
  asked      Run `echo sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx` -> approved
  agent      done

The record of app-example: 21 entries
  session   A session of Shield example started
  run       Shield example is working
  step      turn: prompt
  decision  Edit hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)
  decision  Edit hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)
  decision  Write hello.txt (hello.txt): do it — session rule 'edit and move inside the workspace' (shown as diffs)
  tool_call Write hello.txt: done
  tool_call Write hello.txt — do it: shown  [kept whole: hello.txt now 'hello, shield\n']
  tool_call Edit hello.txt: completed
  tool_call Edit hello.txt: completed
  tool_call Edit hello.txt: shown  [kept whole: hello.txt now 'hello, shield\n']
  decision  Run echo [redacted]: ask me first — session rule 'run a command'
  approval  Run `echo [redacted]`: approved: allow_once
  tool_call Run `echo [redacted]`: create
  tool_call terminal: exit
  tool_call terminal: release
  tool_call Run echo [redacted]: completed
  tool_call Run echo [redacted]: shown  [kept: exit 0, output '[redacted]\n']
  step      turn: ended
  turn      edit and run echo [a credential, withheld]
  output

The key appears nowhere in the record.
```

## An orchestrator delegating to a coding agent over A2A

`delegate_to_a_harness.py` serves the fake agent behind the Shield as an A2A
worker and delegates one objective to it with the orchestration adapter a
Datalayer orchestrator uses (`agent_runtimes.orchestration.adapters.a2a`).
Each file the agent changed comes back as a `text/x-diff` artifact named by
its path, its content's hash as its provenance, checked here against the
bytes.

```bash
python delegate_to_a_harness.py
```

```text
Worker     http://127.0.0.1:39917/api/v1/a2a/agents/coding-worker
Objective  edit the greeting

  observed   execution.progress: Dispatching over a2a without: steer, pause, resume, checkpoint, collect, terminate.
  observed   execution.acknowledged: The A2A endpoint has the task, in state 'submitted'.
  observed   execution.progress: The A2A task is 'submitted'.
  observed   execution.state_changed: working
  observed   execution.acknowledged: The worker is running task '3c781d29-d757-4490-93a3-20ca1be6a4bc'.
  observed   execution.progress: Calling 'Edit hello.txt'.
  observed   execution.progress: Calling 'Write hello.txt — do it'.
  observed   execution.progress: 'Write hello.txt — do it' answered.
  observed   execution.progress: 'Edit hello.txt' answered.
  observed   execution.progress: done
  artifact   result (text/plain)
  artifact   hello.txt (text/x-diff)
  observed   execution.state_changed: completed
  observed   execution.acknowledged: The A2A task ended and its artifacts are registered.

The diff of hello.txt:
  --- a/hello.txt
  +++ b/hello.txt
  @@ -0,0 +1 @@
  +hello, shield
  provenance sha256:653220712728d6e64adeeb32099bd2cf243bc29aa819f6fda3f9206d79200c7e (matches)

In the worker's workspace: hello.txt says 'hello, shield\n'
```

## In the browser: the examples app

Two pages of the examples app (`npm run examples`, then the *Shield* group):

- **Shield Harness** (`src/examples/ShieldHarnessExample.tsx`): the web chat
  on the local runtime above (`python harness_on_the_runtime.py --serve`
  first): the agent's changes drawn as diffs and its commands as terminals
  by the `shield-displays` plugin, a command waiting in the approval banner.
  Its openers are the fake agent's words. Held by
  `src/examples/__tests__/shieldExamples.test.ts` (the agent's name, the
  port and the openers against this folder and the fake agent); **not yet
  seen in a browser**.
- **Shield Policy** (`src/examples/ShieldPolicyExample.tsx`): an
  organization's document typed by `@datalayer/agent-shield`, what it decides
  by class, the tool kinds classed, the limits soft then hard, decisions in
  `describeDecision`'s words. Needs nothing running. `@datalayer/agent-shield`
  is not on npm yet, so the page reads it from the sibling checkout
  `ai/agent-shield` beside agent-runtimes (Vite's `import.meta.glob`), and
  says so when it is not there. Held by
  the same test, which checks every row against the package.

## See also

- [Harnesses](../../docs/docs/harnesses/index.mdx) and
  [served over every protocol](../../docs/docs/harnesses/transports.mdx).
- [The Shield](../../docs/docs/shield/index.mdx).
- The Shield's own package: `agent-shield run`, `serve`, `policy`, `log`.
