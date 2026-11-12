# Device Sign-In

This example runs PAP Device Sign-In through the real Python SDK. It shows the
human a company-owned link and code, respects the company's polling interval
and `slow_down`, checks the verification link against the issuer and its
`protected_resources`, reports partial consent, and stores the refresh token
behind an opaque Reactor reference. Sign-in is plain OAuth: it names no Session.

The Agent Runtimes tool receives only lifecycle evidence. Device codes, client
assertions, access tokens, and refresh tokens remain in host-owned code.

```bash
loop apps run examples/personal-agent-protocol/device-sign-in/app.py
```

Read the [Device Sign-In guide](https://personalagentprotocol.org/docs/guides/device-sign-in).
