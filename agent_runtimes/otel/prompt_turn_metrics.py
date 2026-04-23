# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Prompt-turn completion metrics emission for agent-runtimes.

Emits OTEL metrics to the Datalayer OTEL service on every completed prompt turn.
The exporter is configured lazily and reads:

- per-request user JWT token from transport route Authorization headers
- ``DATALAYER_OTEL_SERVICE_NAME`` for service.name resource attribute
- ``DATALAYER_OTLP_METRICS_URL`` / ``OTEL_EXPORTER_OTLP_METRICS_ENDPOINT``
    (explicit metrics endpoint override)
- ``DATALAYER_OTLP_URL`` / ``OTEL_EXPORTER_OTLP_ENDPOINT`` / ``DATALAYER_OTEL_RUN_URL``
    (base OTLP endpoint)
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

_emitter_lock = threading.Lock()
_emitters: dict[str, "PromptTurnMetricsEmitter"] = {}
_emitter_init_attempted_keys: set[str] = set()


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def extract_bearer_token(auth_header: str | None) -> str | None:
    """Extract a bearer token from an Authorization header value."""
    if not auth_header or not isinstance(auth_header, str):
        return None
    value = auth_header.strip()
    if not value:
        return None
    if value.lower().startswith("bearer "):
        token = value[7:].strip()
        return token or None
    return None


def _looks_like_jwt(token: str | None) -> bool:
    if not token:
        return False
    parts = token.split(".")
    return len(parts) == 3 and all(parts)


def extract_jwt_token(*header_values: str | None) -> str | None:
    """Extract JWT token from common auth header value forms.

    Supports:
    - ``Authorization: Bearer <jwt>``
    - ``Authorization: token <jwt>``
    - raw JWT values (e.g., X-External-Token)
    """
    for header_value in header_values:
        if not header_value or not isinstance(header_value, str):
            continue
        stripped = header_value.strip()
        if not stripped:
            continue

        bearer = extract_bearer_token(stripped)
        if bearer:
            return bearer

        lower = stripped.lower()
        if lower.startswith("token "):
            token = stripped[6:].strip()
            if _looks_like_jwt(token):
                return token

        if _looks_like_jwt(stripped):
            return stripped

    return None


def _decode_jwt_payload(token: str | None) -> dict[str, Any] | None:
    """Decode the JWT payload without signature verification."""
    if not isinstance(token, str) or not token:
        return None
    if not _looks_like_jwt(token):
        return None
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
        claims = json.loads(decoded.decode("utf-8"))
        return claims if isinstance(claims, dict) else None
    except Exception:  # noqa: BLE001
        return None


def decode_user_uid(token: str | None) -> str | None:
    """Extract the Datalayer ``user_uid`` from a JWT token.

    Follows the platform convention: ``payload.user.uid`` first,
    then ``payload.sub``.
    """
    claims = _decode_jwt_payload(token)
    if not claims:
        return None
    user_claim = claims.get("user")
    if isinstance(user_claim, dict) and user_claim.get("uid"):
        return str(user_claim["uid"])
    sub = claims.get("sub")
    if isinstance(sub, str) and sub.strip():
        return sub.strip()
    return None


