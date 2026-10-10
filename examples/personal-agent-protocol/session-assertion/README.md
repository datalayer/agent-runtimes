# Session assertion safety

This application builds real PAP claims with a random pairwise subject and
unique `jti`, then returns only lifetime, audience binding and safety
properties. The subject and `jti` are withheld and no unsigned claims are
presented as a usable assertion.

```bash
loop apps run examples/personal-agent-protocol/session-assertion/app.py
```

See the canonical
[Sessions guide](https://personal-agent-protocol.datalayer.tech/guides/sessions/).
