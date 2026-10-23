# Plugins: a harness and a file format from packages of their own

The session is extended through the reactor and nothing else: a harness,
where sessions are kept, the files they travel as, what a swap carries and
what runs before each operation are each a named contribution point of the
`agent-runtimes` reactor extension. A third party contributes to them from a
pip package, by the same route the catalogue does. Two packages here show it.

**What they need.** A checkout of agent-runtimes with its Python environment
(`pip install -e .`); no key, nothing running. Run `show_contributed.py` from
this folder; the packages themselves are installed with `pip install
./aider-harness ./omnigent-format` beside agent-runtimes, which is what
`agent_runtimes/tests/test_harness_plugin_package.py` does in a folder of
its own.

## `aider-harness`: a harness as a pip package

`aider-harness/` declares `aider = "aider_harness:extension"` under
`datalayer.reactor.extensions`; its plugin contributes the harness read from
`aider.yaml` — the catalogue's schema: `acp.command`, `requires`, `terms`,
`capabilities` — with the ACP adapter every ACP harness is driven by. Once
installed, `loop harnesses` lists *Aider* with its terms and capabilities,
and an agent spec may say `harness: aider`. The yaml launches the ACP SDK's
fake agent of the tests, so the example needs no key.

A yaml missing `terms` is refused at the seam, naming the plugin — *a
harness whose terms are unknown is not served* — and a second package
contributing `aider` is refused by name. Nothing in agent-runtimes is edited.

## `omnigent-format`: a second session file format

`omnigent-format/` contributes `omnigent-jsonl/1` to `session.format`: its
importer reads another tool's `session_meta` + `item` lines into the record's
entries (a `message` item a `turn`, a `function_call` a `tool_call`, the rest
refused by kind, in a sentence), its exporter the inverse.
`loop sessions import --format omnigent-jsonl/1 file.jsonl` and
`POST /sessions/import?format=omnigent-jsonl/1` reach it; the built-in
`datalayer-session/1` is contributed the same way.

## See them contributed

```bash
python show_contributed.py
```

```text
harnesses  claude-code, codex, custom, fast-agent, gemini-cli, goose, opencode, openhands, aider
formats    datalayer-session/1, omnigent-jsonl/1
plugins    aider-harness 0.0.1 — Aider as a harness of agent-runtimes, from a package of its own.
plugins      aider-harness: harness (aider)
refused    aider-harness: harness 'aider' refused — aider-harness contributes harness 'aider' without terms: a harness whose terms are unknown is not served.
```
