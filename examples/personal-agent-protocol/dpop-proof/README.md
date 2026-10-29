# DPoP proof boundary

This application creates and verifies a real ES256 DPoP proof inside a
read-only host tool. It checks method, normalized URL, access-token hash,
company nonce, signature, and one-use replay state, then returns only policy
evidence to the model.

```bash
loop apps run examples/personal-agent-protocol/dpop-proof/app.py
```

The proof, token, nonce, JWK, `jti`, key thumbprint, and private key remain
host-only. See the canonical
[JOSE and DPoP guide](https://personal-agent-protocol.datalayer.tech/guides/cryptography/).
