# PAP Local Company

`PapCompanyCapability` publishes an application whose
Appspec enables `pap.company` as a PAP company, through the SDK's reference
company (`personal_agent_protocol.company`):

- `pap.company.agent` is the application over its A2A route, the
  message marked `metadata.pap`;
- a declared operation's tool call is proposed, not made, and the person is
  shown the Maker's sentence with the terms;
- once the person confirmed that exact revision, the company issues a
  one-use ticket and asks the application to perform; the runtime redeems it
  at `pap.company.operationTickets` (the company's `runtime_plugin()` on the
  runtime's platform) and makes that one call;
- `personal_agents: registered` admits only the agents the Appspec lists.

A local company offers the `agent` interface and Device Sign-In, approved on
the host's own page (`approve_device`). In Datalayer the same company is
hosted by the company service at `<slug>.apps.datalayer.ai`.

```bash
loop apps run examples/personal-agent-protocol/local-company/app.py
```
