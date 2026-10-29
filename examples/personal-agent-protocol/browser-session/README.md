# PAP Browser Session

This Loop application joins the personal agent's own browser to an existing
Session through Manzanita's demo world: the browser loads the company's join
form, which holds a one-time code tied to that browser by a `SameSite=Strict`
cookie; the host signs a DPoP proof over the code with the Session Key; and the
browser, contributed on `pap.browserJoin`, submits code and proof. It then
shows that a replayed code and a code submitted from another browser are
refused.

Only policy evidence reaches the model. The join codes, proofs, Session Key,
and company cookie remain host-owned.

```bash
loop apps run examples/personal-agent-protocol/browser-session/app.py
```

Read the [Browser Session flow](https://personal-agent-protocol.datalayer.tech/examples/browser-session/).
