<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License


So your goal is to require approval for all or only some tools on that MCP server? And then to present the approval to the user using the Vercel AI integration?
yes, that is my goal to implement https://github.com/datalayer/jupyter-ai-agents/issues/53


As you know, Vercel AI Element are just React UI components, it is up to the developer to implement such features.
I believe it's a little bit more than that because of the Data Stream Protocol they implement: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol#data-stream-protocol, that we support as well: https://ai.pydantic.dev/ui/vercel-ai/, so you don't just get the components but also the automatic rendering of the chat interface based on the events that are coming from the server. Right?
The vercel ai-element tool approval has been merged 3 weeks ago https://github.com/vercel/ai-elements/pull/163
That's great! It doesn't look like they have events for that in the Data Stream Protocol yet though, so it's not clear how they expect agent backends to represent tool calls that require approval, or how they'll send approval to the backend...
I guess having a kind of reference implementation for common use cases/patterns will be good for the community. I would say that kind of case (external mcp server with tool approval like done by eg claude desktop) is quite common, or will become common
Definitely, which is partly why github.com/pydantic/pydantic-ai/issues/3295 exists, but there's currently a missing link in how approvals should be represented on the event stream going from agent to frontend, and in approval results going from frontend to agent. I'd expect Vercel AI to come up with something sooner rather than later since they have their own (TypeScript) agent SDK as well, which they'd then document in the Data Stream Protocol, which we can then support as well.
In the meantime, you could do something like this:
Wrap your MCPServer in ApprovalRequiredToolset (assuming all tools require approval). This means that when any of the tools are called, the agent run will end with a DeferredToolRequests object as result.output
When you use VercelAIAdapter.dispatch_request, you can add an on_complete handler that is passed the AgentRunResult and can yield additional Vercel AI events. In that handler, you can check result.output , and if it's DeferredToolRequests , you can yield a custom pydantic_ai.ui.vercel_ai.response_types.DataChunk wrapping those deferred tool requests, which will be sent to frontend
On the frontend you can handle that custom data part by showing the user the tool call that needs approval
When the user approves, you'll need to perform a new request to the backend containing that approval, by listing the approved tool_call_ids on the SubmitMessage payload (I'm not an expert on how this part of AI Elements works...)
In the backend endpoint, you then have to parse this value out of the SubmitMessage payload (similar to this: https://github.com/pydantic/ai-chat-ui/blob/b0ac18d2dbbef3cf1636c17a29fb7578a59b32c8/agent/chatbot/server.py#L115-L122), turn it into a DeferredToolResults object and pass it to the dispatch/run method as deferred_tool_results

-->

[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# 🤖 Agent Runtimes

[![Github Actions Status](https://github.com/datalayer/code-sandboxes/workflows/Build/badge.svg)](https://github.com/datalayer/code-sandboxes/actions/workflows/build.yml)
[![PyPI - Version](https://img.shields.io/pypi/v/code-sandboxes)](https://pypi.org/project/code-sandboxes)

**Agent Runtimes** is a flexible server framework for exposing AI agents through multiple protocols.

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
- 🔌 **Adapter Architecture**: Easy to add new agents and protocols
- 🛠️ **Tool Support**: MCP, custom tools, built-in utilities
- 📊 **Observability**: OpenTelemetry integration
- 💾 **Persistence**: DBOS support for durable execution
- 🔒 **Context Optimization**: LLM context management
