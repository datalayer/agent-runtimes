<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License
-->

[![Datalayer](https://images.datalayer.io/legacy/datalayer-25.svg)](https://datalayer.ai)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# 🤖 🚀 Agent Runtimes

[![Github Actions Status](https://github.com/datalayer/agent-runtimes/actions/workflows/build.yaml/badge.svg)](https://github.com/datalayer/agent-runtimes/actions/workflows/build.yaml)
[![PyPI - Version](https://img.shields.io/pypi/v/agent-runtimes)](https://pypi.org/project/agent-runtimes)

**Agent Runtimes** runs AI agents and serves them over the protocols the agent world speaks. It is a Python server that hosts agents built from [agentspecs](https://agentspecs.datalayer.tech) (Pydantic AI by default), with their MCP tools, skills, code sandbox and guardrails. It is also a set of React components (chat, floating assistant, the Loop workspace) that talk to them. It drives coding agents such as Claude Code as harnesses, behind the Shield. It runs on your machine with your own model keys, or on [Datalayer](https://datalayer.ai) runtimes.

![An agent answering in the chat, its code execution shown](https://images.datalayer.io/products/agent-runtimes/agent-runtimes-chat.gif)

## Install

```bash
pip install agent-runtimes        # Python 3.11 or later: the server and the `loop` CLI
npm install @datalayer/agent-runtimes   # the React components
```

## Run

With a model key in the environment (for example `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or AWS Bedrock credentials):

```bash
loop --local -a example-simple
```

`loop` starts a local server with the `example-simple` agent and opens a chat in the terminal. `agent-runtimes serve --port 8765` starts the server on its own, for the web components.

![The loop CLI: a question, a code execution, the answer](https://images.datalayer.io/products/agent-runtimes/agent-runtimes-loop-cli.gif)

## Features

- **The meta-harness.** Coding agents run as harnesses, driven over the Agent Client Protocol (ACP): **Claude Code, Codex, OpenCode and pi** today. The runtime launches the harness, lends it tools through the MCP gateway and writes the skills into its workspace. It serves the harness over every protocol it serves its own agents on. The **Shield** surrounds it: the pod's egress boundary, the policies and the session's rules, the audit record and the trace. See [Harnesses](https://agent-runtimes.datalayer.tech/harnesses/) and [the Shield](https://agent-runtimes.datalayer.tech/shield/).
- **Protocol integrations.**
  - *Transports to a UI or another agent*: AG-UI, the Vercel AI SDK, ACP and A2A (served, and called as a client), with A2UI, MCP-UI and MCP Apps for generative UI.
  - *Tools*: MCP, local servers over stdio and remote servers over Streamable HTTP.
  - *Identity, consent and commerce*, each a Reactor plugin: Web Bot Auth (with a draft TAP profile), PAP (Personal Agent Protocol), PACT, UCP and the Agentic Commerce Protocol.

  See [Protocols](https://agent-runtimes.datalayer.tech/protocols/).
- **Applications.** An Appspec (or a Python `app.py`) becomes a chat, a widget, a worker or a decision. You run it with `loop apps run`, deploy it at its own address and embed it in any page with the `<datalayer-app>` element. See [Apps](https://agent-runtimes.datalayer.tech/apps/).
- **Tools and code.** MCP servers, skills, a code sandbox and Codemode, which calls tools from code. See [Programmatic Tools](https://agent-runtimes.datalayer.tech/programmatic-tools/).
- **Controls.** Guardrails, tool approvals, budgets, hooks, monitoring and OpenTelemetry. See [Identity](https://agent-runtimes.datalayer.tech/identity/) and [Hooks](https://agent-runtimes.datalayer.tech/hooks/).
- **Sessions, subagents and teams.** Sessions you can resume, clone, export and import. Subagents, and teams of agents over A2A. See [Sessions](https://agent-runtimes.datalayer.tech/sessions/) and [Subagents](https://agent-runtimes.datalayer.tech/subagents/).
- **Chat UI.** React chat components, a floating assistant with its avatar, voice, presence, and the Loop workspace in the browser. See [Chat](https://agent-runtimes.datalayer.tech/chat/).
- **Agent Nodes.** Your own machine registers as a node and is reached from Datalayer. See [Agent Nodes](https://agent-runtimes.datalayer.tech/agent-nodes/).

## Examples

```bash
npm install && pip install -e .
make examples      # the local server on :8765 and the examples gallery on :3000
```

## Documentation

Everything else is on the documentation site: **[agent-runtimes.datalayer.tech](https://agent-runtimes.datalayer.tech)**. It covers the [CLI](https://agent-runtimes.datalayer.tech/cli/), [endpoints](https://agent-runtimes.datalayer.tech/endpoints/), [agentspecs](https://agent-runtimes.datalayer.tech/agentspecs/), [integrations](https://agent-runtimes.datalayer.tech/integrations/), [sessions](https://agent-runtimes.datalayer.tech/sessions/), [plugins](https://agent-runtimes.datalayer.tech/plugins/) and the API references.

## License

[BSD 3-Clause](LICENSE).
