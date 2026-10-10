# Direct Sign-In boundary

This application builds a real state- and PKCE-protected authorization
request inside a deterministic tool, then returns only safe status. The
authorization URL, state and verifier are not model-visible. A production
host persists one-use state and hands the URL directly to a user-owned browser.

```bash
loop apps run examples/personal-agent-protocol/direct-sign-in-boundary/app.py
```
