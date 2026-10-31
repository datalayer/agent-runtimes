# Direct Sign-In boundary

The tool creates real random state and an S256 PKCE verifier, and builds the
authorization URL, which names no Session. It returns only safe security
properties. Registration, discovery, and allowed-scope values come from trusted
`PAP_*` host configuration and are not tool arguments. The host—not the
model—owns the redirect URI, authorization URL, state, verifier, callback, and
tokens.

```bash
loop apps run examples/personal-agent-protocol/direct-sign-in-boundary/app.py
```

See the canonical
[Direct Sign-In guide](https://personalagentprotocol.org/docs/guides/direct-sign-in).
