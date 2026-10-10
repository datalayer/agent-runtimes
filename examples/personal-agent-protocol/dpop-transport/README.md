# PAP DPoP Transport

This Loop application demonstrates fresh DPoP proof generation for an API
request, one nonce retry, and a same-origin redirect. It also proves that model
or caller-controlled authorization headers are rejected.

```bash
loop apps run examples/personal-agent-protocol/dpop-transport/app.py
```

Read the [DPoP transport flow](https://personalagentprotocol.org/examples/dpop-transport/).
