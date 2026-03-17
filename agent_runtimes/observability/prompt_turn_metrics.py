# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Prompt-turn completion metrics emission for agent-runtimes.

Emits OTEL metrics to the Datalayer OTEL service on every completed prompt turn.
The exporter is configured lazily and reads:

- ``DATALAYER_OTEL_API_KEY`` for Bearer auth
- ``DATALAYER_OTEL_SERVICE_NAME`` for service.name resource attribute
- ``DATALAYER_OTLP_URL`` / ``OTEL_EXPORTER_OTLP_ENDPOINT`` / ``DATALAYER_OTEL_RUN_URL``
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)

_emitter_lock = threading.Lock()
_emitter: "PromptTurnMetricsEmitter | None" = None
_emitter_init_attempted = False


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


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


class PromptTurnMetricsEmitter:
    """Emits prompt-turn metrics through OTLP HTTP exporter."""

    def __init__(self, service_name: str, api_key: str | None = None) -> None:
        from opentelemetry import metrics
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource

        endpoint = _resolve_otlp_endpoint()
        headers: dict[str, str] | None = None
        resolved_key = api_key or os.environ.get("DATALAYER_OTEL_API_KEY")
        if resolved_key:
            headers = {"Authorization": f"Bearer {resolved_key}"}

        exporter = OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics", headers=headers)
        reader = PeriodicExportingMetricReader(
            exporter=exporter,
            export_interval_millis=5_000,
        )

        resource = Resource.create(
            {
                "service.name": service_name,
                "service.version": os.environ.get("AGENT_RUNTIMES_VERSION", "unknown"),
            }
        )

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
            f"{endpoint}/v1/metrics",
            "present" if resolved_key else "missing",
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


def _get_emitter() -> PromptTurnMetricsEmitter | None:
    global _emitter, _emitter_init_attempted
    with _emitter_lock:
        if _emitter is not None:
            return _emitter
        if _emitter_init_attempted:
            return None
        _emitter_init_attempted = True
        try:
            service_name = os.environ.get(
                "DATALAYER_OTEL_SERVICE_NAME", "agent-runtimes"
            )
            _emitter = PromptTurnMetricsEmitter(service_name=service_name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Prompt-turn OTEL metrics disabled: %s", exc)
            _emitter = None
        return _emitter


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
) -> None:
    """Emit prompt-turn completion metrics.

    This function is safe to call from request paths: failures are swallowed
    and logged without affecting prompt execution.
    """
    emitter = _get_emitter()
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
