# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A public application's own company connection, on the visitors' runtime.

A visitor without an account only reads (`visitors.visitor_refusal`), and acts
in nobody's name: the visitors' runtime holds no principal for the
applications it serves. One kind of application is let further: a public
deployment whose platform keeps a shared demo account at one company — the
Shopper's public demo buying test orders at Datalayer's Demo Shop. For it,
ai-agents answers this runtime — and nobody else, with this runtime's own key
(``DATALAYER_RUNTIME_VISITORS_API_KEY``, taken out of the environment the
first time) — the deployment's principal token, narrowed to its grant, and
the company and the permissions it lets visitors use
(``POST /api/ai-agents/v1/apps/internal/visitors/deployments/{uid}/principal-token``).

With that token held, the gateway's toolsets of the run reach that company in
the deployment's owner's account (`as: owner`), and a visitor's turn may read,
propose and confirm there — those three tools of that company, with the rules
saying *do it* — and nothing else: any other company, any other tool, any
other deployment still only reads. The run is offered those three tools alone
(`principal.gateway_toolsets_of_the_run`): the company's other tools, its own
MCP tools among them (`pap_mcp_call`), are never shown to the model, so an
order goes through propose and confirm, the approval the gateway records. Each call is still held by the gateway to
the deployment's grant, and its confirmations to what the owner lets the
gateway approve as the agent.
"""

from __future__ import annotations

import os
import threading
import time
from contextvars import ContextVar
from typing import Any, Dict, Mapping, Optional, Sequence

KEY_ENV = "DATALAYER_RUNTIME_VISITORS_API_KEY"

#: What a visitor's turn may do at the company it is let into, and nothing more.
VISITOR_COMPANY_TOOLS = frozenset({"pap_read", "pap_propose", "pap_confirm"})

#: How long ai-agents' refusal for a deployment is believed before it is asked again.
REFUSED_SECONDS = 600.0

_LOCK = threading.Lock()
_KEY: Dict[str, str] = {}
#: The companies each deployment lets its visitors use, by domain: their permissions.
_COMPANIES: Dict[str, Dict[str, tuple[str, ...]]] = {}
#: When ai-agents last refused a deployment.
_REFUSED: Dict[str, float] = {}
#: The companies the run under way lets its visitor use (set as its toolsets are made).
_RUN_COMPANIES: ContextVar[Optional[Mapping[str, tuple[str, ...]]]] = ContextVar(
    "visitors_pap_companies", default=None
)


def take_key() -> str:
    """This runtime's key to ai-agents, taken out of the environment the first time; ``""`` for none."""
    from agent_runtimes.guardrails.credentials import hold

    with _LOCK:
        if "key" not in _KEY:
            _KEY["key"] = (os.environ.pop(KEY_ENV, "") or "").strip()
        key = _KEY["key"]
    if key:
        hold(key)
    return key


def forget() -> None:
    """Forget the key and every answer (tests)."""
    with _LOCK:
        _KEY.clear()
        _COMPANIES.clear()
        _REFUSED.clear()


def companies_of(deployment_uid: str) -> Mapping[str, tuple[str, ...]]:
    """The companies a deployment lets its visitors use, as ai-agents said them; ``{}`` for none."""
    return dict(_COMPANIES.get(deployment_uid) or {})


def _ai_agents_url() -> str:
    from datalayer_core.utils.urls import DatalayerURLs

    return str(
        getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    ).rstrip("/")


async def _ask(deployment_uid: str, key: str) -> dict[str, Any]:
    import httpx

    from agent_runtimes.apps.principal import PrincipalTokenMissing

    url = _ai_agents_url()
    if not url:
        raise PrincipalTokenMissing("No ai-agents is configured.")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            answered = await client.post(
                f"{url}/api/ai-agents/v1/apps/internal/visitors/deployments/{deployment_uid}/principal-token",
                headers={"X-API-Key": key},
            )
    except httpx.HTTPError as error:
        raise PrincipalTokenMissing(f"ai-agents could not be asked: {error}.") from None
    if answered.status_code >= 300:
        _REFUSED[deployment_uid] = time.time()
        raise PrincipalTokenMissing(f"ai-agents answered {answered.status_code}.")
    body = answered.json() if answered.content else {}
    companies = body.get("companies") if isinstance(body, dict) else None
    _COMPANIES[deployment_uid] = {
        str(domain): tuple(str(scope) for scope in scopes or ())
        for domain, scopes in (companies or {}).items()
        if isinstance(domain, str) and domain
    }
    return body


async def ensure(deployment_uid: str) -> bool:
    """Whether the deployment's principal token is held for its visitors, asked for when it is not
    or runs out. ``False`` — and nothing beyond reading — for a deployment ai-agents does not let
    further, on another runtime, or with no key."""
    from agent_runtimes.apps.principal import (
        PrincipalTokenMissing,
        _ensure_held,
        principal_token_refusal,
    )
    from agent_runtimes.apps.visitors import visitors_runtime

    if not deployment_uid or not visitors_runtime():
        return False
    key = take_key()
    if not key:
        return False
    refused_at = _REFUSED.get(deployment_uid)
    if refused_at is not None and time.time() - refused_at < REFUSED_SECONDS:
        return False
    try:
        await _ensure_held(
            deployment_uid,
            key,
            lambda bearer: _ask(deployment_uid, bearer),
            lambda: principal_token_refusal(deployment_uid),
            f"the visitors of deployment {deployment_uid}",
        )
    except PrincipalTokenMissing:
        return False
    return principal_token_refusal(deployment_uid) is None and bool(
        _COMPANIES.get(deployment_uid)
    )


def enter_run(deployment_uid: str) -> None:
    """The run under way serves this deployment's visitor: its companies are the ones let in."""
    _RUN_COMPANIES.set(companies_of(deployment_uid))


def exempts(tool: str, classes: Sequence[str], behaviour: str) -> bool:
    """Whether a visitor's turn may make this call although it does more than read: a read, a
    proposal or a confirmation at a company the run's deployment lets its visitors use, its rules
    saying *do it*."""
    from agent_runtimes.apps.pap_connections import domain_of, pap_tool
    from agent_runtimes.apps.rules import DO_IT

    if behaviour != DO_IT:
        return False
    companies = _RUN_COMPANIES.get()
    if not companies:
        return False
    found = pap_tool(tool)
    if found is None:
        return False
    sid, name = found
    if name not in VISITOR_COMPANY_TOOLS:
        return False
    if not set(classes) <= {"read", "write", "buy"}:
        return False
    return domain_of(sid) in companies