def extract_user_id_from_jwt(user_jwt_token: str | None) -> str | None:
    """Best-effort JWT claim extraction without signature verification."""
    uid = decode_user_uid(user_jwt_token)
    if uid:
        return uid
    # Fallback to common identity claims.
    claims = _decode_jwt_payload(user_jwt_token)
    if not claims:
        return None
    for key in ("preferred_username", "email", "upn", "name"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def extract_identity_hints(
    identities: list[dict[str, Any]] | None,
) -> tuple[str | None, str | None, str | None]:
    """Return ``(user_id, provider, jwt_token)`` from identities payload."""
    if not isinstance(identities, list):
        return None, None, None
    for identity in identities:
        if not isinstance(identity, dict):
            continue
        provider = identity.get("provider") or identity.get("issuer") or None
        user_id = (
            identity.get("userId")
            or identity.get("id")
            or identity.get("sub")
            or identity.get("email")
            or identity.get("username")
            or None
        )
        token = extract_jwt_token(
            identity.get("accessToken"),
            identity.get("token"),
            identity.get("jwt"),
            identity.get("idToken"),
        )
        if user_id or provider or token:
            return (
                str(user_id) if user_id else None,
                str(provider) if provider else None,
                token,
            )
    return None, None, None


def _token_cache_key(user_jwt_token: str | None) -> str:
    """Build a stable cache key without storing raw JWT in map keys."""
    if not user_jwt_token:
        return "anon"
    return "jwt:" + hashlib.sha256(user_jwt_token.encode("utf-8")).hexdigest()


def _resolve_otlp_endpoint() -> str:
    explicit = os.environ.get("DATALAYER_OTLP_URL") or os.environ.get(
        "OTEL_EXPORTER_OTLP_ENDPOINT"
    )
    if explicit:
        return explicit.rstrip("/")
    # Prefer the active runtime run URL first (cluster/environment-specific).
    # DATALAYER_OTEL_RUN_URL may be baked into some container images.
    run_url = (
        os.environ.get("DATALAYER_RUN_URL")
        or os.environ.get("DATALAYER_OTEL_RUN_URL")
        or "https://prod1.datalayer.run"
    )
    return f"{run_url.rstrip('/')}/api/otel/v1/otlp"


def _resolve_run_url_source() -> tuple[str, str]:
    """Return (source, value) for the run URL used to build OTLP endpoint."""
    run_url = os.environ.get("DATALAYER_RUN_URL")
    if run_url:
        return "DATALAYER_RUN_URL", run_url
    run_url = os.environ.get("DATALAYER_OTEL_RUN_URL")
    if run_url:
        return "DATALAYER_OTEL_RUN_URL", run_url
    return "default", "https://prod1.datalayer.run"


def _resolve_otlp_metrics_endpoint() -> str | None:
    explicit_metrics = os.environ.get("DATALAYER_OTLP_METRICS_URL") or os.environ.get(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"
    )
    if explicit_metrics:
        return explicit_metrics.rstrip("/")
    return None


def _resolve_default_metrics_endpoint(otlp_base_endpoint: str) -> str:
    """Return the default OTLP metrics endpoint from a base OTLP URL.

    Mirrors the core OTEL smoke-test and OTEL generator conventions:
    <otlp-base>/v1/metrics
    """
    return f"{otlp_base_endpoint.rstrip('/')}/v1/metrics"


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


class PromptTurnMetricsEmitter:
    """Emits prompt-turn metrics through OTLP HTTP exporter."""

    def __init__(self, service_name: str, user_jwt_token: str | None = None) -> None:
        from datalayer_core.otel.emitter import OTelEmitter

        endpoint = _resolve_otlp_endpoint()
        metrics_endpoint = _resolve_otlp_metrics_endpoint()
        self.metrics_endpoint = metrics_endpoint or _resolve_default_metrics_endpoint(
            endpoint
        )
        self._log_request_response = _bool_env(
            "DATALAYER_OTEL_LOG_REQUEST_RESPONSE", default=True
        )

        user_uid = decode_user_uid(user_jwt_token) or os.environ.get(
            "DATALAYER_USER_UID"
        )
        if not user_uid:
            raise ValueError(
                "Prompt-turn OTEL emission requires datalayer.user_uid from JWT"
            )

        self._emitter = OTelEmitter(
            service_name=service_name, user_uid=user_uid, token=user_jwt_token
        )
        if not self._emitter.enabled:
            raise ValueError("Prompt-turn OTEL emitter failed to initialize")

        logger.info(
            "Prompt-turn OTEL resource attribute: datalayer.user_uid=%s", user_uid
        )

        logger.info(
            "Prompt-turn OTEL metrics configured: service=%s endpoint=%s auth_header=%s",
            service_name,
            self.metrics_endpoint,
            "present" if user_jwt_token else "missing",
        )
        logger.info(
            "Prompt-turn OTEL server=%s request_response_logging=%s",
            self.metrics_endpoint,
            self._log_request_response,
        )

    def record(
        self,
        *,
        prompt: str,
        response: str,
        duration_ms: float,
        protocol: str,
        stop_reason: str,
        success: bool,
        model: str | None,
        tool_call_count: int,
        input_tokens: int | None,
        output_tokens: int | None,
        total_tokens: int | None,
        user_id: str | None,
        user_provider: str | None,
        identities_count: int | None,
        agent_id: str | None = None,
    ) -> None:
        attrs: dict[str, Any] = {
            "protocol": protocol,
            "stop_reason": stop_reason,
            "success": str(success).lower(),
        }
        if agent_id:
            attrs["agent.id"] = agent_id
        if model:
            attrs["model"] = model
        if user_id:
            attrs["user.id"] = user_id
        if user_provider:
            attrs["identity.provider"] = user_provider
        if identities_count is not None:
            attrs["identity.count"] = int(max(0, identities_count))

        resolved_input_tokens = max(
            int(input_tokens)
            if isinstance(input_tokens, int)
            else _estimate_tokens(prompt),
            0,
        )
        resolved_output_tokens = max(
            int(output_tokens)
            if isinstance(output_tokens, int)
            else _estimate_tokens(response),
            0,
        )
        resolved_total_tokens = max(
            int(total_tokens)
            if isinstance(total_tokens, int)
            else resolved_input_tokens + resolved_output_tokens,
            0,
        )

        logger.info(
            "Prompt-turn OTEL payload: protocol=%s model=%s user.id=%s provider=%s identities=%s success=%s stop_reason=%s input_tokens=%s output_tokens=%s total_tokens=%s duration_ms=%.2f tool_calls=%s",
            protocol,
            model,
            attrs.get("user.id"),
            attrs.get("identity.provider"),
            attrs.get("identity.count"),
            success,
            stop_reason,
            resolved_input_tokens,
            resolved_output_tokens,
            resolved_total_tokens,
            max(duration_ms, 0.0),
            max(0, tool_call_count),
        )

        self._emitter.add_counter("agent_runtimes.prompt.turn.completions", 1, attrs)
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.prompt_tokens", resolved_input_tokens, attrs
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.completion_tokens",
            resolved_output_tokens,
            attrs,
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.total_tokens", resolved_total_tokens, attrs
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.user_message_tokens",
            resolved_input_tokens,
            attrs,
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.ai_message_tokens",
            resolved_output_tokens,
            attrs,
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.system_prompt_tokens", 0, attrs
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.tools_description_tokens", 0, attrs
        )
        self._emitter.add_counter(
            "agent_runtimes.prompt.turn.tools_usage_tokens",
            max(0, tool_call_count),
            attrs,
        )
        self._emitter.add_histogram(
            "agent_runtimes.prompt.turn.duration_ms", max(duration_ms, 0.0), attrs
        )

        # Emit graph-compatible spans so the turn graph UI can render even when
        # execution is not using pydantic-graph wrappers.
        self._emit_turn_graph_spans(
            duration_ms=max(duration_ms, 0.0),
            success=success,
            stop_reason=stop_reason,
            tool_call_count=max(0, tool_call_count),
            protocol=protocol,
            model=model,
            agent_id=agent_id,
        )

        if self._log_request_response:
            logger.info(
                "Prompt-turn OTEL request: server=%s metric=agent_runtimes.prompt.turn.* attrs=%s duration_ms=%.2f tool_calls=%s",
                self.metrics_endpoint,
                {
                    "protocol": attrs.get("protocol"),
                    "model": attrs.get("model"),
                    "user.id": attrs.get("user.id"),
                    "identity.provider": attrs.get("identity.provider"),
                    "identity.count": attrs.get("identity.count"),
                    "success": attrs.get("success"),
                    "stop_reason": attrs.get("stop_reason"),
                },
                max(duration_ms, 0.0),
                max(0, tool_call_count),
            )
            logger.info(
                "Prompt-turn OTEL response: server=%s accepted_via_core_emitter=%s",
                self.metrics_endpoint,
                True,
            )

    def _emit_turn_graph_spans(
        self,
        *,
        duration_ms: float,
        success: bool,
        stop_reason: str,
        tool_call_count: int,
        protocol: str,
        model: str | None,
        agent_id: str | None,
    ) -> None:
        """Emit graph-compatible spans for a completed prompt turn.

        Produces a beta-graph-style topology (steps, decision, broadcast,
        spread, join/reducer, end) so the frontend ``TurnGraphChart`` can
        render the rich pydantic-graph beta node vocabulary even when the
        underlying pydantic-ai turn was driven by the classic graph runner.

        Shape with tool calls (N = ``tool_call_count``, capped at 6)::

            turn_start (start)
              → turn_model (step)
                → turn_decision (decision: tools?)
                  → turn_broadcast (broadcast: fan-out)
                    → turn_tool_0..N-1 (spread, parallel)
                      → turn_join (join + reduce_list_append)
                        → turn_end (end)

        Shape without tool calls::

            turn_start → turn_model → turn_decision → turn_end
        """
        tracer = getattr(self._emitter, "_tracer", None)
        if tracer is None:
            return

        try:
            from opentelemetry import trace as otel_trace

            has_tools = tool_call_count > 0
            # Cap visible spread fan-out for readability.
            spread_count = min(max(tool_call_count, 0), 6)

            # Node-count budget for timeline: start + model + decision + end,
            # plus (broadcast + spread*N + join) when tools fired.
            linear_count = 4 + (2 + spread_count if has_tools else 0)
            min_total_ns = linear_count * 1_000_000
            total_ns = max(int(max(duration_ms, 0.0) * 1_000_000), min_total_ns)
            end_ns = time.time_ns()
            start_ns = end_ns - total_ns

            # Segment durations.
            marker_ns = 1_000_000  # 1ms floor for "marker" nodes.
            start_dur_ns = marker_ns
            decision_dur_ns = marker_ns
            broadcast_dur_ns = marker_ns if has_tools else 0
            join_dur_ns = marker_ns if has_tools else 0
            end_dur_ns = marker_ns

            fixed_ns = (
                start_dur_ns
                + decision_dur_ns
                + broadcast_dur_ns
                + join_dur_ns
                + end_dur_ns
            )
            work_ns = max(total_ns - fixed_ns, linear_count * 1_000_000)
            if has_tools:
                model_dur_ns = max(int(work_ns * 0.45), marker_ns)
                spread_each_ns = max(
                    int(work_ns * 0.55 / max(spread_count, 1)), marker_ns
                )
            else:
                model_dur_ns = work_ns
                spread_each_ns = 0

            root_attrs: dict[str, Any] = {
                "graph.name": "prompt-turn",
                "graph.api": "beta",
                "graph.node.count": linear_count,
                "graph.turn.protocol": protocol,
                "graph.turn.stop_reason": stop_reason,
                "graph.turn.success": str(success).lower(),
                "graph.turn.tool_calls": tool_call_count,
            }
            if agent_id:
                root_attrs["agent.id"] = agent_id
            if model:
                root_attrs["model"] = model

            root_span = tracer.start_span(
                "agent.graph.run",
                start_time=start_ns,
                attributes=root_attrs,
            )
            root_ctx = otel_trace.set_span_in_context(root_span)

            def _child(
                parent_ctx: Any,
                *,
                node_id: str,
                node_type: str,
                node_start: int,
                node_end: int,
                extra_attrs: dict[str, Any] | None = None,
            ) -> tuple[Any, Any]:
                attrs: dict[str, Any] = {
                    "graph.node.id": node_id,
                    "graph.node.type": node_type,
                    "graph.node.status": "completed" if success else "error",
                }
                if agent_id:
                    attrs["agent.id"] = agent_id
                if extra_attrs:
                    attrs.update(extra_attrs)
                span = tracer.start_span(
                    f"graph.node.{node_id}",
                    context=parent_ctx,
                    start_time=node_start,
                    attributes=attrs,
                )
                span.end(end_time=node_end)
                return span, otel_trace.set_span_in_context(span, parent_ctx)

            cursor = start_ns

            # 1. start
            s0, start_ctx = _child(
                root_ctx,
                node_id="turn_start",
                node_type="start",
                node_start=cursor,
                node_end=cursor + start_dur_ns,
            )
            cursor += start_dur_ns

            # 2. model (step)
            _m, model_ctx = _child(
                start_ctx,
                node_id="turn_model",
                node_type="step",
                node_start=cursor,
                node_end=cursor + model_dur_ns,
                extra_attrs={
                    "graph.node.tool_calls": tool_call_count,
                    "graph.turn.stop_reason": stop_reason,
                    **({"model": model} if model else {}),
                },
            )
            cursor += model_dur_ns

            # 3. decision: did the model request tool calls?
            _d, decision_ctx = _child(
                model_ctx,
                node_id="turn_decision",
                node_type="decision",
                node_start=cursor,
                node_end=cursor + decision_dur_ns,
                extra_attrs={
                    "graph.decision.branch": "tools" if has_tools else "answer",
                    "graph.decision.tool_calls": tool_call_count,
                },
            )
            cursor += decision_dur_ns

            last_ctx = decision_ctx

            if has_tools:
                # 4. broadcast: fan-out the tool call bundle to N parallel spreads.
                _b, broadcast_ctx = _child(
                    decision_ctx,
                    node_id="turn_broadcast",
                    node_type="broadcast",
                    node_start=cursor,
                    node_end=cursor + broadcast_dur_ns,
                    extra_attrs={
                        "graph.broadcast.fanout": spread_count,
                    },
                )
                cursor += broadcast_dur_ns

                # 5. spread: one parallel tool invocation per call.
                # All spread nodes start at the same cursor (parallel) and end
                # after ``spread_each_ns``; cursor advances once past them all.
                spread_start = cursor
                spread_end = spread_start + spread_each_ns
                for i in range(spread_count):
                    _child(
                        broadcast_ctx,
                        node_id=f"turn_tool_{i}",
                        node_type="spread",
                        node_start=spread_start,
                        node_end=spread_end,
                        extra_attrs={
                            "graph.spread.index": i,
                            "graph.spread.total": spread_count,
                        },
                    )
                cursor = spread_end

                # 6. join: collect parallel tool outputs via reduce_list_append.
                _j, join_ctx = _child(
                    broadcast_ctx,
                    node_id="turn_join",
                    node_type="join",
                    node_start=cursor,
                    node_end=cursor + join_dur_ns,
                    extra_attrs={
                        "graph.join.reducer": "reduce_list_append",
                        "graph.join.inputs": spread_count,
                    },
                )
                cursor += join_dur_ns
                last_ctx = join_ctx

            # 7. end
            _e, _end_ctx = _child(
                last_ctx,
                node_id="turn_end",
                node_type="end",
                node_start=cursor,
                node_end=cursor + end_dur_ns,
                extra_attrs={"graph.turn.stop_reason": stop_reason},
            )

            root_span.end(end_time=end_ns)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Failed to emit prompt-turn graph spans: %s", exc)


