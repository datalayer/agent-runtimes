# Shopping over UCP, a purchase approved once

The [Universal Commerce Protocol](https://ucp.dev) `2026-08-25` against a
local test merchant, _Example Store_, in one process with no network
(example EX-04).

```bash
python examples/protocols/ucp/shopping.py --yes
```

- discovery of the store's profile at `/.well-known/ucp`, and a catalog search;
- a checkout that asks for the buyer's email (`incomplete`), then
  `ready_for_complete`;
- the exact purchase proposed — _Buy 2 × Sencha green tea, 100 g at
  store.example for USD 27.00_ — and approved by the person through the
  host's `ucp.approver`;
- paid with the host's instrument (`ucp.paymentInstruments`): the token goes
  to the store, never to the agent;
- completed once: the same proposal again is refused.

Developer documentation: `docs/docs/protocols/ucp.mdx`.

The TypeScript client against this store over HTTP:

```bash
python examples/protocols/ucp/merchant_server.py --port 8812
UCP_MERCHANT=http://127.0.0.1:8812 npx vitest run --project=integration \
    src/protocols/ucp/ucpMerchant.integration.test.ts
```
