# One Objective, Two Protocols, One Code Path

The proof-of-concept scenario of `PLAN_ORCHESTRATOR.md` (O0-13).

A parent asks for a notebook to be analysed and delegates the work twice:
once to a worker that speaks **A2A** and once to a worker that speaks **ACP**.
The orchestration is written once. The only thing that changes between the two
runs is the **agent descriptor** — who the worker is, which protocol it
speaks, and where it answers — and the example prints the difference at the
end so the claim is checkable rather than asserted.

## Run

```bash
python orchestrate.py
```

It starts both workers on ephemeral ports, delegates to each, and prints the
two event streams side by side, then what differed. It exits non-zero if the
two runs disagree.

Make targets:

```bash
make run       # both workers here
make runtime   # against workers reachable over the network
```

## What it shows

Both runs go through the same five steps, in the order a control plane does
them:

1. **Resolve the worker** the descriptor names, and read back what it turned
   out to be able to do. Decision 5 of section 19.8 requires a reduced
   guarantee to be _reported on the execution_ rather than hidden, so the
   first observation of every dispatch is the adapter's capability report —
   which is why the output says, in the adapter's own words, that A2A has no
   steer and ACP has no pause.
2. **Create the execution** under the delegating command's idempotency key,
   with the notebook named as `datalayer:notebook/<uid>@<version>` rather
   than copied into the prompt. Section 2 asks for context by reference, so
   that two workers analysing "the notebook" are demonstrably analysing the
   same version of it.
3. **Record the attempt and assign it.** Choosing a worker is a control-plane
   decision and never something an adapter observes.
4. **Dispatch**, recording every observation as canonical state. This is the
   seam of section 4: adapters report, the control plane decides. No adapter
   in this example ever names a canonical state.
5. **Arbitrate the commit.** The first attempt to reach commit wins
   (decision 4).

The two runs come out with the same execution state, the same milestones, and
**the same artifact content hash** — two hashes computed by two adapters from
two protocols' bytes. That is the equality the example is really claiming;
comparing the first line of an answer would pass on two workers that agreed
on a headline and differed underneath it.

What legitimately differs, and why:

|               | A2A                                                  | ACP                                                                                     |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Acceptance    | The task's own `submitted` state                     | The first session update, which is the earliest honest evidence                         |
| Artifact name | `notebook-analysis`, because A2A artifacts are named | `answer`, because an ACP turn has no artifact and the adapter registers the turn's text |
| Cannot do     | steer, pause, resume, checkpoint, collect, terminate | pause, resume, checkpoint, collect, terminate                                           |

## What it measures

The execution store takes the orchestration measures as it records — the
same ones a Datalayer deployment exports to its observability service — and
the example keeps them in memory and prints them last:

```text
Measures
  completed after a disconnect   no execution lost sight of its worker
  completed after a lost worker  no execution lost its worker
  duplicate delegations          0 of 2 (0%)
  superseded artifacts           0 of 2 (0%)
  time to acceptance             a2a 9 ms, acp 2 ms
  first worker event             a2a 8 ms, acp 1 ms
  conformance rate               printed by pytest agent_runtimes/tests/orchestration
```

The latencies are measured from the execution's creation, so they include
dispatch: the first worker event is the first milestone the worker reported,
and acceptance the first at or past `accepted`. Nothing here disconnects or
loses a worker, which is why those two shares have nothing to divide and say
so rather than printing 0%. The conformance rate belongs to the conformance
suite, which prints each binding's scenarios passed at the end of its run.

## The pieces

| File                    | What it is                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `orchestrate.py`        | The parent. One code path, run twice.                                                                            |
| `notebook_analysis.py`  | The work both workers do, so neither is the one doing it better.                                                 |
| `workers/a2a_worker.py` | An A2A server, on `fasta2a` — the same library `agent_runtimes.routes.a2a` serves the platform's agents with.    |
| `workers/acp_worker.py` | An ACP agent over WebSocket, whose methods, `session/update` shape and stop reason are the ACP SDK's own models. |
| `notebook.ipynb`        | The notebook. It has real problems in it, so a worker reporting "looks fine" would be visibly wrong.             |

### Why the workers are here rather than reused

`agent-runtimes` already serves agents over both protocols, and neither route
suits an example: both run a **model**, so they need credentials and give a
different answer every time — and a run whose two answers differ for that
reason would demonstrate nothing about orchestration. The workers here are
protocol shells around one shared, deterministic analysis. They are real
servers on the wire; what they are not is intelligent.

The client sides are _not_ re-implemented. The A2A adapter reaches the worker
through the same `ensure_remote_agent` and task relay the platform's subagents
use, and the ACP adapter through this repository's own `ACPClient`. If either
breaks, this example stops working.

## Against a Datalayer runtime

Point the example at workers reachable over the network rather than starting
them here:

```bash
python orchestrate.py \
  --a2a-endpoint https://<runtime-host>/api/v1/a2a/agents/<agent-id> \
  --acp-endpoint wss://<runtime-host>/api/v1/acp/ws/<agent-id>
```

or, with `DATALAYER_A2A_ENDPOINT` and `DATALAYER_ACP_ENDPOINT` exported,
`make runtime`.

Two things to expect there. The agents a runtime serves run models, so their
answers will not hash-match — the example says so plainly rather than
pretending, and the run is then a demonstration that the orchestration reaches
a real worker over both protocols, not that two models agree. And an
endpoint-less A2A descriptor is the other path: the adapter launches the
worker from an agentspec through `ensure_remote_agent`, on a Datalayer runtime
when the parent itself runs in the cloud.

## What this example does not do

Deliberately, because each is a later item and a stub here would be a claim:

- No durable control plane. The execution store is the in-memory one; Solr is
  O1-02 and the durable workflow is O1-03.
- No child executions. Trees are Phase 2 (O2-01).
- No context resolution. The notebook is _named_; resolving a reference and
  minting a scoped credential for it are O0-09 and O1-06.
- No artifact bodies. An artifact keeps a summary and a content hash;
  committing the body to contents or the Library is O1-10.
