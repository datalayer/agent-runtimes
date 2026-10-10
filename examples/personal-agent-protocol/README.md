# Personal Agent Protocol examples

Each directory is a small Agent Runtimes `Application` that teaches one PAP
feature while keeping protocol secrets outside model context.

| Example                                                 | Feature                                              | Model-visible result                         |
| ------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| [`company-discovery`](./company-discovery/)             | Verified company discovery and interface inventory   | Credential-free company summary              |
| [`agent-identity`](./agent-identity/)                   | Client metadata, same-domain JWKS and signing policy | Credential-free identity summary             |
| [`session-assertion`](./session-assertion/)             | Pairwise identity and short-lived assertion claims   | Policy only; no subject or `jti`             |
| [`direct-sign-in-boundary`](./direct-sign-in-boundary/) | State, S256 PKCE and browser handoff                 | Security properties only                     |
| [`dpop-proof`](./dpop-proof/)                           | Method, URL, token, nonce and replay binding         | Verified policy; all proof material withheld |
| [`session-lifecycle`](./session-lifecycle/)             | Start, nonce retry, and renewal over HTTP            | Lifecycle evidence; credentials withheld     |

The first two examples use Agent Runtimes' Python
`PapPersonalAgentCapability`. The remaining examples use PAP primitives inside
a deterministic read-only tool and deliberately return no assertion,
authorization URL, verifier, state, proof, or token.

Each example links to the PAP Docusaurus site, which is canonical for protocol
behavior and security guidance. A feature is considered demonstrated only when
the raw PAP and Agent Runtimes examples agree on the same host/model boundary.

From the Agent Runtimes repository:

```bash
loop apps run examples/personal-agent-protocol/company-discovery/app.py
python scripts/validate_pap_examples.py
```

Production Datalayer deployments inject metadata and authorization gateways.
Those gateways own DNS pinning, egress, key custody, one-use state, token
storage, consent and audit.
