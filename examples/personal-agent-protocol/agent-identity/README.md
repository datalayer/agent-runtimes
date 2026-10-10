# Personal-agent identity

This application verifies public client metadata and its same-domain JWKS. It
returns the client name, redirect count, extension versions and allowed
signing algorithms. JWK coordinates, operational endpoint URLs and private key
material never become a tool result.

```bash
loop apps run examples/personal-agent-protocol/agent-identity/app.py
```

See the canonical
[personal-agent guide](https://personal-agent-protocol.datalayer.tech/guides/personal-agent/).
