# Personal Agent Protocol examples

Each directory is a small Agent Runtimes `Application` that teaches one PAP
feature while keeping protocol secrets outside model context.

| Example                                                   | Feature                                              | Model-visible result                         |
| --------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| [`company-discovery`](./company-discovery/)               | Verified company discovery and interface inventory   | Credential-free company summary              |
| [`agent-identity`](./agent-identity/)                     | Client metadata, same-domain JWKS and signing policy | Credential-free identity summary             |
| [`session-assertion`](./session-assertion/)               | Pairwise identity and short-lived assertion claims   | Policy only; no subject or `jti`             |
| [`direct-sign-in-boundary`](./direct-sign-in-boundary/)   | State, S256 PKCE and browser handoff                 | Security properties only                     |
| [`direct-sign-in-lifecycle`](./direct-sign-in-lifecycle/) | Complete Session upgrade and partial consent         | Lifecycle evidence; all secrets withheld     |
| [`dpop-proof`](./dpop-proof/)                             | Method, URL, token, nonce and replay binding         | Verified policy; all proof material withheld |
| [`session-lifecycle`](./session-lifecycle/)               | Start, nonce retry, and renewal over HTTP            | Lifecycle evidence; credentials withheld     |
| [`browser-session`](./browser-session/)                   | Controlled form POST and one-use browser assertion   | Browser policy; all credentials withheld     |
| [`dpop-transport`](./dpop-transport/)                     | Nonce retry and redirect-bound fresh proofs          | Transport policy; credentials withheld       |

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

## Guided visual journey

The example gallery also includes **PAP Guided Journey**, a separate
Reactor-contributed interactive story. It keeps the focused JSON examples for
developers, but presents the complete user experience as five synchronized
views:

1. company discovery;
2. signed-out Session and conversation;
3. Direct Sign-In on the company's page;
4. the company's offer in the same conversation; and
5. the exact user-authorized exchange and final result.

Each step pairs a phone-style user view with the company's allowed state and
an expandable, redacted protocol exchange. The discovery, Session assertion,
and Direct Sign-In fixtures are validated with the TypeScript PAP SDK in the
browser; no live credentials or network service are required.
