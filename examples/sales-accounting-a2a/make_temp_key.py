# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Mint a temporary key for the Sales and Accounting example, narrowed to what it needs.

The browser's Sales application asks Accounting over A2A. Accounting runs on a
runtime, where its route answers the machine itself and a key granted to that
route (`agent_runtimes.loop.apps.a2a`). This script mints that key with IAM's
task grants (O1-06, O1-17), and it reaches exactly this:

- **the route**: the grant's task is ``a2a:<runtime uid>:<application>:<nonce>``,
  and the runtime's gate answers only a key whose task begins with its own
  uid and the application's id: that one runtime's ``/api/v1/a2a/agents/accounting/``;
- **Odoo, read only**: one ``datalayer_connection`` detail, the Datalayer MCP
  gateway in the owner's name, ``read``, ``only: ["odoo_accounting_*"]``, and
  the scope ``data:read``. A scene's other members are served the same way,
  with ``--app <id>`` and one ``--only`` per pattern their servers' tools take.
  **A pattern matches a tool's own name, which is not its server's name with a
  prefix**: Earthdata's three tools are ``search_earth_datasets``,
  ``search_earth_datagranules`` and ``download_earth_data_granules``, so the
  read pair is ``search_earth_*`` and ``earthdata_*`` matches nothing — a
  member keyed from that pattern is refused every tool at the gateway
  (2026-10-09, A-14's drill). Tavily's happen to be named for it
  (``tavily_search``, ``tavily_extract``, …), so ``tavily_*`` is right. Read
  the names in the catalogue's server (``agentspecs/mcp-servers/<server>.yaml``)
  rather than guessing from the server's name. The gateway lets it call the ``odoo_accounting_*``
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
    python examples/sales-accounting-a2a/make_temp_key.py --runtime <uid> \
        --app crop-monitoring --only "search_earth_*"
    python examples/sales-accounting-a2a/make_temp_key.py --revoke <grant uid>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence

import httpx

#: The application whose route the key is granted to, unless ``--app`` says another:
#: a scene's other members are served the same way (``month-end-close``,
#: ``crop-monitoring``, ``disaster-assessment``, ``change-detection``).
APP_ID = "accounting"

#: What the key reaches at the Datalayer MCP gateway, unless ``--only`` says:
#: the tools of the member's own servers, and nothing else.
ONLY = ("odoo_accounting_*",)

#: The scope the Odoo tools that read need at the gateway (`tool_policy`).
SCOPES = "data:read"


def _details(only: Sequence[str]) -> list[dict[str, Any]]:
    """What the key reaches through the gateway: those tools, read, in the owner's name."""
    return [
        {
            "type": "datalayer_connection",
            "server": "datalayer",
            "actions": ["read"],
            "as": "owner",
            "only": list(only),
        }
    ]


def _variables(app_id: str) -> tuple[str, str]:
    """The variables the key and the address are written as, after the application's id."""
    name = re.sub(r"[^A-Z0-9]+", "_", app_id.upper()).strip("_")
    return f"VITE_A2A_{name}_KEY", f"VITE_A2A_{name}_URL"


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
    key_variable, url_variable = _variables(args.app)
    task_uid = f"a2a:{args.runtime}:{args.app}:{secrets.token_hex(6)}"
    until = datetime.now(timezone.utc) + timedelta(hours=args.hours)
    grant = {
        "task_uid": task_uid,
        "user_uid": owner,
        "scopes": SCOPES,
        "authorization_details": _details(args.only or ONLY),
        **({"org_uid": args.org_uid} if args.org_uid else {}),
    }
    print("This asks IAM for a task grant, and a token from it:")
    print(json.dumps(grant, indent=2))
    print(
        f"The token lives until {until.isoformat(timespec='minutes')} ({args.hours} h)."
    )
    print(f"It is written to {args.out} as {key_variable}; it is not printed.")
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
    values = {key_variable: token["access_token"]}
    if args.url:
        values[url_variable] = args.url
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
        "--app",
        default=APP_ID,
        help=f"The application whose A2A route the key is granted to ({APP_ID} when unsaid).",
    )
    parser.add_argument(
        "--only",
        action="append",
        metavar="PATTERN",
        help=(
            "A tool pattern the key reaches at the gateway, repeatable "
            f"({' '.join(ONLY)} when unsaid)."
        ),
    )
    parser.add_argument(
        "--url",
        help="The application's A2A address, written as VITE_A2A_<APP>_URL beside the key.",
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
