# A user with a company

The whole journey of one user with one company, both sides from the SDK: Ada asks
Atlas, her personal agent, to exchange a jacket at Manzanita Outfitters. Discovery,
a signed-out Session (a random `sid`), an `authorization` event with
`insufficient_scope` and the scope it needs, Device Sign-In on Manzanita's page,
the same Session and conversation continuing signed in, the exchange the company
returns asked of Ada and performed once on her approval, and finally a narrowed
refresh and its revocation.

Manzanita is the reference company from `personal_agent_protocol.company`,
assembled from Reactor contributions in `personal_agent_protocol.demo`. The tool
returns the steps in plain words and the outcome; no token, code, or Session JWT
enters it.

```bash
loop apps run examples/personal-agent-protocol/user-with-a-company/app.py
```

Read the [company guide](https://personalagentprotocol.org/docs/guides/company)
and the [example flow](https://personalagentprotocol.org/docs/examples/user-with-a-company).
