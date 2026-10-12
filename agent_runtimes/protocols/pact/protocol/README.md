# PACT, as reviewed

AGENT_PROTOCOLS PR-10: the specification this package is built against, and
when it was read.

| | |
| --- | --- |
| Specification | `github.com/openpactprotocol/openpactprotocol`, `docs/spec.md` |
| Version | PACT 1.0 (profiles *Identity*: §2, §3, §4, §6; *Delegated*: §5) |
| Commit | `838c6bd` (2026-10-06) |
| Reviewed | 2026-10-12 |
| Built on | A2A 1.0 HTTP+JSON; OAuth 2.0 device code (RFC 8628); RFC 8414 metadata |
| Reference code | `packages/protocol` and `packages/client` (TypeScript, private, not on npm): read, not imported |

What changed against the announcement (2026-10-06, Decagon): the scopes a
Brand offers are its card's `userDelegation` `oauth2SecurityScheme`
`deviceCode.scopes`, not A2A card extensions.

Read again when the repository tags a release, or `docs/spec.md` changes its
§7 version.
