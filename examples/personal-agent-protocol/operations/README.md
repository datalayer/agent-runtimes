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

> Requires the next Personal Agent Protocol release: PAP 0.3.3 on PyPI does
> not include this feature yet. Until then, run it against an editable install
> of the PAP Python SDK (`pip install -e path/to/personal-agent-protocol`).

See the [PAP extensions guide](https://personalagentprotocol.org/docs/guides/extensions).
