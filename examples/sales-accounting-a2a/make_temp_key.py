# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Mint a temporary key for the Sales and Accounting example, narrowed to what it needs.

The browser's Sales application asks Accounting over A2A. Accounting runs on a
runtime, where its route answers the machine itself and a key granted to that
route (`agent_runtimes.loop.apps.a2a`). This script mints that key with IAM's
task grants (O1-06, O1-17), and it reaches exactly this:

- **the route**: the grant's task is ``a2a:<runtime uid>:accounting:<nonce>``,
  and the runtime's gate answers only a key whose task begins with its own
  uid and the application's id: that one runtime's ``/api/v1/a2a/agents/accounting/``;
- **Odoo, read only**: one ``datalayer_connection`` detail, the Datalayer MCP
  gateway in the owner's name, ``read``, ``only: ["odoo_accounting_*"]``, and
  the scope ``data:read``. The gateway lets it call the ``odoo_accounting_*``
  tools whose classes are all ``read``, and nothing else. The run on the
  runtime uses this key for the gateway, never the runtime's own;
- **for a few hours**: the token lives until ``--hours`` from now, four by
  default and at most 24 (the grant's own life). Revoking the grant ends it
  sooner: the gateway asks IAM whether the grant still stands (it fails closed);

and nothing else: it is the owner's identity narrowed by these details, so it
reaches no notebook, no Space, no other server and no other runtime's route.
The browser model of Sales is not reached with it: Sales asks its model with
the signed-in person's token, or a visitor's trial token.

Minting a grant is a platform service's act: the script authenticates with a
platform service key (``DATALAYER_IAM_API_KEY``, ``DATALAYER_OPERATOR_API_KEY``
or ``DATALAYER_RUNTIMES_API_KEY``), and finds the owner from their own key
(``DATALAYER_API_KEY``, asked of IAM's ``whoami``). It shows what it will ask
for and waits for a yes. The key is written to a file (``.env.local`` of
agent-runtimes by default, which git ignores, made readable by its owner
only) and never printed.

    python examples/sales-accounting-a2a/make_temp_key.py --runtime <runtime uid>
    python examples/sales-accounting-a2a/make_temp_key.py --revoke <grant uid>
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

#: The application whose route the key is granted to.
APP_ID = "accounting"

#: What the key reaches through the Datalayer MCP gateway.
AUTHORIZATION_DETAILS = [
    {
        "type": "datalayer_connection",
        "server": "datalayer",
        "actions": ["read"],
        "as": "owner",
        "only": ["odoo_accounting_*"],
    }
]

#: The scope the Odoo tools that read need at the gateway (`tool_policy`).
SCOPES = "data:read"

#: The variables the example reads.
KEY_VARIABLE = "VITE_A2A_ACCOUNTING_KEY"
URL_VARIABLE = "VITE_A2A_ACCOUNTING_URL"

DEFAULT_OUT = Path(__file__).resolve().parents[2] / ".env.local"
SERVICE_KEYS = (
    "DATALAYER_IAM_API_KEY",
    "DATALAYER_OPERATOR_API_KEY",
    "DATALAYER_RUNTIMES_API_KEY",
)


def _service_key() -> str:
    for name in SERVICE_KEYS:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    sys.exit(
        f"A platform service key is needed to mint a grant: set one of {', '.join(SERVICE_KEYS)}."
    )


def _iam(args: argparse.Namespace) -> str:
    return args.iam_url.rstrip("/") + "/api/iam/v1"


def _owner_uid(args: argparse.Namespace) -> str:
    if args.user_uid:
        return args.user_uid
    key = (os.environ.get("DATALAYER_API_KEY") or "").strip()
    if not key:
        sys.exit("Say whose key it is: --user-uid, or DATALAYER_API_KEY to ask IAM.")
    response = httpx.get(
        f"{_iam(args)}/whoami", headers={"Authorization": f"Bearer {key}"}, timeout=30
    )
    response.raise_for_status()
    said = response.json()
    profile = said.get("profile") or said.get("user") or said
    uid = str(profile.get("uid") or profile.get("id") or "")
    if not uid:
        sys.exit("IAM's whoami named no uid: pass --user-uid.")
    return uid


def _write(out: Path, values: dict[str, str]) -> None:
    lines = []
    if out.exists():
        lines = [
            line
            for line in out.read_text().splitlines()
            if line.split("=", 1)[0] not in values
        ]
    lines += [f"{name}={value}" for name, value in values.items()]
    old = os.umask(0o077)
    try:
        out.write_text("\n".join(lines) + "\n")
    finally:
        os.umask(old)
    out.chmod(0o600)


def mint(args: argparse.Namespace) -> None:
    if not 0 < args.hours <= 24:
        sys.exit("--hours is more than 0 and at most 24: the grant itself lives a day.")
    owner = _owner_uid(args)
    task_uid = f"a2a:{args.runtime}:{APP_ID}:{secrets.token_hex(6)}"
    until = datetime.now(timezone.utc) + timedelta(hours=args.hours)
    grant = {
        "task_uid": task_uid,
        "user_uid": owner,
        "scopes": SCOPES,
        "authorization_details": AUTHORIZATION_DETAILS,
        **({"org_uid": args.org_uid} if args.org_uid else {}),
    }
    print("This asks IAM for a task grant, and a token from it:")
    print(json.dumps(grant, indent=2))
    print(
        f"The token lives until {until.isoformat(timespec='minutes')} ({args.hours} h)."
    )
    print(f"It is written to {args.out} as {KEY_VARIABLE}; it is not printed.")
    if not args.yes and input("Mint it? [y/N] ").strip().lower() != "y":
        sys.exit("Nothing was minted.")
    headers = {"X-API-Key": _service_key()}
    response = httpx.post(
        f"{_iam(args)}/oauth/task-grants", json=grant, headers=headers, timeout=30
    )
    if response.status_code >= 300:
        sys.exit(
            f"IAM did not grant it ({response.status_code}): {response.text[:300]}"
        )
    granted = response.json()["grant"]
    response = httpx.post(
        f"{_iam(args)}/oauth/task-grants/{granted['uid']}/token",
        json={"run": True, "until": until.isoformat()},
        headers=headers,
        timeout=30,
    )
    if response.status_code >= 300:
        sys.exit(
            f"IAM did not exchange the grant ({response.status_code}): {response.text[:300]}"
        )
    token = response.json()
    values = {KEY_VARIABLE: token["access_token"]}
    if args.url:
        values[URL_VARIABLE] = args.url
    _write(Path(args.out), values)
    print(
        f"Granted: {granted['uid']} (scopes: {' '.join(granted.get('scopes') or []) or 'none'})."
    )
    print(f"The key is in {args.out}, for {token.get('expires_in', 0) // 60} minutes.")
    print(f"Revoke it: python {Path(__file__).name} --revoke {granted['uid']}")


def revoke(args: argparse.Namespace) -> None:
    response = httpx.post(
        f"{_iam(args)}/oauth/task-grants/{args.revoke}/revoke",
        json={"reason": "the example's temporary key was revoked"},
        headers={"X-API-Key": _service_key()},
        timeout=30,
    )
    if response.status_code >= 300:
        sys.exit(
            f"IAM did not revoke it ({response.status_code}): {response.text[:300]}"
        )
    print(f"Revoked {args.revoke}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--runtime", help="The uid of the runtime Accounting is served on."
    )
    parser.add_argument(
        "--hours", type=float, default=4.0, help="How long the key lives (at most 24)."
    )
    parser.add_argument(
        "--user-uid",
        help="The owner's uid; asked of IAM with DATALAYER_API_KEY when unsaid.",
    )
    parser.add_argument("--org-uid", help="The organization the grant is for, if any.")
    parser.add_argument(
        "--url",
        help=f"Accounting's A2A address, written as {URL_VARIABLE} beside the key.",
    )
    parser.add_argument(
        "--out", default=str(DEFAULT_OUT), help="The env file the key is written to."
    )
    parser.add_argument(
        "--iam-url",
        default=os.environ.get("DATALAYER_IAM_URL") or "https://prod1.datalayer.run",
        help="IAM's host.",
    )
    parser.add_argument("--yes", action="store_true", help="Mint without asking.")
    parser.add_argument(
        "--revoke", metavar="GRANT_UID", help="Revoke a grant this script minted."
    )
    args = parser.parse_args()
    if args.revoke:
        revoke(args)
        return
    if not args.runtime:
        parser.error("--runtime is needed: the key is granted to one runtime's route.")
    mint(args)


if __name__ == "__main__":
    main()
