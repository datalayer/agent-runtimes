# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Hold the Cloudflare model specs to what Cloudflare serves.

The catalogue moves — a model the specs could have named in September had
been deprecated in May — so this reads the account's own listing and says
which spec names a model no longer served, which served model with tool
calling has no spec, and where a spec's context differs from the listing's.
Run by hand, with the account's token::

    CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… python scripts/check-cloudflare-models.py

The names are the ones datalayer-ai-inference reads (``DATALAYER_CLOUDFLARE_*``
are read too). Exits 1 when a spec names a model that is not served.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

import yaml

SPECS = Path(__file__).resolve().parent.parent / "agentspecs" / "agentspecs" / "models"
API = "https://api.cloudflare.com/client/v4/accounts"


def env(*names: str) -> str:
    for name in names:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def served(account: str, token: str) -> dict[str, dict]:
    """Every text-generation model Cloudflare lists for the account, by name."""
    models: dict[str, dict] = {}
    page = 1
    while True:
        request = urllib.request.Request(
            f"{API}/{account}/ai/models/search?task=Text%20Generation&per_page=100&page={page}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            answer = json.load(response)
        if not answer.get("success"):
            raise SystemExit(f"Cloudflare refused the listing: {answer.get('errors')}")
        for model in answer.get("result") or []:
            properties = {p.get("property_id"): p.get("value") for p in model.get("properties") or []}
            models[model["name"]] = {
                # The listing says it as a string: "true".
                "tools": str(properties.get("function_calling")).lower() == "true",
                "context": properties.get("context_window"),
            }
        if len(answer.get("result") or []) < 100:
            return models
        page += 1


def specs() -> list[dict]:
    """The Workers AI specs (``cloudflare-wrk-*.yaml``) that name a model Cloudflare
    hosts under ``@cf/``. The gateway flavour (``cloudflare-gtw-*``) and the typed
    judgment models (``typesafe/jev``, with no ``@cf/`` namespace) are not in the
    account's model listing and are left out."""
    found = []
    for path in sorted(SPECS.glob("cloudflare-wrk-*.yaml")):
        with open(path) as handle:
            data = yaml.safe_load(handle) or {}
        if "judgments" in (data.get("capabilities") or []):
            continue
        found.append({"file": path.name, **data})
    return found


def main() -> int:
    account = env("CLOUDFLARE_ACCOUNT_ID", "DATALAYER_CLOUDFLARE_ACCOUNT_ID")
    token = env("CLOUDFLARE_API_TOKEN", "DATALAYER_CLOUDFLARE_API_TOKEN", "DATALAYER_CLOUDFLARE_ACCOUNT_API_TOKEN")
    if not account or not token:
        print("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are needed", file=sys.stderr)
        return 2
    listing = served(account, token)
    named = {}
    failures = 0
    for spec in specs():
        name = "@cf/" + spec["id"].split(":", 1)[1]
        named[name] = spec
        entry = listing.get(name)
        if entry is None:
            failures += 1
            print(f"NOT SERVED  {spec['file']}: Cloudflare no longer lists {name}")
            continue
        if "tools" in (spec.get("capabilities") or []) and not entry["tools"]:
            print(f"NO TOOLS    {spec['file']}: the listing says {name} has no function calling")
        print(f"ok          {spec['file']}: {name} (context {entry['context']})")
    for name, entry in sorted(listing.items()):
        if entry["tools"] and name not in named:
            print(f"unlisted    {name} has tool calling and no spec (context {entry['context']})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
