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
    run_url = (
        os.environ.get("DATALAYER_OTEL_RUN_URL")
        or os.environ.get("DATALAYER_RUN_URL")
        or "https://prod1.datalayer.run"
    )
    return f"{run_url.rstrip('/')}/api/otel/v1/otlp"


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
        from opentelemetry import metrics
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource

        endpoint = _resolve_otlp_endpoint()
        metrics_endpoint = _resolve_otlp_metrics_endpoint()
        self.metrics_endpoint = metrics_endpoint or _resolve_default_metrics_endpoint(endpoint)
        headers: dict[str, str] | None = None
        if user_jwt_token:
            headers = {"Authorization": f"Bearer {user_jwt_token}"}
        self._log_request_response = _bool_env(
            "DATALAYER_OTEL_LOG_REQUEST_RESPONSE", default=True
        )

        exporter = OTLPMetricExporter(endpoint=self.metrics_endpoint, headers=headers)
        reader = PeriodicExportingMetricReader(
            exporter=exporter,
            export_interval_millis=5_000,
        )

        resource_attrs: dict[str, str] = {
            "service.name": service_name,
            "service.version": os.environ.get("AGENT_RUNTIMES_VERSION", "unknown"),
        }
        user_uid = decode_user_uid(user_jwt_token) or os.environ.get("DATALAYER_USER_UID")
        if user_uid:
            resource_attrs["datalayer.user_uid"] = user_uid
            logger.info("Prompt-turn OTEL resource attribute: datalayer.user_uid=%s", user_uid)
        else:
            logger.warning(
                "No user_uid resolved from JWT – metrics will not be associated with a user account."
            )
        resource = Resource.create(resource_attrs)

        self.provider = MeterProvider(resource=resource, metric_readers=[reader])
        metrics.set_meter_provider(self.provider)
        meter = self.provider.get_meter("agent-runtimes.prompt-turn")

        self.turn_completions = meter.create_counter(
            name="agent_runtimes.prompt.turn.completions",
            description="Completed prompt turns",
            unit="1",
        )
        self.user_message_tokens = meter.create_counter(
            name="agent_runtimes.prompt.turn.user_message_tokens",
            description="Estimated user-message tokens on completed turns",
            unit="1",
        )
        self.ai_message_tokens = meter.create_counter(
            name="agent_runtimes.prompt.turn.ai_message_tokens",
            description="Estimated assistant-message tokens on completed turns",
            unit="1",
        )
        self.system_prompt_tokens = meter.create_counter(
            name="agent_runtimes.prompt.turn.system_prompt_tokens",
            description="Estimated system-prompt tokens on completed turns",
            unit="1",
        )
        self.tools_description_tokens = meter.create_counter(
            name="agent_runtimes.prompt.turn.tools_description_tokens",
            description="Estimated tool-description tokens on completed turns",
            unit="1",
        )
        self.tools_usage_tokens = meter.create_counter(
            name="agent_runtimes.prompt.turn.tools_usage_tokens",
            description="Estimated tool-usage tokens on completed turns",
            unit="1",
        )
        self.turn_duration_ms = meter.create_histogram(
            name="agent_runtimes.prompt.turn.duration_ms",
            description="Prompt-turn duration",
            unit="ms",
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
        user_id: str | None,
        user_provider: str | None,
        identities_count: int | None,
    ) -> None:
        attrs: dict[str, Any] = {
            "protocol": protocol,
            "stop_reason": stop_reason,
            "success": str(success).lower(),
        }
        if model:
            attrs["model"] = model
        if user_id:
            attrs["user.id"] = user_id
        if user_provider:
            attrs["identity.provider"] = user_provider
        if identities_count is not None:
            attrs["identity.count"] = int(max(0, identities_count))

        logger.debug(
            "Prompt-turn OTEL emit attrs: protocol=%s model=%s user.id=%s provider=%s identities=%s success=%s stop_reason=%s",
            protocol,
            model,
            attrs.get("user.id"),
            attrs.get("identity.provider"),
            attrs.get("identity.count"),
            success,
            stop_reason,
        )

        self.turn_completions.add(1, attrs)
        self.user_message_tokens.add(_estimate_tokens(prompt), attrs)
        self.ai_message_tokens.add(_estimate_tokens(response), attrs)
        self.system_prompt_tokens.add(0, attrs)
        self.tools_description_tokens.add(0, attrs)
        self.tools_usage_tokens.add(max(0, tool_call_count), attrs)
        self.turn_duration_ms.record(max(duration_ms, 0.0), attrs)

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
            try:
                try:
                    flushed = bool(self.provider.force_flush(timeout_millis=2_000))
                except TypeError:
                    flushed = bool(self.provider.force_flush())
                logger.info(
                    "Prompt-turn OTEL response: server=%s flush_success=%s",
                    self.metrics_endpoint,
                    flushed,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Prompt-turn OTEL response: server=%s flush_error=%s",
                    self.metrics_endpoint,
                    exc,
                )


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
    user_id: str | None = None,
    user_provider: str | None = None,
    identities_count: int | None = None,
    user_jwt_token: str | None = None,
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
            user_id=user_id,
            user_provider=user_provider,
            identities_count=identities_count,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to emit prompt-turn metrics: %s", exc)
