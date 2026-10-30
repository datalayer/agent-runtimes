# Session JWT boundary

The tool signs a real ES256 Session JWT with a delegated key (one per User ID at
one Company, kept by the host's key custody, vouched for by a delegation from a
key in the agent's `jwks_uri`), then verifies it as a company does: HTTP method,
normalized URL, company issuer, access-token hash, and one-use replay checks. A
second User ID gets its own delegated key.

What a tool may tell a model: that the checks held. It returns only boolean
policy evidence. The Session JWT, delegation, token, JWK, `jti`, Session ID,
User ID, and private keys never enter model context.

```bash
loop apps run examples/personal-agent-protocol/session-jwt/app.py
```

See the canonical [JOSE guide](https://personalagentprotocol.org/docs/guides/cryptography).
