# PAP Conversation Control

This `Application` drives the conversation controls of the real
`ConversationClient` against Manzanita Outfitters, the SDK's demo company,
configured with people available to take a conversation:

- `start_direct()` opens a Direct Conversation under an open parent, for the
  user to talk with the company through the agent's interface. While it is
  open, the parent refuses messages with `direct_conversation_open`, naming
  it.
- `handoff()` asks for a person: the parent goes `queued`, then a human
  responds.
- `close()` ends a conversation; closing the direct one tells the parent.

The tool returns statuses and event types only; credentials stay with the
host.

```bash
loop apps run examples/personal-agent-protocol/conversation-control/app.py
```

> Requires the next Personal Agent Protocol release: PAP 0.3.3 on PyPI does
> not include this feature yet. Until then, run it against an editable install
> of the PAP Python SDK (`pip install -e path/to/personal-agent-protocol`).

See the [PAP personal agent guide](https://personalagentprotocol.org/docs/guides/personal-agent).
