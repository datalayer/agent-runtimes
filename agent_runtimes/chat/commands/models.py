# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /models - List models and switch the one in use."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.loop.commands import CommandArgSpec

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "models"
ALIASES: list[str] = ["model"]
DESCRIPTION = "List available models and switch the one in use"
SHORTCUT = "escape d"
GROUP = "Agents"


def _catalog_ids() -> list[str]:
    """Model ids for completion, from the catalog rather than the network."""
    try:
        from agent_runtimes.specs.models import AI_MODEL_CATALOGUE

        return sorted(AI_MODEL_CATALOGUE)
    except Exception:  # noqa: BLE001
        return []


ARGS = (
    CommandArgSpec(
        name="model-id",
        description="Model to switch to, e.g. ollama:llama3.1:8b",
        choices=_catalog_ids,
    ),
)


async def _fetch_catalog(tux: "CliTux") -> Optional[dict[str, Any]]:
    """The agent's models with readiness and reachability, from this session's runtime.

    The runtime answers — local or on Datalayer, through the session's one
    address — with the agent's ``model`` and ``model_additionals``, each
    saying whether its inference serves it, and who decided (``source``,
    ``note``).
    """
    agent_id = getattr(tux, "agent_id", "") or ""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{tux.server_url}/api/v1/configure/models",
                params={"agent_id": agent_id} if agent_id else None,
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to fetch models: {error}[/red]")
        return None


def _active_model(tux: "CliTux") -> str:
    """The model in use, as far as this session knows."""
    session = getattr(tux, "loop_session", None)
    return str(getattr(session, "model", "") or getattr(tux, "model", "") or "")


