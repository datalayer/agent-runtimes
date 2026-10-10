# PAP Direct Sign-In lifecycle

This Agent Runtimes application exercises a complete PAP Direct Sign-In upgrade
of an existing signed-out Session. Its read-only tool proves one-use state,
S256 PKCE, trusted browser handoff, exact callback validation, a DPoP nonce
retry, partial consent, and Session continuity.

Only safe lifecycle evidence reaches the Loop model. Every authorization URL,
callback parameter, code, verifier, assertion, proof, Session Token, and
Account Token remains in host-owned code.

```bash
loop apps run examples/personal-agent-protocol/direct-sign-in-lifecycle/app.py
```

See the [PAP Direct Sign-In guide](https://personalagentprotocol.org/docs/guides/direct-sign-in).
