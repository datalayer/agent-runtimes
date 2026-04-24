# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local tool approval endpoints served by agent-runtimes.

These endpoints support the sync approval flow without requiring an external
ai-agents approval backend. A legacy route prefix is also exposed for
compatibility with existing callers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket
from pydantic import BaseModel, Field

from agent_runtimes.streams.loop import (
    publish_stream_event,
    stream_loop,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tool-approvals", tags=["tool-approvals"])
legacy_router = APIRouter(
    prefix="/api/ai-agents/v1/tool-approvals",
    tags=["tool-approvals"],
)
ws_router = APIRouter(
    prefix="/api/ai-agents/v1",
    tags=["tool-approvals"],
)


async def _decide_approval_via_ws(
    approval_id: str,
    approved: bool,
    note: str | None = None,
) -> ToolApprovalRecord:
    resolved_approval_id = _resolve_local_approval_id(approval_id)
    return await _update_approval(
        resolved_approval_id,
        status="approved" if approved else "rejected",
        note=note,
    )


async def _delete_approval_via_ws(approval_id: str) -> ToolApprovalRecord:
    resolved_approval_id = _resolve_local_approval_id(approval_id)
    return await _delete_approval(resolved_approval_id)


class ToolApprovalCreateRequest(BaseModel):
    """Payload to create a pending tool approval request."""

    agent_id: str = Field(default="default")
    pod_name: str = Field(default="")
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)
    tool_call_id: str | None = None


class ToolApprovalDecisionRequest(BaseModel):
    """Payload to approve or reject a pending request."""

    note: str | None = None


class ToolApprovalRecord(BaseModel):
    """Stored approval record."""

    id: str
    agent_id: str
    pod_name: str = ""
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)
    tool_call_id: str | None = None
    status: str = "pending"
    note: str | None = None
    created_at: str
    updated_at: str


_APPROVALS: dict[str, ToolApprovalRecord] = {}
_APPROVALS_LOCK = asyncio.Lock()

# ─── Remote approval ID registry ─────────────────────────────────────────────
# Maps local approval_id → (remote_approval_id, user_jwt_token) so that a
# decision received via the runtime-local WS can be relayed to the
# datalayer-ai-agents backend's WS and become visible in the main UI.

_REMOTE_APPROVAL_REGISTRY: dict[str, tuple[str, str]] = {}

# Per-approval JWT credentials used to (a) lazily forward the approval to
# ai-agents at decision time if the initial forward failed or was skipped
# and (b) relay the decision so observers on the datalayer-ai-agents WS
# (SaaS UI, other participants) always see the outcome, regardless of
# which surface made the decision.
_APPROVAL_CREDENTIALS: dict[str, str] = {}


def _resolve_local_approval_id(approval_id: str) -> str:
    """Resolve a decision/delete id to the local approval id.

    The frontend may send either the local runtime approval id or the
    ai-agents remote id (when approval state is sourced from ai-agents WS).
    """
    if approval_id in _APPROVALS:
        return approval_id
    for local_id, entry in _REMOTE_APPROVAL_REGISTRY.items():
        remote_id = entry[0]
        if remote_id == approval_id:
            return local_id
    return approval_id


def _looks_like_uuid(value: str) -> bool:
    """Best-effort check for local runtime approval ids.

    Runtime-local records created by this module use UUID4 strings, while
    ai-agents records are typically ULID-like ids. This helps choose between
    lazy-forwarding and direct relay when no explicit remote mapping exists.
    """
    if not isinstance(value, str) or not value:
        return False
    try:
        UUID(value)
        return True
    except Exception:
        return False


def register_remote_approval_mapping(
    local_id: str,
    remote_id: str,
    user_jwt_token: str,
) -> None:
    """Associate a local approval record with its counterpart on ai-agents."""
    _REMOTE_APPROVAL_REGISTRY[local_id] = (remote_id, user_jwt_token)
    # Populate the reverse map used by the persistent ai-agents listener so
    # that decisions from other participants are mirrored locally.
    from agent_runtimes.routes.tool_approvals_listener import (
        register_remote_to_local,
    )

    register_remote_to_local(remote_id, local_id)


def remove_remote_approval_mapping(local_id: str) -> None:
    """Remove the remote mapping for a local approval (cleanup after decision)."""
    entry = _REMOTE_APPROVAL_REGISTRY.pop(local_id, None)
    if entry is not None:
        remote_id, _ = entry
        from agent_runtimes.routes.tool_approvals_listener import (
            unregister_remote_to_local,
        )

        unregister_remote_to_local(remote_id)


