# PAP DPoP Transport

This Loop application demonstrates fresh DPoP proof generation for an API
request and one nonce retry, and refuses a redirect: PAP draft 0.3 never sends
a token or proof to the URL a protocol endpoint redirects to. It also proves that model
or caller-controlled authorization headers are rejected.

```bash
loop apps run examples/personal-agent-protocol/dpop-transport/app.py
```

Read the [DPoP transport flow](https://personal-agent-protocol.datalayer.tech/examples/dpop-transport/).
