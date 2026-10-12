# PAP Company Connection

An application works with a company **as a personal agent** by naming it in
`pap.connections` of its Appspec:

```yaml
pap:
  connections:
    - id: orders
      company: manzanita.example # the domain, as discovery takes it
      access: read # or write
      as: user # each person signs in to their own account
      scopes: [orders:read] # the fewest scopes the application needs
      interfaces: [agent, mcp]
      sign_in: [device, direct] # preferred first
```

The runtime (`agent_runtimes.loop.apps.pap_connections`) reaches each company
through Datalayer's MCP gateway as one server named from its domain
(`pap_manzanita_example`, `?only=pap&pap-company=manzanita.example`), its tools
prefixed with that name so two companies' tools never collide. It holds no key
and no token of the company's. What each gateway tool does is the gateway's
own table, so the application's Rules decide them as any other tool, and a
`read` connection is given only the tools that read: `pap_confirm`,
`pap_mcp_call` and `pap_disconnect` are withheld.

**Scopes narrow the sign-in.** The gateway asks, of what the company offers,
only the scopes the connection names, and never a `:write` scope on a `read`
connection; the person's consent never widens either. A connection that names
no scope asks for none. This narrowing happens in the gateway, not in this
process: the example shows the declared scopes and the level the runtime
grants.

```bash
loop apps run examples/personal-agent-protocol/company-connection/app.py
```

See the PAP [Sessions guide](https://personal-agent-protocol.datalayer.tech/guides/sessions/).
