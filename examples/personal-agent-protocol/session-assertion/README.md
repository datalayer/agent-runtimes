# Session assertion safety

This application builds real PAP claims with a stable, opaque pairwise subject
and unique `jti`, then returns only lifetime, audience binding, and safety
properties. A Reactor plugin contributes a host-owned SQLite store that
resolves the subject from the configured tenant, local user, and verified
company issuer; none are model-controlled tool arguments. The subject and
`jti` are withheld and no unsigned claims are presented as a usable assertion.

```bash
loop apps run examples/personal-agent-protocol/session-assertion/app.py
```

See the canonical
[Sessions guide](https://personal-agent-protocol.datalayer.tech/guides/sessions/).
