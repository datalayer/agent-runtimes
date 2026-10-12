# An Agentic Commerce Protocol checkout, approved once

The [Agentic Commerce Protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
`2026-04-17` against a local test seller, *Example Outfitters*, in one
process with no network (example EX-05 of `plans/AGENT_PROTOCOLS.md`).
In code it is `agentic_commerce`, never `acp` (the Agent Client Protocol).

```bash
python examples/protocols/agentic_commerce/checkout.py --yes
```

- discovery at `/.well-known/acp.json`;
- a session that asks for the buyer's email, then `ready_for_payment`;
- the discount extension negotiated because the host contributed it to
  `agentic_commerce.extension.discount`, and the code `WELCOME10` applied;
- the exact purchase approved by the person (`agentic_commerce.approver`),
  paid with a delegated token the host holds (`agentic_commerce.paymentData`),
  completed once.

Developer documentation: `docs/docs/protocols/agentic-commerce.mdx`.

The TypeScript client against this seller over HTTP:

```bash
python examples/protocols/agentic_commerce/seller_server.py --port 8813
ACP_SELLER=http://127.0.0.1:8813 npx vitest run --project=integration \
    src/protocols/agentic-commerce/acpSeller.integration.test.ts
```
