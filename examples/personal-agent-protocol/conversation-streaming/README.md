# Conversation streaming

This example streams a Manzanita conversation over SSE with the real Python SDK
`ConversationClient.stream()`. A small transport between Atlas and Manzanita
cuts the first stream right after a `text-delta`, so the SDK reconnects with
`Last-Event-ID`, reports the partial message as discarded, and never delivers
an event twice. The agent closes the conversation and the stream stops on the
`closed` state.

Text deltas are display only (`actionable` is always false). The tool returns
counts and the company's complete message; tokens and proofs stay in the host.

```bash
loop apps run examples/personal-agent-protocol/conversation-streaming/app.py
```

Read the [conversations guide](https://personalagentprotocol.org/docs/guides/conversations)
and the [example flow](https://personalagentprotocol.org/docs/examples/conversation-streaming).