def register_approval_credentials(local_id: str, user_jwt_token: str) -> None:
    """Remember the JWT used to create an approval so we can always relay
    the eventual decision to ai-agents (and lazily forward the approval if
    the initial POST failed).

    Also starts a persistent ai-agents listener for this JWT so decisions
    from any participant (e.g. the SaaS UI) are mirrored locally.
    """
    if not user_jwt_token:
        return
    _APPROVAL_CREDENTIALS[local_id] = user_jwt_token
    # Start the persistent listener (no-op if one is already running for
    # this JWT). Fire-and-forget: we don't want to block creation.
    try:
        from agent_runtimes.routes.tool_approvals_listener import (
            ensure_listener,
        )

        asyncio.create_task(ensure_listener(user_jwt_token))
    except RuntimeError:
        # No running loop (unlikely in FastAPI context) — skip.
        logger.debug("[tool-approval] No running loop; skipping listener start")


def remove_approval_credentials(local_id: str) -> None:
    jwt = _APPROVAL_CREDENTIALS.pop(local_id, None)
    if jwt:
        try:
            from agent_runtimes.routes.tool_approvals_listener import (
                release_listener,
            )

            asyncio.create_task(release_listener(jwt))
        except RuntimeError:
            pass


async def _relay_decision_to_ai_agents_ws(
    remote_id: str,
    approved: bool,
    note: str | None,
    user_jwt_token: str,
) -> None:
    """Send the ``tool_approval_decision`` to the datalayer-ai-agents backend
    so the SaaS UI (ToolApprovals view) can observe the decision.

    Strategy:
      1. Open a short-lived WS connection and send ``tool_approval_decision``
         (matches the message shape that the SaaS UI itself uses).
      2. Wait briefly for the ``tool_approval_approved|rejected`` echo so the
         server has time to update its store before we close the socket.
    """
    import json as _json

    try:
        from datalayer_core.utils.urls import DatalayerURLs
        from websockets.asyncio.client import connect as ws_connect
    except Exception as exc:
        logger.warning(
            "[tool-approval:relay] websockets/datalayer_core not available; "
            "cannot relay decision for remote_id=%s: %s",
            remote_id,
            exc,
        )
        return

    try:
        urls = DatalayerURLs.from_environment()
        ai_agents_url = getattr(urls, "ai_agents_url", None)
        if not ai_agents_url:
            logger.warning(
                "[tool-approval:relay] ai_agents_url not configured; "
                "cannot relay decision for remote_id=%s",
                remote_id,
            )
            return

        ws_base = str(ai_agents_url).rstrip("/")
        # Strip any API prefix the env may have included so we land at /ws.
        for suffix in ("/api/ai-agents/v1", "/api/ai-agents"):
            if ws_base.endswith(suffix):
                ws_base = ws_base[: -len(suffix)]
                break
        stripped = ws_base.replace("https://", "").replace("http://", "")
        scheme = "wss" if ai_agents_url.startswith("https") else "ws"
        # The ai-agents WS server authenticates via the ``?token=`` query
        # parameter (the browser WebSocket API cannot set an Authorization
        # header), so we pass the JWT both as a query param AND as a header
        # to match what the SaaS UI does and maximise compatibility.
        from urllib.parse import urlencode as _urlencode

        query = _urlencode({"token": user_jwt_token}) if user_jwt_token else ""
        sep = "?" if query else ""
        ws_url = f"{scheme}://{stripped}/api/ai-agents/v1/ws{sep}{query}"

        msg = _json.dumps(
            {
                "type": "tool_approval_decision",
                "approvalId": remote_id,
                "approved": approved,
                **({"note": note} if note else {}),
            }
        )
        expected_event = (
            "tool_approval_approved" if approved else "tool_approval_rejected"
        )

        logger.info(
            "[tool-approval:relay] Connecting to ai-agents WS %s to relay "
            "%s decision for remote_id=%s",
            ws_url.split("?", 1)[0],
            "approve" if approved else "reject",
            remote_id,
        )

        async with ws_connect(
            ws_url,
            additional_headers={"Authorization": f"Bearer {user_jwt_token}"},
            close_timeout=5.0,
            open_timeout=5.0,
        ) as ws:
            await ws.send(msg)
            logger.info(
                "[tool-approval:relay] Sent decision message to ai-agents WS "
                "(remote_id=%s, approved=%s)",
                remote_id,
                approved,
            )

            # Wait briefly for the server echo so the decision is definitely
            # processed before we close the socket. Any other messages
            # (unrelated broadcasts) are ignored.
            import asyncio as _asyncio

            deadline = 3.0
            try:
                while True:
                    raw = await _asyncio.wait_for(ws.recv(), timeout=deadline)
                    parsed: dict[str, Any] | None = None
                    try:
                        maybe_parsed = _json.loads(raw)
                        if isinstance(maybe_parsed, dict):
                            parsed = maybe_parsed
                    except _json.JSONDecodeError:
                        parsed = None
                    if parsed is None:
                        continue
                    event = parsed.get("event")
                    data = parsed.get("data")
                    rid = data.get("id") if isinstance(data, dict) else None
                    if event == expected_event and rid == remote_id:
                        logger.info(
                            "[tool-approval:relay] Got server echo %s for remote_id=%s",
                            event,
                            remote_id,
                        )
                        return
            except _asyncio.TimeoutError:
                logger.warning(
                    "[tool-approval:relay] No %s echo for remote_id=%s within "
                    "%ss — decision was sent, server may still process it",
                    expected_event,
                    remote_id,
                    deadline,
                )
    except Exception as exc:
        logger.warning(
            "[tool-approval:relay] Failed to relay decision for remote_id=%s: %s",
            remote_id,
            exc,
            exc_info=True,
        )


