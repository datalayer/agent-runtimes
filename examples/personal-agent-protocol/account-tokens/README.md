# Refresh tokens

This example keeps Ada signed in to Manzanita Outfitters with the real Python
SDK `RefreshTokenClient`, against the reference company from
`personal_agent_protocol.demo` (real keys, real HTTP over ASGI, no network). A
refresh names no Session: it gets a new access token for the account, which any
of the User's Sessions uses. It shows rotation, races two refreshes through the
Reactor `pap.refreshTokenLock`, narrows scopes, asks for wider scopes
(`re_consent_required`), lets the token expire (`invalid_grant`, signed out), and
revokes it. After revocation the company answers the Session with an
`authorization` event: `insufficient_scope`.

The Agent Runtimes tool receives only statuses and scope names. Refresh tokens,
access tokens, client assertions, and Session JWTs stay in the host's Reactor
stores.

```bash
loop apps run examples/personal-agent-protocol/account-tokens/app.py
```

Read the [refresh tokens guide](https://personalagentprotocol.org/docs/guides/account-tokens)
and the [example flow](https://personalagentprotocol.org/docs/examples/account-tokens).
