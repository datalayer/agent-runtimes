# PAP Conversation Events

This Loop application follows a deterministic local PAP conversation through
the real `ConversationClient.events()` iterator. The trusted host owns the
Session Token, proof, pairwise identity, cursor, and duplicate-event set. The
tool exposes only ordered event evidence and terminal status.

The iterator long polls when caught up, drains `has_more` pages immediately,
suppresses replayed event IDs, and provides an explicit host callback when a
saved cursor has expired.

Read the [conversation events flow](https://personalagentprotocol.org/examples/conversation-events/).