# ─── Inline approval event registry (asyncio.Event-based) ────────────────────

_PENDING_APPROVAL_EVENTS: dict[str, tuple[asyncio.Event, dict[str, Any]]] = {}


def register_pending_approval_event(
    approval_id: str,
) -> tuple[asyncio.Event, dict[str, Any]]:
    """Register an asyncio.Event for inline approval blocking.

    Returns (event, result_dict).  The caller should ``await event.wait()`` and
    then read ``result_dict["approved"]`` (bool) and optionally ``result_dict["note"]``
    after the event is set.
    """
    event = asyncio.Event()
    result: dict[str, Any] = {}
    _PENDING_APPROVAL_EVENTS[approval_id] = (event, result)
    return event, result


def signal_approval_event(
    approval_id: str, approved: bool, note: str | None = None
) -> bool:
    """Signal the asyncio.Event for *approval_id*, returning True if found."""
    entry = _PENDING_APPROVAL_EVENTS.get(approval_id)
    if not entry:
        return False
    event, result = entry
    result["approved"] = approved
    result["note"] = note
    event.set()
    return True


def remove_pending_approval_event(approval_id: str) -> None:
    """Remove the asyncio.Event entry for *approval_id* (cleanup after wait)."""
    _PENDING_APPROVAL_EVENTS.pop(approval_id, None)


