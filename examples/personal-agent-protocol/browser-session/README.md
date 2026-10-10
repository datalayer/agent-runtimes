# PAP Browser Session

This Loop application signs a short-lived `poppy-browser+jwt` assertion,
passes it through a Reactor-controlled top-level form POST, verifies its
company and Session bindings, and demonstrates one-use replay rejection.

Only policy evidence reaches the model. The assertion, pairwise identity,
Session ID, key, and company cookie remain host-owned.

```bash
loop apps run examples/personal-agent-protocol/browser-session/app.py
```

Read the [Browser Session flow](https://personalagentprotocol.org/examples/browser-session/).