async def _show(tux: "CliTux") -> None:
    """Print the catalog: local first, because that is the interesting half."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    payload = await _fetch_catalog(tux)
    if payload is None:
        return

    models = payload.get("models") or []
    active = _active_model(tux)

    local = [m for m in models if m.get("local")]
    hosted = [m for m in models if not m.get("local")]

    where = getattr(tux, "where", None)
    tux.console.print()
    tux.console.print(
        f"● Models on {where} ({len(models)})"
        if where
        else f"● Models ({len(models)})",
        style=STYLE_PRIMARY,
    )
    if payload.get("note"):
        tux.console.print(f"  {payload['note']}", style=STYLE_MUTED)

    if local:
        tux.console.print()
        tux.console.print(
            "  Local to the runtime" if where else "  Local", style=STYLE_ACCENT
        )
        for model in local:
            marker = "[green]●[/green]" if model.get("reachable") else "○"
            selected = " [green](active)[/green]" if model["id"] == active else ""
            tux.console.print(
                f"    {marker} {model['id']}{selected}", style=STYLE_MUTED
            )
            detail = model.get("reason") or "ready"
            tux.console.print(f"        {model['name']} — {detail}", style=STYLE_MUTED)
            if model.get("warning"):
                tux.console.print(f"        {model['warning']}", style=STYLE_WARNING)

    runtimes = payload.get("local_runtimes") or {}
    down = [spec["label"] for spec in runtimes.values() if not spec.get("reachable")]
    if down:
        tux.console.print(
            f"    Not running: {', '.join(sorted(down))}", style=STYLE_MUTED
        )

    uncatalogued = payload.get("uncatalogued_local") or []
    if uncatalogued:
        tux.console.print()
        tux.console.print("  Installed locally, not in the catalog", style=STYLE_ACCENT)
        for entry in uncatalogued:
            tux.console.print(
                f"    ○ {entry['provider']}:{entry['name']} — add a spec to offer it",
                style=STYLE_MUTED,
            )

    if hosted:
        tux.console.print()
        tux.console.print("  Cloud", style=STYLE_ACCENT)
        for model in hosted:
            marker = "[green]●[/green]" if model.get("available") else "○"
            selected = " [green](active)[/green]" if model["id"] == active else ""
            tux.console.print(
                f"    {marker} {model['id']}{selected}", style=STYLE_MUTED
            )
            missing = model.get("missing_env_vars") or []
            if missing:
                tux.console.print(
                    f"        missing {', '.join(missing)}", style=STYLE_WARNING
                )
            elif not model.get("available") and model.get("reason"):
                tux.console.print(f"        {model['reason']}", style=STYLE_WARNING)

    judgments = payload["judgment_models"]
    if judgments:
        # Listed apart: a decision asks them, no agent runs on them.
        tux.console.print()
        tux.console.print("  Judgments", style=STYLE_ACCENT)
        tux.console.print(f"    {payload['judgments_note']}", style=STYLE_MUTED)
        for model in judgments:
            marker = "[green]●[/green]" if model["available"] else "○"
            tux.console.print(f"    {marker} {model['id']}", style=STYLE_MUTED)
            tux.console.print(f"        {model['name']}", style=STYLE_MUTED)
            if not model["available"]:
                tux.console.print(f"        {model['reason']}", style=STYLE_WARNING)

    tux.console.print()
    tux.console.print("  /models <id> to switch", style=STYLE_MUTED)
    tux.console.print()


def _refusal(
    catalog: Optional[dict[str, Any]], model_id: str, where: str
) -> Optional[str]:
    """Why the runtime cannot switch to a model, in a sentence, or None."""
    if catalog is None:
        return f"{where} did not list its models: nothing was switched."
    judgment = next(
        (m for m in catalog["judgment_models"] if m["id"] == model_id), None
    )
    if judgment is not None:
        # The runtime's own sentence: a typed-judgment model answers a
        # decision's questions, not a conversation.
        return str(judgment["refusal"])
    entry = next(
        (m for m in catalog.get("models") or [] if m.get("id") == model_id), None
    )
    if entry is None:
        return f"{where} does not offer {model_id} to this agent: nothing was switched."
    if entry.get("local") and not entry.get("reachable"):
        return f"{model_id} is not running on {where}: nothing was switched."
    if not entry.get("local") and entry.get("available") is False:
        missing = ", ".join(entry.get("missing_env_vars") or [])
        why = f"has no {missing} for it" if missing else (entry.get("reason") or "")
        return f"{model_id} cannot be used on {where} ({why}): nothing was switched."
    return None


def _detail(response: httpx.Response) -> str:
    """The runtime's reason for a refusal: its ``detail``, else its text."""
    try:
        detail = response.json().get("detail")
    except Exception:  # noqa: BLE001
        detail = None
    return str(detail or response.text[:200])


