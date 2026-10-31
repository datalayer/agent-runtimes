# Conversation events

This local Agent Runtimes tool uses the PAP `ConversationClient.events()` async
iterator. The trusted host long polls with the Session header, drains a
backlog immediately, suppresses repeated event IDs, and stops when the
conversation closes. Only safe event types and company text enter the tool
result.

Read the [conversation events flow](https://personalagentprotocol.org/examples/conversation-events/).
