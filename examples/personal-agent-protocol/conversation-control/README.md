# Conversation control

This example drives one Manzanita conversation through every control in PAP
draft 0.3 §7.9 to §7.12 with the real Python SDK: an `authorization` event
(`insufficient_scope`, with the scope the request needs) answered by signing
the same Session in mid-conversation (the conversation keeps its ID), a
Direct Conversation that locks its parent (`direct_conversation_open` names
it), a handoff to a person at the company, whose reply names its `author`
(`type: human`, with the person's `id` and `name`), and closing.

The tool returns statuses, event types, and the company's answers. Tokens,
user codes, and proofs stay in the host.

```bash
loop apps run examples/personal-agent-protocol/conversation-control/app.py
```

Read the [conversations guide](https://personalagentprotocol.org/docs/guides/conversations)
and the [example flow](https://personalagentprotocol.org/docs/examples/conversation-control).
