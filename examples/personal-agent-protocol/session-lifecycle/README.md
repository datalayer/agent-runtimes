# Signed-out Session lifecycle

This Loop application drives the real PAP `SessionClient` through signed-out
Session start, one DPoP nonce retry, and renewal over a deterministic local
HTTP transport. Reactor supplies the protected signer and DPoP provider.

```bash
loop apps run examples/personal-agent-protocol/session-lifecycle/app.py
```

The pairwise subject, Session ID, assertions, proofs, nonce, and tokens stay in
the host. The model sees lifecycle evidence only. See the canonical
[Sessions guide](https://personal-agent-protocol.datalayer.tech/guides/sessions/).