async def _publish_approval_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    agent_id: str | None,
) -> None:
    """Publish a tool-approval event through the generic stream."""
    await publish_stream_event(
        event_type=event_type,
        payload=payload,
        agent_id=agent_id,
        list_approvals=_list_approvals,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def mirror_approval_to_local(data: dict) -> ToolApprovalRecord:
    """Mirror an approval record from an external backend (e.g. ai-agents)
    into the local in-memory store so the frontend can discover it.
    """
    now = _now_iso()
    record = ToolApprovalRecord(
        id=data.get("id", str(uuid4())),
        agent_id=data.get("agent_id", ""),
        pod_name=data.get("pod_name", ""),
        tool_name=data.get("tool_name", ""),
        tool_args=data.get("tool_args", {}),
        tool_call_id=data.get("tool_call_id"),
        status=data.get("status", "pending"),
        created_at=data.get("created_at", now),
        updated_at=data.get("updated_at", now),
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
    await _publish_approval_event(
        event_type="tool_approval_created",
        payload=record.model_dump(),
        agent_id=record.agent_id or None,
    )
    return record


async def get_local_approval_status(approval_id: str) -> str | None:
    """Check the status of an approval in the local in-memory store.
    Returns the status string or None if not found.
    """
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
    return record.status if record else None


async def update_local_approval_status(
    approval_id: str, status: str, note: str | None = None
) -> None:
    """Update the status of a local approval record and unblock any waiter.

    Called by the remote-bridge after it mirrors a decision from the
    datalayer-ai-agents backend.  Must signal the asyncio.Event so that
    ``ToolApprovalManager.request_and_wait`` is unblocked.
    """
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record and record.status == "pending":
            updated = record.model_copy(
                update={"status": status, "note": note, "updated_at": _now_iso()}
            )
            _APPROVALS[approval_id] = updated
        else:
            updated = None
    if updated is not None:
        # Unblock any in-process coroutine waiting on this approval.
        signal_approval_event(approval_id, status == "approved", note)
        await _publish_approval_event(
            event_type=(
                "tool_approval_approved"
                if status == "approved"
                else "tool_approval_rejected"
            ),
            payload=updated.model_dump(),
            agent_id=updated.agent_id or None,
        )
        # Release registrations — the decision has already been made on
        # the ai-agents side, so no relay is needed from here.
        remove_remote_approval_mapping(approval_id)
        remove_approval_credentials(approval_id)


async def forward_approval_to_ai_agents(
    record: "ToolApprovalRecord",
    user_jwt_token: str | None,
) -> str | None:
    """Best-effort forward a pending approval to the datalayer-ai-agents backend.

    Called from ``ToolApprovalManager.request_and_wait`` so that approvals
    created via the inline ``ToolsGuardrailCapability`` path are visible in
    remote UI panels (e.g. the ToolApprovals view in datalayer/ui) that poll
    the ai-agents service rather than the local agent-runtimes endpoints.
    """
    if not user_jwt_token:
        return None
    try:
        import httpx
        from datalayer_core.utils.urls import DatalayerURLs

        urls = DatalayerURLs.from_environment()
        ai_agents_url = getattr(urls, "ai_agents_url", None)
        if not ai_agents_url:
            return None
        ai_agents_url = ai_agents_url.rstrip("/")
        remote_approval_id: str | None = None
        async with httpx.AsyncClient(
            timeout=10.0,
            headers={"Authorization": f"Bearer {user_jwt_token}"},
        ) as client:
            resp = await client.post(
                f"{ai_agents_url}/api/ai-agents/v1/tool-approvals",
                json={
                    "agent_id": record.agent_id,
                    "pod_name": record.pod_name or "",
                    "tool_name": record.tool_name,
                    "tool_args": record.tool_args or {},
                    "tool_call_id": record.tool_call_id,
                },
            )
            resp.raise_for_status()
            try:
                payload = resp.json()
            except Exception:
                payload = None

            if isinstance(payload, dict):
                # ai-agents may return either top-level id/uid or nested data object.
                candidate = (
                    payload.get("id")
                    or payload.get("uid")
                    or (payload.get("data") or {}).get("id")
                    or (payload.get("data") or {}).get("uid")
                )
                if isinstance(candidate, str) and candidate:
                    remote_approval_id = candidate
        logger.info(
            "[tool-approval:forward] Synced approval %s (tool=%s) to ai-agents backend"
            " (remote_id=%s)",
            record.id,
            record.tool_name,
            remote_approval_id,
        )
        return remote_approval_id
    except Exception as exc:
        logger.debug(
            "[tool-approval:forward] Could not sync approval %s to ai-agents: %s",
            getattr(record, "id", "?"),
            exc,
        )
        return None


async def _create_approval(body: ToolApprovalCreateRequest) -> ToolApprovalRecord:
    if body.tool_call_id:
        async with _APPROVALS_LOCK:
            for record in _APPROVALS.values():
                if (
                    record.agent_id == body.agent_id
                    and record.tool_call_id == body.tool_call_id
                    and record.status != "deleted"
                ):
                    # Return any non-deleted record so that continuation turns
                    # don't create a brand-new pending approval for a tool call
                    # that was already approved/rejected on an earlier turn.
                    return record

    now = _now_iso()
    record = ToolApprovalRecord(
        id=str(uuid4()),
        agent_id=body.agent_id,
        pod_name=body.pod_name,
        tool_name=body.tool_name,
        tool_args=body.tool_args or {},
        tool_call_id=body.tool_call_id,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
    await _publish_approval_event(
        event_type="tool_approval_created",
        payload=record.model_dump(),
        agent_id=record.agent_id or None,
    )
    return record


async def _list_approvals(
    agent_id: str | None = None,
    status: str | None = None,
) -> list[ToolApprovalRecord]:
    async with _APPROVALS_LOCK:
        values = list(_APPROVALS.values())

    if agent_id is not None:
        values = [item for item in values if item.agent_id == agent_id]
    if status is not None:
        values = [item for item in values if item.status == status]
    return values


async def _get_approval(approval_id: str) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Tool approval not found")
    return record


async def _update_approval(
    approval_id: str,
    status: str,
    note: str | None,
) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Tool approval not found")

        if record.status != "pending":
            return record

        updated = record.model_copy(
            update={
                "status": status,
                "note": note,
                "updated_at": _now_iso(),
            }
        )
        _APPROVALS[approval_id] = updated

    # Signal any in-process coroutine waiting on this approval (e.g.
    # ToolsGuardrailCapability.before_tool_execute using asyncio.Event).
    signal_approval_event(approval_id, status == "approved", note)

    await _publish_approval_event(
        event_type=(
            "tool_approval_approved"
            if status == "approved"
            else "tool_approval_rejected"
        ),
        payload=updated.model_dump(),
        agent_id=updated.agent_id or None,
    )

    # Relay the decision to the global ai-agents backend via WS so every
    # observer (SaaS UI, other participants) sees the outcome — regardless
    # of which surface submitted the decision.
    # We read the registries without removing entries here; the helpers
    # below decrement the persistent-listener refcount correctly.
    entry = _REMOTE_APPROVAL_REGISTRY.get(approval_id)
    jwt_token = _APPROVAL_CREDENTIALS.get(approval_id)
    # Release registrations (also decrements listener refcount).
    remove_remote_approval_mapping(approval_id)
    remove_approval_credentials(approval_id)
    import asyncio as _asyncio

    if entry is not None:
        remote_id, registered_jwt = entry
        effective_jwt = jwt_token or registered_jwt
        logger.info(
            "[tool-approval] Scheduling relay of %s decision to ai-agents "
            "(local_id=%s, remote_id=%s)",
            status,
            approval_id,
            remote_id,
        )
        _asyncio.create_task(
            _relay_decision_to_ai_agents_ws(
                remote_id=remote_id,
                approved=status == "approved",
                note=note,
                user_jwt_token=effective_jwt,
            )
        )
    elif jwt_token:
        # No explicit mapping. If this id is non-UUID, it is likely already
        # an ai-agents id (e.g. mirrored from tool-approval-request / ULID).
        # Relay directly to avoid creating a second remote approval record.
        if not _looks_like_uuid(approval_id):
            logger.info(
                "[tool-approval] No remote mapping for local_id=%s — "
                "relaying directly using approval_id as remote_id (%s)",
                approval_id,
                status,
            )
            _asyncio.create_task(
                _relay_decision_to_ai_agents_ws(
                    remote_id=approval_id,
                    approved=status == "approved",
                    note=note,
                    user_jwt_token=jwt_token,
                )
            )
        else:
            # UUID local id with no remote mapping: create remote record first,
            # then relay the decision.
            logger.info(
                "[tool-approval] No remote mapping for local_id=%s — lazily "
                "forwarding to ai-agents before relaying %s decision",
                approval_id,
                status,
            )
            _asyncio.create_task(
                _lazy_forward_and_relay(
                    record=updated,
                    approved=status == "approved",
                    note=note,
                    user_jwt_token=jwt_token,
                )
            )
    else:
        logger.warning(
            "[tool-approval] No JWT credentials for local_id=%s — cannot "
            "relay %s decision to ai-agents. Other participants will not "
            "see this outcome.",
            approval_id,
            status,
        )

    return updated


async def _lazy_forward_and_relay(
    record: ToolApprovalRecord,
    approved: bool,
    note: str | None,
    user_jwt_token: str,
) -> None:
    """Create the approval on ai-agents (if it doesn't exist yet) then relay
    the decision.

    Used when the initial forward at creation time was skipped or failed,
    ensuring observers always see the outcome.
    """
    try:
        remote_id = await forward_approval_to_ai_agents(record, user_jwt_token)
    except Exception as exc:
        logger.warning(
            "[tool-approval:lazy-relay] forward failed for local_id=%s: %s",
            record.id,
            exc,
            exc_info=True,
        )
        return
    if not remote_id:
        logger.warning(
            "[tool-approval:lazy-relay] forward returned no remote_id for "
            "local_id=%s — cannot relay decision",
            record.id,
        )
        return
    await _relay_decision_to_ai_agents_ws(
        remote_id=remote_id,
        approved=approved,
        note=note,
        user_jwt_token=user_jwt_token,
    )


async def _delete_approval(approval_id: str) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Tool approval not found")

        updated = record.model_copy(
            update={
                "status": "deleted",
                "updated_at": _now_iso(),
            }
        )
        _APPROVALS[approval_id] = updated

    await _publish_approval_event(
        event_type="tool_approval_deleted",
        payload=updated.model_dump(),
        agent_id=updated.agent_id or None,
    )
    # Release listener refcount + reverse map for deleted approvals.
    remove_remote_approval_mapping(approval_id)
    remove_approval_credentials(approval_id)
    return updated


# Public REST endpoints are intentionally removed. Tool-approval state is
# propagated and consumed over websocket streams only.


# ─── WebSocket endpoints ─────────────────────────────────────────────


@router.websocket("/ws")
async def tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )


@legacy_router.websocket("/ws")
async def legacy_tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )


@ws_router.websocket("/ws")
async def ai_agents_stream_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )
