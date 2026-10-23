# Signed agent requests (Web Bot Auth)

An agent signs its requests so a website can tell it is this agent and not
someone pretending; the website verifies with the agent's published keys.
This implements `draft-ietf-webbotauth-httpsig-protocol-00` (2026-09-01),
HTTP Message Signatures (RFC 9421) for automated traffic.

```bash
python examples/protocols/web_bot_auth/signed_agent.py
```

Runs in one process with no network (examples EX-01 and EX-02):

- the agent's origin serves its key directory at
  `/.well-known/http-message-signatures-directory`, its response signed by
  every key it lists;
- the agent signs with the signer its host contributed to
  `web_bot_auth.signer` — the Web Bot Auth plugin's contribution point, so
  the key stays with the host (Vault transit on Datalayer);
- the shop verifies every request with `WebBotAuthMiddleware`: a signed
  request is `verified`, a replay `invalid`, an unsigned one or a stranger's
  `unverified`;
- the agent rotates its key, both keys published while in-flight requests
  finish.

Developer documentation: `docs/docs/protocols/web-bot-auth.mdx`.
