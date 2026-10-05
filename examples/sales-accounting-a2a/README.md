# Sales and Accounting over A2A

Two applications from agentspecs' team `sales-and-accounting`. Sales runs in the
browser and asks Accounting over A2A with `@a2a-js/sdk`. Accounting runs on a
runtime, is served with fasta2a, and reads Odoo without changing it. The browser
side is the `AgentA2ATeamExample` of the examples app. The documentation is
`docs/docs/loop/teams-over-a2a.mdx`.

- `serve_accounting.py --url http://127.0.0.1:8765` serves Accounting on a
  runtime that is already running. The examples' local server is one, and from
  this machine it needs no key.
- `loop apps run agentspecs/agentspecs/apps/accounting.yaml --cloud --a2a --keep`
  launches a cloud runtime, or uses a running one with `-r <uid>`. It serves
  Accounting there and prints its A2A address.
- `make_temp_key.py --runtime <uid> --url <A2A address>` mints a key for that
  runtime's Accounting route. It is read only on Odoo and lives a few hours,
  and is written to `.env.local`, never printed. `--revoke <grant uid>` ends
  it early.
