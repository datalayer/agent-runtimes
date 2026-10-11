# PAP Account Tokens

This Agent Runtimes `Application` signs Ada in to Manzanita Outfitters, the
SDK's demo company, then uses the real `AccountTokenClient` on the Account
Token the sign-in returned. It refreshes the Session (and the company rotates
the token), narrows a refresh to fewer scopes, asks for a wider one (the
company answers `invalid_scope`, reported as `re_consent_required`),
revokes the token, and shows the Session continues signed out.

The Account Token stays behind an opaque reference in the host's Reactor
`TokenStore`. The tool returns lifecycle evidence only: no Account Token,
Session Token, assertion, proof, or token reference reaches the Loop model.

```bash
loop apps run examples/personal-agent-protocol/account-tokens/app.py
```

> Requires the next Personal Agent Protocol release: PAP 0.3.3 on PyPI does
> not include this feature yet. Until then, run it against an editable install
> of the PAP Python SDK (`pip install -e path/to/personal-agent-protocol`).

See the [PAP Sessions guide](https://personalagentprotocol.org/docs/guides/sessions).
