<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License
-->

[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# 🤖 🚀 Agent Runtimes

[![Github Actions Status](https://github.com/datalayer/agent-runtimes/actions/workflows/build.yml/badge.svg)](https://github.com/datalayer/agent-runtimes/actions/workflows/build.yml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/f7f9e08a-884f-4f76-b20d-666d5873716c/deploy-status)](https://app.netlify.com/projects/agent-runtimes/deploys)
[![PyPI - Version](https://img.shields.io/pypi/v/agent-runtimes)](https://pypi.org/project/agent-runtimes)

**Agent Runtimes** is a unified library for deploying, managing, and interacting with AI agents across multiple protocols and frameworks. It provides both a Python server for hosting agents and React components for seamless integration into web and desktop applications.

## What is Agent Runtimes?

Agent Runtimes solves the complexity of deploying AI agents by providing:

1. **Protocol Abstraction**: One agent, multiple protocols - deploy your agent once and access it through ACP, Vercel AI SDK, AG-UI, MCP-UI, or A2A without changing your code.

2. **Framework Flexibility**: Write agents using your preferred framework (Pydantic AI, LangChain, Jupyter AI) while maintaining a consistent API.

3. **Cloud Runtime Management**: Built-in integration with Datalayer Cloud Runtimes for launching and managing compute resources with Zustand-based state management.

4. **UI Components**: Pre-built React components (ChatBase, ChatSidebar, ChatFloating) that connect to agents and execute tools directly in the browser.

5. **Tool Ecosystem**: Seamless integration with MCP (Model Context Protocol) tools, custom tools, and built-in utilities for Jupyter notebooks and Lexical documents.

![Agent Runtimes Chat Web](https://images.datalayer.io/product/agent-runtimes/agent-runtimes-example-1.gif)

![Agent Runtimes Chat CLI](https://images.datalayer.io/products/codeai/codeai_short_cut.gif)

## 🌟 Features

### Multi-Protocol Support
- **ACP (Agent Client Protocol)**: WebSocket-based standard protocol
- **Vercel AI SDK**: Compatible with Vercel's AI SDK for React/Next.js
- **AG-UI**: Lightweight web interface (Pydantic AI native)
- **MCP-UI**: Interactive UI resources protocol with React/Web Components
- **A2A**: Agent-to-agent communication

### Multi-Agent Support
- **Pydantic AI**: Type-safe agents (fully implemented)
- **LangChain**: Complex workflows (adapter ready)
- **Jupyter AI**: Notebook integration (adapter ready)

### Built-in Features
- 🔌 **Flexible Architecture**: Easy to add new agents and protocols
- 🛠️ **Tool Support**: MCP, custom tools, built-in utilities
- 📊 **Observability**: OpenTelemetry integration
- 💾 **Persistence**: DBOS support for durable execution
- 🔒 **Context Optimization**: LLM context management

## Documentation

The detailed guides for architecture, use cases, interactive chat, key concepts, and runtime configuration are now in Docusaurus docs:

- [Agent Runtimes Overview](https://agent-runtimes.datalayer.tech/)
- [Integrations](https://agent-runtimes.datalayer.tech/integrations)
- [Chat](https://agent-runtimes.datalayer.tech/chat)
- [Transports](https://agent-runtimes.datalayer.tech/transports)
- [Programmatic Tools](https://agent-runtimes.datalayer.tech/programmatic-tools)
- [CLI](https://agent-runtimes.datalayer.tech/cli)
