# Delegation claims

The agent's tool has a real delegation signed internally, then returns only its
claim names, lifetime, and what it leaves out. A Reactor plugin contributes a
host-owned SQLite store that keeps one stable, opaque subject for the configured
tenant, local user, and verified company issuer. Those keys and the subject are
not tool arguments or results. Pairwise subject, `jti`, the delegation, and
signing keys remain outside model context.

A delegation names the agent (`iss`) and a delegated public key (`cnf.jwk`); it
names no User and no Company. The Session JWT that the delegated key signs names
those (`sub`, `aud`), and the Session (`sid`), for one request.

```bash
loop apps run examples/personal-agent-protocol/delegation/app.py
```

See the canonical [Sessions guide](https://personalagentprotocol.org/docs/guides/sessions).