async def _switch(tux: "CliTux", model_id: str) -> None:
    """Switch the session to another model.

    Reuses ``configure-from-spec`` — the same route the pod companion calls —
    rather than inventing a second way to reconfigure a running agent. The spec
    is the source of truth, so switching a model is an edited spec, applied.
    """
    from agent_runtimes.models.local import (
        LOCAL_SANDBOX_VARIANT,
        capability_warning,
        model_supports,
    )
    from agent_runtimes.specs.models import get_model

    from ..tux import STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    where = getattr(tux, "where", None)
    # The runtime's answer decides — on Datalayer as locally, not this
    # machine's catalogue: a model it does not offer this agent, or cannot
    # use, is refused before the agent is touched.
    problem = _refusal(await _fetch_catalog(tux), model_id, where or "this runtime")
    if problem:
        tux.console.print(f"[red]{problem}[/red]")
        return

    model = get_model(model_id)
    if model is None:
        tux.console.print(f"[red]Unknown model: {model_id}[/red]", style=STYLE_MUTED)
        tux.console.print("  /models to see what is available.", style=STYLE_MUTED)
        return

    agent_id = getattr(tux, "agent_id", "") or ""
    try:
        async with httpx.AsyncClient() as client:
            spec_response = await client.get(
                f"{tux.server_url}/api/v1/configure/agents/{agent_id}/spec",
                timeout=10.0,
            )
            spec_response.raise_for_status()
            spec = dict(spec_response.json())
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to read the agent spec: {error}[/red]")
        return

    # The agent is recreated from its library spec, with this model: the
    # library spec keeps its model_additionals, so the models offered stay
    # the same after the switch.
    agent_spec_id = spec.get("agent_spec_id")
    if not agent_spec_id:
        tux.console.print(
            f"[red]{agent_id} was not created from an agentspec: "
            "nothing was switched.[/red]"
        )
        return

    spec["model"] = model_id
    notes: list[str] = []

    # A local model with a cloud sandbox would keep the tokens home while
    # sending the code away, which is the opposite of what was asked for.
    if (
        model.local
        and not where
        and spec.get("sandbox_variant") != LOCAL_SANDBOX_VARIANT
    ):
        spec["sandbox_variant"] = LOCAL_SANDBOX_VARIANT
        notes.append(f"sandbox moved to {LOCAL_SANDBOX_VARIANT} (local model)")

    # Codemode is the most tool-dependent path; a model that does not claim
    # reliable tool calling does not get it.
    if not model_supports(model, "codemode"):
        if spec.get("codemode"):
            notes.append("codemode disabled for this model")
        spec["codemode"] = False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/agents/configure-from-spec",
                json={
                    "agent_spec_id": agent_spec_id,
                    "agent_spec": spec,
                    "agent_id": agent_id,
                },
                timeout=60.0,
            )
            if response.status_code >= 400:
                tux.console.print(
                    f"[red]{where or 'This runtime'} did not switch to {model_id} "
                    f"({response.status_code}): {_detail(response)}[/red]"
                )
                return
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to switch model: {error}[/red]")
        return

    session = getattr(tux, "loop_session", None)
    if session is not None:
        session.model = model_id

    tux.console.print()
    tux.console.print(f"● Model: {model.name}", style=STYLE_PRIMARY)
    tux.console.print(f"  {model_id}", style=STYLE_MUTED)
    for note in notes:
        tux.console.print(f"  {note}", style=STYLE_MUTED)
    warning = capability_warning(model)
    if warning:
        tux.console.print(f"  {warning}", style=STYLE_WARNING)
    tux.console.print()


async def _set_fallbacks(tux: "CliTux", ids: str) -> None:
    """Set the chain to fall back through when the active model fails.

    Order matters and is kept as typed: a fallback list is a preference, and
    sorting it would quietly change what the user asked for.
    """
    from agent_runtimes.specs.models import get_model

    from ..tux import STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    wanted = [part.strip() for part in ids.split(",") if part.strip()]
    known: list[str] = []
    unknown: list[str] = []
    for model_id in wanted:
        (known if get_model(model_id) else unknown).append(model_id)

    if unknown:
        tux.console.print(
            f"  Unknown: {', '.join(unknown)} — /models to see the catalogue.",
            style=STYLE_WARNING,
        )
    if not known:
        return

    session = getattr(tux, "loop_session", None)
    if session is not None:
        session.extras["model_fallbacks"] = known

    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{tux.server_url}/api/v1/configure/inference/provider",
                json={"fallback_models": known},
                timeout=30.0,
            )
            applied = response.status_code < 400
    except Exception:  # noqa: BLE001
        applied = False

    tux.console.print()
    tux.console.print(f"● Fallback chain: {' → '.join(known)}", style=STYLE_PRIMARY)
    if not applied:
        # Honest about scope: the session knows, the server may not yet.
        tux.console.print(
            "  Kept for this session; the server did not accept it.",
            style=STYLE_MUTED,
        )
    tux.console.print()


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List models, switch to one, or set the fallback chain."""
    target = (argv or "").strip()

    if target.startswith("--fallback"):
        await _set_fallbacks(tux, target[len("--fallback") :].strip())
    elif target:
        await _switch(tux, target)
    else:
        await _show(tux)
    return None
