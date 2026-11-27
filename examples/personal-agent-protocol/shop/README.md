# PAP Shop

A shop and a person's own agent, both in a local runtime: the Online Shop
(the catalogue's `online-shop` application) published as a PAP company by
`PapCompanyCapability`, and Ada's personal agent buying from it with
`PapPersonalAgentCapability`.

- the company's scopes and its one operation, `orders.place`, are the
  Appspec's: the operation is derived from its `openapi` (`placeOrder`,
  `x-pap`);
- its A2A route answers from the shop's own tools
  (`agent_runtimes.tools.online_shop`), which read the catalogue bundled with
  the application — 24 products, their photos at `images.datalayer.io` — as
  the shop's agent does on a runtime, with no model here;
- before signing in, the personal agent asks for tennis gear under 60 USD and
  is told each product with its price, stock and photo;
- signed in (Device Sign-In, approved on the host's own page), it has a basket
  quoted, the total summed by the shop's tool;
- asked to place the order, the shop proposes it rather than placing it; Ada
  approves that exact revision, the company issues a one-use ticket, and the
  perform turn places the test order once — **nothing is charged and nothing
  ships**.

A local company offers its `agent` interface alone. On Datalayer the same
shop also answers at its MCP, API and web addresses.

```bash
agent apps run examples/personal-agent-protocol/shop/app.py
```

Read the [Operations guide](https://personalagentprotocol.org/docs/guides/operations).
