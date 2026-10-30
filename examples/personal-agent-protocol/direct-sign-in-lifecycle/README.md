# Direct Sign-In lifecycle

This example runs the complete PAP Direct Sign-In for a signed-out Session. It
demonstrates one-use state, S256 PKCE, a trusted browser handoff, exact callback
validation, and partial consent. Sign-in is plain OAuth: neither the authorization
URL nor the token request names the Session, and the token response is a Bearer
access token with a refresh token.

The Agent Runtimes tool receives only safe outcome evidence. Authorization URLs,
callback parameters, codes, verifiers, assertions, access tokens, and refresh
tokens stay inside host-owned code.

```bash
loop apps run examples/personal-agent-protocol/direct-sign-in-lifecycle/app.py
```

Read the [Direct Sign-In guide](https://personalagentprotocol.org/docs/guides/direct-sign-in)
for the production trust boundaries and failure rules.
