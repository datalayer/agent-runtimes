# PAP Conversation Messages

This Loop application starts and continues a local PAP conversation with
user-global random message IDs. Credentials and pairwise identity remain in the
trusted host; the tool returns only safe conversation state.

The Python and TypeScript PAP clients enforce the same message-ID, retry,
response-validation, and DPoP transport boundaries. This Python Loop example
keeps the interaction compact while the linked guide documents both SDKs.

Read the [conversation flow](https://personalagentprotocol.org/examples/conversation-messages/).
