# PAP Device Sign-In

This Agent Runtimes `Application` exercises the real PAP Device Sign-In state
machine. It presents a company-owned link and code, suppresses early polls,
handles `authorization_pending` and `slow_down`, upgrades the existing Session,
reports partial consent, and puts the Account Token in a Reactor token store.

Only safe lifecycle evidence reaches the Loop model. Device codes, assertions,
proofs, Session Tokens, and Account Tokens remain in host-owned code.

```bash
loop apps run examples/personal-agent-protocol/device-sign-in/app.py
```

See the [PAP Device Sign-In guide](https://personalagentprotocol.org/docs/guides/device-sign-in).
