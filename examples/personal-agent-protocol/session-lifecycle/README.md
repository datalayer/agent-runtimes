# Session lifecycle

This example drives the real PAP `SessionClient` and `SessionHttpClient` over a
deterministic local HTTP transport. A Session starts with no request: a random
`sid`, kept by the agent. Every request then carries a fresh `Poppy-Session` JWT
naming that `sid`, signed with the delegated key for that User ID, which a key in
the agent's `jwks_uri` vouches for with a delegation.

When the company answers `invalid_session`, the Session starts again once, with a
new `sid` and the same User ID, and the request is sent again; a second refusal
goes back to the caller, who stops. The tool returns only lifecycle evidence; the
User ID, `sid`, keys, delegation, and Session JWTs remain host-only.

```bash
loop apps run examples/personal-agent-protocol/session-lifecycle/app.py
```

See the canonical [Sessions guide](https://personalagentprotocol.org/docs/guides/sessions).
