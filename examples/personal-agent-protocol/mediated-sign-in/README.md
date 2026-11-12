# Mediated Sign-In

This example signs Ada in to Manzanita Outfitters at the company's token
endpoint, with the Mediated Sign-In extension grant and the real Python SDK
`MediatedSignInClient`. Her email, password, and one-time code are collected by
the host's trusted input surface (the Reactor `pap.protectedInput` contribution,
scripted here), never by the model. It also shows a forbidden field name refused
before the user is asked, a wrong code asking again under the same sign-in, and
a sign-in that ends with a refresh token kept behind a reference.

The Agent Runtimes tool receives field labels, statuses, the company's masked
`sent_to`, and granted scopes. Credentials, codes, and tokens never enter it.

```bash
loop apps run examples/personal-agent-protocol/mediated-sign-in/app.py
```

Read the [Mediated Sign-In guide](https://personalagentprotocol.org/docs/guides/mediated-sign-in)
and the [example flow](https://personalagentprotocol.org/docs/examples/mediated-sign-in).
