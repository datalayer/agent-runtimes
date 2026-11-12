# Session HTTP transport

This example sends a PAP API request with the `Poppy-Session` header and a Bearer
access token, starts a new Session once after `invalid_session` and resends the
request in it, refuses a redirect (draft 0.3 §3: no token or Session JWT goes to
the URL a protocol endpoint redirects to), and rejects caller-supplied
authorization headers.

Access tokens, Session JWTs, and Session IDs remain host-owned.

```bash
loop apps run examples/personal-agent-protocol/session-transport/app.py
```

Read the [Session transport flow](https://personalagentprotocol.org/examples/session-transport/).
