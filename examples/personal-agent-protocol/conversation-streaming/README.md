# PAP Conversation Streaming

This `Application` reads a conversation with Manzanita Outfitters, the
SDK's demo company, over Server-Sent Events through the real
`ConversationClient.stream()`. A `text-delta` is display-only
(`actionable: false`) and is completed by its `message` event; the stream
ends at the `closed` state. A second stream resumes from `Last-Event-ID`
and skips what was already handled.

The host keeps the Session Token, proofs, and pairwise identity. The tool
returns event evidence only.

```bash
loop apps run examples/personal-agent-protocol/conversation-streaming/app.py
```

See the [PAP personal agent guide](https://personal-agent-protocol.datalayer.tech/guides/personal-agent/).
