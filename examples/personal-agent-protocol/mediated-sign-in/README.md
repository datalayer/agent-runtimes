# PAP Mediated Sign-In

Mediated Sign-In is the mode a company offers when its users cannot leave for
a browser: the personal agent collects the fields the company declares and
sends them to the company's own endpoint, once. This `Application` runs the
real `MediatedSignInClient` against Manzanita Outfitters, the SDK's demo
company.

The credentials and the one-time code are collected through the Reactor
point `pap.protectedInput`, the host's own trusted surface (a script in this
demo), never from the model or a tool argument. A mistyped code is asked for
again; the right one signs the same Session in. The tool reports which
questions were asked, where the company sent the code (as the company masked
it), and the outcome, and checks that the password appears in no result.

```bash
loop apps run examples/personal-agent-protocol/mediated-sign-in/app.py
```

> Requires the next Personal Agent Protocol release: PAP 0.3.3 on PyPI does
> not include this feature yet. Until then, run it against an editable install
> of the PAP Python SDK (`pip install -e path/to/personal-agent-protocol`).

See the [PAP personal agent guide](https://personalagentprotocol.org/docs/guides/personal-agent).
