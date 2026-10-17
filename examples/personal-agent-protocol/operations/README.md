# PAP Operations

The PAP Operations extension (v1) lets a company propose an action and
perform it only once the personal agent confirms the exact revision the user
approved. This `Application` runs the real `OperationsClient` against
Manzanita Outfitters, the SDK's demo company:

- Operations are used only because both sides list `operations` version 1.
- A standing permission (the Reactor point `pap.standingPermissionStore`)
  never confirms a revision that needs the user's own approval.
- Ada approves revision 1; the company revises the terms; the confirmation
  returns `terms_changed` with what changed, and the stale approval is refused
  locally for revision 2.
- Ada approves revision 2: it is confirmed once, and a retry returns the same
  record. A second proposal is cancelled.

A chat message is never an approval. The tool returns states, revisions, and
the company's summaries; credentials stay with the host.

```bash
loop apps run examples/personal-agent-protocol/operations/app.py
```

See the [PAP extensions guide](https://personal-agent-protocol.datalayer.tech/guides/extensions/).
