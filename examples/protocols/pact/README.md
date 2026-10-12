# A personal agent at a business, over PACT 1.0

[PACT](https://github.com/openpactprotocol/openpactprotocol) 1.0 (Decagon,
Instinct; published 2026-10-06), both profiles, against a local Provider with
one Brand, *Example Air*, in one process with no network (example EX-06 of
`plans/AGENT_PROTOCOLS.md`).

```bash
python examples/protocols/pact/personal_agent.py
```

- the Brand's Agent Card read: its interface, the personal-agent JWT, its
  delegation and its scopes, each with its action class;
- a conversation under the personal-agent JWT alone (*Identity*), signed by
  the host's ES256 key through `pact.signer`;
- the person signs in at the Brand's own page and grants one scope of the two
  asked (*Delegated*, RFC 8628); the agent reads back what was granted;
- a change needs the other scope: the Brand asks for it (a step-up), the
  person grants it, the change is made;
- every reply under delegation carries a signed receipt, verified and kept.

The TypeScript personal agent at the same Brand, over HTTP:

```bash
python examples/protocols/pact/provider_server.py --port 8811
PACT_PROVIDER=http://127.0.0.1:8811 npx vitest run --project=integration \
  src/protocols/pact/pactProvider.integration.test.ts
```

Developer documentation: `docs/docs/protocols/pact.mdx`.
