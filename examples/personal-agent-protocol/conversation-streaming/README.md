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

> Requires the next Personal Agent Protocol release: PAP 0.3.3 on PyPI does
> not include this feature yet. Until then, run it against an editable install
> of the PAP Python SDK (`pip install -e path/to/personal-agent-protocol`).

See the [PAP personal agent guide](https://personalagentprotocol.org/docs/guides/personal-agent).
