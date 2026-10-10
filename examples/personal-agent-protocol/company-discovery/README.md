# Company discovery

This application discovers a PAP company through
`PapPersonalAgentCapability` and returns only its verified organization,
protocol version, issuer, sign-in choices, interface kinds and extension
versions. Operational endpoint URLs and response bodies do not enter model
context.

```bash
loop apps run examples/personal-agent-protocol/company-discovery/app.py
```