def _get_emitter(user_jwt_token: str | None = None) -> PromptTurnMetricsEmitter | None:
    cache_key = _token_cache_key(user_jwt_token)
    with _emitter_lock:
        existing = _emitters.get(cache_key)
        if existing is not None:
            return existing
        if cache_key in _emitter_init_attempted_keys:
            return None
        _emitter_init_attempted_keys.add(cache_key)
        try:
            service_name = os.environ.get(
                "DATALAYER_OTEL_SERVICE_NAME", "agent-runtimes"
            )
            run_url_source, run_url_value = _resolve_run_url_source()
            logger.info(
                "Prompt-turn OTEL emitter init: service=%s run_url_source=%s run_url=%s",
                service_name,
                run_url_source,
                run_url_value,
            )
            emitter = PromptTurnMetricsEmitter(
                service_name=service_name,
                user_jwt_token=user_jwt_token,
            )
            _emitters[cache_key] = emitter
            return emitter
        except Exception as exc:  # noqa: BLE001
            logger.warning("Prompt-turn OTEL metrics disabled: %s", exc)
        return None


def record_prompt_turn_completion(
    *,
    prompt: str,
    response: str,
    duration_ms: float,
    protocol: str,
    stop_reason: str,
    success: bool,
    model: str | None,
    tool_call_count: int,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    total_tokens: int | None = None,
    user_id: str | None = None,
    user_provider: str | None = None,
    identities_count: int | None = None,
    user_jwt_token: str | None = None,
    agent_id: str | None = None,
) -> None:
    """Emit prompt-turn completion metrics.

    This function is safe to call from request paths: failures are swallowed
    and logged without affecting prompt execution.
    """
    emitter = _get_emitter(user_jwt_token=user_jwt_token)
    if emitter is None:
        return
    try:
        emitter.record(
            prompt=prompt,
            response=response,
            duration_ms=duration_ms,
            protocol=protocol,
            stop_reason=stop_reason,
            success=success,
            model=model,
            tool_call_count=tool_call_count,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            user_id=user_id,
            agent_id=agent_id,
            user_provider=user_provider,
            identities_count=identities_count,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to emit prompt-turn metrics: %s", exc)
