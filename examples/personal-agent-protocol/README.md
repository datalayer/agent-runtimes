# Personal Agent Protocol examples

Each directory is a small Agent Runtimes `Application` that teaches one PAP
feature while keeping protocol secrets outside model context.

| Example                                                   | Feature                                                | Model-visible result                              |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| [`company-discovery`](./company-discovery/)               | Verified company discovery and interface inventory     | Credential-free company summary                   |
| [`agent-identity`](./agent-identity/)                     | Client metadata, same-domain JWKS and signing policy   | Credential-free identity summary                  |
| [`session-assertion`](./session-assertion/)               | Pairwise identity and short-lived assertion claims     | Policy only; no subject or `jti`                  |
| [`direct-sign-in-boundary`](./direct-sign-in-boundary/)   | State, S256 PKCE and browser handoff                   | Security properties only                          |
| [`direct-sign-in-lifecycle`](./direct-sign-in-lifecycle/) | Complete Session upgrade and partial consent           | Lifecycle evidence; all secrets withheld          |
| [`device-sign-in`](./device-sign-in/)                     | Device code, paced polling and protected token storage | Lifecycle evidence; all secrets withheld          |
| [`dpop-proof`](./dpop-proof/)                             | Method, URL, token, nonce and replay binding           | Verified policy; all proof material withheld      |
| [`session-lifecycle`](./session-lifecycle/)               | Start, nonce retry, and renewal over HTTP              | Lifecycle evidence; credentials withheld          |
| [`browser-session`](./browser-session/)                   | Join form, one-time code, proof with the Session Key   | Browser policy; all credentials withheld          |
| [`dpop-transport`](./dpop-transport/)                     | Nonce retry, fresh proofs, refused redirects           | Transport policy; credentials withheld            |
| [`conversation-messages`](./conversation-messages/)       | Start and continue with idempotent message IDs         | Conversation state; credentials withheld          |
| [`conversation-events`](./conversation-events/)           | Long poll and de-duplicate ordered conversation events | Event evidence; credentials withheld              |
| [`account-tokens`](./account-tokens/)                     | Refresh, rotation, narrowing and revocation            | Lifecycle evidence; token and reference withheld  |
| [`mediated-sign-in`](./mediated-sign-in/)                 | Credentials on `pap.protectedInput`, sent once         | Questions asked and outcome; credentials withheld |
| [`conversation-streaming`](./conversation-streaming/)     | SSE events, display-only deltas, Last-Event-ID         | Event evidence; credentials withheld              |
| [`conversation-control`](./conversation-control/)         | Direct Conversation, handoff and close                 | Statuses and event types; credentials withheld    |
| [`operations`](./operations/)                             | Operations v1: exact approval, at most once            | States, revisions and company summaries           |
| [`user-with-a-company`](./user-with-a-company/)           | A user with a company, end to end                      | What each party saw; codes and tokens withheld    |
| [`two-companies`](./two-companies/)                       | Two companies composed: Ledgerly at Northwind          | Who approved what, and where; secrets withheld    |
| [`sign-in-display`](./sign-in-display/)                   | The sign-in card as a display (`PapSignIn`, RU-1)      | Display's model view; no link, no code            |
| [`company-connection`](./company-connection/)             | `pap.connections`: gateway server, level, scopes       | Tools given and withheld; credentials elsewhere   |
| [`company-role`](./company-role/)                         | `pap.company`: propose, confirm, perform once          | Proposals, revisions and gate decisions           |
| [`local-personal-agent`](./local-personal-agent/)         | `PapPersonalAgentCapability` with the host's reactor   | Summaries only; tokens and device code withheld   |
| [`local-company`](./local-company/)                       | `PapCompanyCapability`: the application as a company   | What the person was shown; ticket used once       |

Every example runs against the released PAP Python SDK — Agent Runtimes pins
0.27.0 and later (`personal-agent-protocol[ui]`), which implements
[PAP draft 0.3](https://personalagentprotocol.org/docs/0.3/spec), the
specification published at [personalagentprotocol.org](https://personalagentprotocol.org)
from [personal-agent-protocol/personal-agent-protocol](https://github.com/personal-agent-protocol/personal-agent-protocol);
all of them ran on 0.27.0 on 27 October 2026
(`python scripts/validate_pap_examples.py`). Most run
the SDK's self-contained `demo` worlds: real keys, proofs and HTTP over ASGI in
one process, with no network and no model.

The last three show what Agent Runtimes itself adds to PAP:

- `sign-in-display`: a tool's `PapSignIn` display reaches the page through
  `DisplayMCPToolset` and the AG-UI adapter, while the model reads only its
  model view;
- `company-connection`: an application working with a company as a personal
  agent through Datalayer's gateway (`pap.connections`), given only the tools
  its level gives, its sign-in asking only the scopes it names; and
- `company-role`: an application that is itself a company (`pap.company`,
  agentspecs 0.0.77), whose declared operation is proposed, confirmed by the
  person at its exact revision, and performed once.

The first two examples use Agent Runtimes' Python
`PapPersonalAgentCapability`. The remaining examples use PAP primitives inside
a deterministic read-only tool and deliberately return no assertion,
authorization URL, verifier, state, proof, or token.

Each example links to the PAP Docusaurus site, which is canonical for protocol
behavior and security guidance. A feature is considered demonstrated only when
the raw PAP and Agent Runtimes examples agree on the same host/model boundary.

The seven views of the examples gallery (`src/examples/Pap…Example.tsx`:
Account Tokens, Mediated Sign-In, conversation streaming and control,
Operations, a user with a company, two companies) replay traces recorded
from the SDK's demo worlds by `traces/generate.py`: each trace names the SDK
release that recorded it (`sdk`), and each view says it is recorded data, not
live, with that release.

From the Agent Runtimes repository:

```bash
loop apps run examples/personal-agent-protocol/company-discovery/app.py
python scripts/validate_pap_examples.py
```

The validator builds every example, rejects duplicate application and tool
IDs and tools that take a host-only value (a token, a verifier, a pairwise
identifier), checks that each declared company operation names one of the
application's tools, and runs every argument-free `read` tool once.

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

## Replayed traces

Seven more gallery examples (**PAP User with a Company**, **PAP Two
Companies**, **PAP Account Tokens**, **PAP Mediated Sign-In**, **PAP
Conversation Streaming**, **PAP Conversation Control** and **PAP
Operations**) replay, step by step, what the user sees, what each party holds,
and the sequence of HTTP exchanges between them. These views call no SDK
function: they read redacted traces generated from the Python demo worlds:

```bash
python examples/personal-agent-protocol/traces/generate.py
```

The script writes `src/examples/pap/traces/<slug>.json`, replaces every token,
code, proof, assertion and credential with a placeholder such as
`‹session token›`, renumbers random identifiers, and refuses to write a trace
in which a secret survives.

## The sign-in card

**PAP Sign-In Display** draws a `pap_sign_in` result the way the chat does:
the AG-UI result carries the `PapSignIn` display in `_meta`,
`resolveToolResult` (`@datalayer/reactor/ui`) finds it, and `ReactorDisplay`
draws it with the renderer the `pap-sign-in` plugin contributes for
`application/vnd.datalayer.pap.sign-in+json`: the company's domain, the page
to open, the code for a device sign-in, and until when. A plain result of the
same tool, with no display, is read by the plugin's tool binding.
