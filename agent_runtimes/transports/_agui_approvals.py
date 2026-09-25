# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AG-UI deferred tool-approval stream wrapping.

This mirrors the Vercel AI transport's deferred-tool approval handling for the
AG-UI protocol.  When a tool requiring approval is deferred (the agent runs
with ``output_type=[str, DeferredToolRequests]``), pydantic-ai never executes
the tool inline, so ``ToolsGuardrailCapability.before_tool_execute`` never
fires.  This wrapper intercepts the AG-UI ``TOOL_CALL_START`` / ``TOOL_CALL_ARGS``
/ ``TOOL_CALL_END`` SSE events, reconstructs the tool call, and creates matching
approval records in the local in-memory store (with best-effort remote
ai-agents sync) so every approval surface — the web UI, the SaaS panel, and the
LOOP TUI — can display them and enable the Approve / Deny controls.

The record-creation logic (dedupe, remote sync, mirror, credential + mapping
registration) is intentionally kept byte-for-byte equivalent to the Vercel AI
transport so both protocols reach parity, including server-mode relay.
"""

from __future__ import annotations

import json as json_mod
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, AsyncIterator

try:  # pragma: no cover - httpx is always present in runtime
    import httpx
except Exception:  # pragma: no cover
    httpx = None

logger = logging.getLogger(__name__)


def build_approval_names(approval_tool_ids: list[str]) -> set[str]:
    """Build tool-name variants for matching deferred approval tools.

    Includes both versioned IDs (e.g. ``runtime-sensitive-echo:0.0.1``) and
    base names without the version suffix (e.g. ``runtime_sensitive_echo``) so
    pydantic-ai's ``TOOL_CALL_START`` events (which carry the registered
    function name without a version suffix) are not skipped, with underscore /
    hyphen normalisation.
    """
    approval_names: set[str] = set()
    for tid in approval_tool_ids:
        base_name = tid.split(":", 1)[0]
        for name in (tid, base_name):
            approval_names.add(name)
            approval_names.add(name.replace("-", "_"))
            approval_names.add(name.replace("_", "-"))
    return approval_names


async def wrap_agui_stream_with_approvals(
    body_iterator: AsyncIterator[bytes | str],
    approval_tool_ids: list[str],
    agent_id: str,
    user_jwt_token: str | None = None,
    runtime_name: str | None = None,
) -> AsyncIterator[bytes]:
    """Wrap an AG-UI streaming body to create local approval records.

    Parses AG-UI ``TOOL_CALL_*`` events and, for each deferred tool that
    requires approval, creates a pending approval record (mirroring the remote
    ai-agents backend when a JWT is available).  All non-matching chunks pass
    through unchanged.
    """
    from ..routes.tool_approvals import (
        _APPROVALS,
        _APPROVALS_LOCK,
        ToolApprovalCreateRequest,
        _approval_envelope_matches,
        _create_approval,
        mirror_approval_to_local,
        register_approval_credentials,
        register_remote_approval_mapping,
    )

    approval_names = build_approval_names(approval_tool_ids)
    created_tool_call_ids: set[str] = set()
    remote_created_tool_call_ids: set[str] = set()
    remote_approval_ids_by_tool_call_id: dict[str, str] = {}
    # Per-tool-call accumulation of streamed argument fragments.
    pending_names: dict[str, str] = {}
    pending_args: dict[str, str] = {}

    async def create_remote_approval_if_possible(
        *,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_call_id: str,
    ) -> str | None:
        if not user_jwt_token or not tool_call_id or httpx is None:
            return None
        if tool_call_id in remote_created_tool_call_ids:
            return remote_approval_ids_by_tool_call_id.get(tool_call_id)
        try:
            from datalayer_core.utils.urls import DatalayerURLs

            urls = DatalayerURLs.from_environment()
            ai_agents_url = urls.ai_agents_url.rstrip("/")
            async with httpx.AsyncClient(
                base_url=ai_agents_url,
                headers={"Authorization": f"Bearer {user_jwt_token}"},
                timeout=10.0,
            ) as client:
                resp = await client.post(
                    "/api/ai-agents/v1/tool-approvals",
                    json={
                        "agent_id": agent_id,
                        "runtime_name": runtime_name or "",
                        "tool_name": tool_name,
                        "tool_args": tool_args,
                        "tool_call_id": tool_call_id,
                    },
                )
                resp.raise_for_status()
                payload = resp.json() if resp.content else None

            remote_approval_id: str | None = None
            if isinstance(payload, dict):
                candidate = (
                    payload.get("id")
                    or payload.get("uid")
                    or (payload.get("data") or {}).get("id")
                    or (payload.get("data") or {}).get("uid")
                )
                if isinstance(candidate, str) and candidate:
                    remote_approval_id = candidate

            remote_created_tool_call_ids.add(tool_call_id)
            if remote_approval_id:
                remote_approval_ids_by_tool_call_id[tool_call_id] = remote_approval_id
            logger.info(
                "[AG-UI] Created remote ai-agents approval for tool_call_id=%s "
                "tool='%s' remote_id=%s",
                tool_call_id,
                tool_name,
                remote_approval_id,
            )
            return remote_approval_id
        except Exception as remote_err:
            logger.debug(
                "[AG-UI] Could not create remote ai-agents approval for "
                "tool_call_id=%s: %s",
                tool_call_id,
                remote_err,
            )
            return None

    async def maybe_create_approval(tool_call_id: str) -> None:
        """Create an approval record for a completed deferred tool call."""
        tool_name = pending_names.get(tool_call_id, "")
        raw_args = pending_args.get(tool_call_id, "")
        if not tool_name:
            return
        # Only intercept tools that require approval.
        variants = {
            tool_name,
            tool_name.replace("-", "_"),
            tool_name.replace("_", "-"),
        }
        if not variants & approval_names:
            return
        if tool_call_id and tool_call_id in created_tool_call_ids:
            return

        parsed_args: Any = {}
        if raw_args:
            try:
                parsed_args = json_mod.loads(raw_args)
            except Exception:
                parsed_args = {}
        normalized_tool_args = parsed_args if isinstance(parsed_args, dict) else {}

        # Root-cause guard: skip creating a duplicate pending record when this
        # tool/args envelope was already approved very recently.
        recent_window_seconds = 120.0
        now = datetime.now(timezone.utc)
        recently_approved = None
        async with _APPROVALS_LOCK:
            for candidate in _APPROVALS.values():
                if candidate.status != "approved":
                    continue
                if not _approval_envelope_matches(
                    candidate,
                    agent_id=agent_id,
                    tool_name=tool_name,
                    tool_args=normalized_tool_args,
                ):
                    continue
                age: float | None = None
                try:
                    ts = datetime.fromisoformat(
                        candidate.updated_at.replace("Z", "+00:00")
                    )
                    age = (now - ts).total_seconds()
                except Exception:
                    age = None
                if age is not None and 0 <= age <= recent_window_seconds:
                    recently_approved = candidate
                    break
        if recently_approved is not None:
            if tool_call_id:
                created_tool_call_ids.add(tool_call_id)
            logger.info(
                "[AG-UI] Skipping deferred pending approval for '%s' "
                "(tool_call_id=%s): already approved recently (approval_id=%s)",
                tool_name,
                tool_call_id,
                recently_approved.id,
            )
            return

        # Reuse an existing local record for the same tool call id so
        # continuation requests do not create duplicates.
        existing_record = None
        if tool_call_id:
            async with _APPROVALS_LOCK:
                for candidate in _APPROVALS.values():
                    if (
                        candidate.agent_id == agent_id
                        and candidate.tool_call_id == tool_call_id
                        and candidate.status != "deleted"
                    ):
                        existing_record = candidate
                        break
        if existing_record is not None:
            created_tool_call_ids.add(tool_call_id)
            logger.info(
                "[AG-UI] Reusing existing local approval %s for deferred tool "
                "'%s' (tool_call_id=%s, status=%s)",
                existing_record.id,
                tool_name,
                tool_call_id,
                existing_record.status,
            )
            return

        # Best-effort remote sync so server-mode panels backed by ai-agents can
        # display pending approvals.
        remote_approval_id: str | None = None
        if tool_call_id:
            remote_approval_id = await create_remote_approval_if_possible(
                tool_name=tool_name,
                tool_args=normalized_tool_args,
                tool_call_id=tool_call_id,
            )

        approval_id = remote_approval_id or ""
        used_mirror = isinstance(approval_id, str) and bool(approval_id)
        if used_mirror:
            record = await mirror_approval_to_local(
                {
                    "id": approval_id,
                    "agent_id": agent_id,
                    "tool_name": tool_name,
                    "tool_args": normalized_tool_args,
                    "tool_call_id": tool_call_id or None,
                    "status": "pending",
                }
            )
        else:
            req = ToolApprovalCreateRequest(
                agent_id=agent_id,
                tool_name=tool_name,
                tool_args=normalized_tool_args,
                tool_call_id=tool_call_id or None,
            )
            record = await _create_approval(req)

        if user_jwt_token:
            register_approval_credentials(record.id, user_jwt_token)
        effective_remote_id = record.id if used_mirror else remote_approval_id
        if effective_remote_id and user_jwt_token:
            register_remote_approval_mapping(
                record.id,
                effective_remote_id,
                user_jwt_token,
            )
        if tool_call_id:
            created_tool_call_ids.add(tool_call_id)
        logger.info(
            "[AG-UI] Created local approval record %s for deferred tool '%s'",
            record.id,
            tool_name,
        )

    def _decode(chunk: bytes | str) -> str:
        if isinstance(chunk, bytes):
            try:
                return chunk.decode("utf-8")
            except Exception:
                return ""
        return chunk

    try:
        async for chunk in body_iterator:
            out = chunk if isinstance(chunk, bytes) else str(chunk).encode("utf-8")
            text = _decode(chunk)
            if "TOOL_CALL" in text:
                try:
                    for line in text.strip().split("\n"):
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            continue
                        try:
                            event = json_mod.loads(data_str)
                        except Exception:
                            event = None
                        if not isinstance(event, dict):
                            continue
                        event_type = event.get("type")
                        tool_call_id = (
                            event.get("toolCallId")
                            or event.get("tool_call_id")
                            or event.get("id")
                            or ""
                        )
                        if not tool_call_id:
                            continue
                        if event_type == "TOOL_CALL_START":
                            tool_name = (
                                event.get("toolCallName")
                                or event.get("tool_call_name")
                                or event.get("toolName")
                                or ""
                            )
                            pending_names[tool_call_id] = tool_name
                            pending_args.setdefault(tool_call_id, "")
                        elif event_type == "TOOL_CALL_ARGS":
                            delta = event.get("delta")
                            if isinstance(delta, str):
                                pending_args[tool_call_id] = (
                                    pending_args.get(tool_call_id, "") + delta
                                )
                        elif event_type == "TOOL_CALL_END":
                            await maybe_create_approval(tool_call_id)
                            pending_names.pop(tool_call_id, None)
                            pending_args.pop(tool_call_id, None)
                except Exception as parse_err:
                    logger.debug(
                        "[AG-UI] Error parsing SSE for approval: %s", parse_err
                    )
            yield out
    except Exception as e:
        logger.error("[AG-UI] STREAMING ERROR: %s", e)
        logger.error("[AG-UI] STREAMING ERROR traceback:\n%s", traceback.format_exc())
        raise
