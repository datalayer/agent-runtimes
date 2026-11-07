# Browser Session

This example joins the personal agent's own browser to a PAP Session (§6),
against Manzanita Outfitters with its website on, from
`personal_agent_protocol.demo` (real keys, real HTTP over ASGI, no network).

1. The agent's browser loads Manzanita's `web.browser_session_endpoint` with a
   GET. The page is a form with a one-time `code`; a `SameSite=Strict`,
   `HttpOnly`, `Secure` cookie ties the code to that browser, and the page is
   never cached or framed.
1. The host reads the code from that page alone (never from a message or
   another page) and POSTs it to `{endpoint}/authorize` with the Session header,
   and the access token when signed in, answered `204`.
1. The browser submits the code alone. Manzanita checks the cookie against the
   code, that the code is unused, unexpired and authorized for a Session, then
   answers `303` with its own cookie for that Session.

Then it shows two refusals: the same code submitted again is refused; and a code
the agent's browser loaded, submitted from another browser without its cookie, is
refused (and used up), so a code an attacker obtained can't sign someone else's
browser into the attacker's Session.

Join codes, Session JWTs, and the company's cookies never enter model context: the
tool returns statuses and booleans.

```bash
loop apps run examples/personal-agent-protocol/browser-session/app.py
```

Read the [Browser Session flow](https://personalagentprotocol.org/examples/browser-session/).
