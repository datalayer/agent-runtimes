# PAP Company Role

An Agent Runtimes application can itself be a **company** personal agents work
with. Its Appspec says so in `pap.company` (agentspecs 0.0.77):

```yaml
pap:
  profile: draft-01
  company:
    enabled: true
    signed_out: true # a personal agent may ask before signing in
    interfaces: [agent, openapi, mcp]
    scopes: [orders:read, orders:write]
    extensions: [operations]
    personal_agents: registered # or `any`
    registered_agents:
      - https://atlas.example/agent.json # each one's client_id URL
    operations:
      - action: orders.exchange
        tool: exchange_order
        summary: Exchange order {order_id} for size {size}
        user_approval_required: true
```

Datalayer's company service publishes the application, admits the personal
agents it names, and asks it over A2A, marking each message `metadata.pap`.
The runtime (`agent_runtimes.apps.pap_company`) then:

1. **proposes** a declared operation instead of making it: in a company turn,
   the model's call of `exchange_order` does not run; its arguments become the
   terms, the Maker's `summary` is filled with them, and the proposal rides
   the answer as a `pap_operation` data artifact;
2. leaves the **confirmation** to the person, at the exact revision they were
   shown: here, the SDK's `approve()` and `terms_digest()` show that an
   approval of revision 1 does not confirm revision 2;
3. **performs** it in the turn whose one-use ticket was redeemed for that
   revision: the declared tool, with exactly the confirmed terms, once. Other
   terms and a retry are refused, and the turn reports `pap_performed`.

This `Application` walks that journey in process (the company service's ticket
redemption is represented by the `Performing` it would answer) and returns
the states, summaries and gate decisions. The tool ran once.

```bash
loop apps run examples/personal-agent-protocol/company-role/app.py
```

For the personal agent's side of the same exchange over HTTP, see
[`operations`](../operations/). See the PAP
[extensions guide](https://personal-agent-protocol.datalayer.tech/guides/extensions/).
