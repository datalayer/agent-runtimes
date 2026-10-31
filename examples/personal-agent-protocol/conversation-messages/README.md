# Conversation messages

This local Agent Runtimes tool starts and continues a PAP conversation while the
host retains the Session, its Session JWTs, the delegated key, and message IDs. Each message names its `author` (`agent` when the
personal agent writes it, `human` when it relays the user's words). Retry a
message with the same `Message` object so its ID and content remain identical.

Read the [conversation messages flow](https://personalagentprotocol.org/examples/conversation-messages/).
