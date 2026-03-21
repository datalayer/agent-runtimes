# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
OpenTelemetry instrumentation for agent-runtimes.

This module provides automatic tracing and metrics for agent-runtimes operations,
following the Logfire instrumentation pattern (external monkey-patching).

The instrumentation is **non-intrusive** – it patches classes from outside
without modifying the core agent-runtimes code.

Simple usage with Logfire (recommended):
    from agent_runtimes.otel import setup_otel, instrument_agent_runtimes

    # Setup OTEL and instrument in one call
    provider, tracer = setup_otel(service_name="my-app")

    # Or setup and instrument separately
    provider, tracer = setup_otel(service_name="my-app", instrument=False)
    instrument_agent_runtimes(tracer_provider=provider)

Environment variables for Logfire:
    DATALAYER_LOGFIRE_TOKEN   - Logfire write token (required)
    DATALAYER_LOGFIRE_PROJECT - Project name (default: starter-project)
    DATALAYER_LOGFIRE_URL     - Logfire URL (default: https://logfire-us.pydantic.dev)

Usage with plain OpenTelemetry:
    from opentelemetry import trace
    from agent_runtimes.otel import instrument_agent_runtimes

    tracer_provider = trace.get_tracer_provider()
    instrument_agent_runtimes(tracer_provider=tracer_provider)

Instrumented operations:
    - Agent run() calls (prompt, response, latency, session context)
    - Agent stream() calls (event count, total token steps)
    - Transport handle_request() calls (protocol, request/response size)
    - Adapter-level tool calls captured via run() wrapping
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import time
from collections.abc import AsyncIterator, Callable
from typing import TYPE_CHECKING, Any, TypeVar, cast

try:
    from opentelemetry import trace
    from opentelemetry.trace import Span, SpanKind, Status, StatusCode, Tracer

    OTEL_AVAILABLE = True
except ImportError:
    OTEL_AVAILABLE = False
    trace = cast(Any, None)
    Span = cast(Any, None)
    SpanKind = cast(Any, None)
    Status = cast(Any, None)
    StatusCode = cast(Any, None)
    Tracer = cast(Any, None)

# Optional metrics support
try:
    from opentelemetry import metrics
    from opentelemetry.metrics import Counter, Histogram, UpDownCounter

    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False
    metrics = cast(Any, None)
    Counter = cast(Any, None)
    Histogram = cast(Any, None)
    UpDownCounter = cast(Any, None)

if TYPE_CHECKING:
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.trace import TracerProvider

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

# Global state
_instrumented = False
_tracer_provider: Any | None = None
_meter_provider: Any | None = None

# Store original methods for uninstrumentation
_original_methods: dict[str, Any] = {}


# ============================================================================
# Setup
# ============================================================================


def setup_otel(
    service_name: str = "agent-runtimes",
    service_version: str = "1.0.0",
    *,
    token: str | None = None,
    project: str | None = None,
    url: str | None = None,
    instrument: bool = True,
    enable_metrics: bool = True,
    capture_prompts: bool = True,
    capture_responses: bool = True,
) -> tuple[Any, Any]:
    """
    Setup OpenTelemetry tracing and metrics for agent-runtimes with Logfire.

    This is the recommended way to enable observability. It configures the
    TracerProvider, MeterProvider, and OTLP exporters pointing at Logfire,
    then optionally instruments agent-runtimes classes.

    Args:
        service_name: Name of the service for tracing (default: "agent-runtimes")
        service_version: Version of the service (default: "1.0.0")
        token: Logfire write token. Reads DATALAYER_LOGFIRE_TOKEN env var if omitted.
        project: Logfire project name. Reads DATALAYER_LOGFIRE_PROJECT if omitted.
        url: Logfire base URL. Reads DATALAYER_LOGFIRE_URL if omitted.
        instrument: Whether to instrument agent-runtimes classes (default: True)
        enable_metrics: Whether to enable metrics collection (default: True)
        capture_prompts: Whether to capture prompt text as span attributes.
        capture_responses: Whether to capture response content as span attributes.

    Returns:
        Tuple of (TracerProvider, Tracer) for creating custom spans.

    Raises:
        ImportError: If OpenTelemetry packages are not installed.
        ValueError: If no token is provided and DATALAYER_LOGFIRE_TOKEN is not set.

    Example:
        from agent_runtimes.otel import setup_otel

        provider, tracer = setup_otel(service_name="my-agent-app")

        with tracer.start_as_current_span("my-operation") as span:
            span.set_attribute("key", "value")

        provider.force_flush()
    """
    global _tracer_provider, _meter_provider

    if not OTEL_AVAILABLE:
        raise ImportError(
            "OpenTelemetry is not installed. "
            "Install with: pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http"
        )

    # Read configuration from environment variables if not provided
    token = token or os.environ.get("DATALAYER_LOGFIRE_TOKEN")
    project = project or os.environ.get("DATALAYER_LOGFIRE_PROJECT", "starter-project")
    url = url or os.environ.get("DATALAYER_LOGFIRE_URL", "https://logfire-us.pydantic.dev")

    if not token:
        raise ValueError(
            "No Logfire token provided. "
            "Set DATALAYER_LOGFIRE_TOKEN environment variable or pass token= argument."
        )

    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    trace_exporter = OTLPSpanExporter(
        endpoint=f"{url}/v1/traces",
        headers={"Authorization": token},
    )

    resource = Resource.create(
        {
            "service.name": service_name,
            "service.version": service_version,
        }
    )

    span_processor = BatchSpanProcessor(trace_exporter)
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(span_processor)

    trace.set_tracer_provider(provider)
    _tracer_provider = provider

    # Setup metrics if available and enabled
    if enable_metrics and METRICS_AVAILABLE:
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

        metric_exporter = OTLPMetricExporter(
            endpoint=f"{url}/v1/metrics",
            headers={"Authorization": token},
        )
        metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=10_000)
        meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
        metrics.set_meter_provider(meter_provider)
        _meter_provider = meter_provider

    if instrument:
        instrument_agent_runtimes(
            tracer_provider=provider,
            meter_provider=_meter_provider,
            capture_prompts=capture_prompts,
            capture_responses=capture_responses,
        )

    tracer = provider.get_tracer(service_name)

    logger.info("OpenTelemetry configured for %s", service_name)
    logger.info("Traces: %s/datalayer/%s", url, project)

    return provider, tracer


def get_tracer(name: str = "agent-runtimes") -> Any | None:
    """
    Get a tracer from the configured provider.

    Returns:
        Tracer instance, or None if OTEL is not configured.
    """
    if _tracer_provider is not None:
        return _tracer_provider.get_tracer(name)
    if OTEL_AVAILABLE:
        return trace.get_tracer(name)
    return None


def get_meter(name: str = "agent-runtimes") -> Any | None:
    """
    Get a meter from the configured provider.

    Returns:
        Meter instance, or None if metrics are not configured.
    """
    if _meter_provider is not None:
        return _meter_provider.get_meter(name)
    if METRICS_AVAILABLE:
        return metrics.get_meter(name)
    return None


# ============================================================================
# Metrics definitions
# ============================================================================


class AgentRuntimesMetrics:
    """Container for agent-runtimes metric instruments."""

    def __init__(self, meter: Any):
        # Agent run metrics
        self.agent_run_count: Counter = meter.create_counter(
            name="agent_runtimes.agent.run.count",
            description="Number of agent run() calls",
            unit="1",
        )
        self.agent_run_duration: Histogram = meter.create_histogram(
            name="agent_runtimes.agent.run.duration",
            description="Duration of agent run() calls",
            unit="s",
        )
        self.agent_run_errors: Counter = meter.create_counter(
            name="agent_runtimes.agent.run.errors",
            description="Number of agent run() errors",
            unit="1",
        )

        # Streaming metrics
        self.agent_stream_count: Counter = meter.create_counter(
            name="agent_runtimes.agent.stream.count",
            description="Number of agent stream() calls",
            unit="1",
        )
        self.agent_stream_events: Counter = meter.create_counter(
            name="agent_runtimes.agent.stream.events",
            description="Number of streaming events emitted",
            unit="1",
        )

        # Transport metrics
        self.transport_request_count: Counter = meter.create_counter(
            name="agent_runtimes.transport.request.count",
            description="Number of transport handle_request() calls",
            unit="1",
        )
        self.transport_request_duration: Histogram = meter.create_histogram(
            name="agent_runtimes.transport.request.duration",
            description="Duration of transport handle_request() calls",
            unit="s",
        )
        self.transport_request_errors: Counter = meter.create_counter(
            name="agent_runtimes.transport.request.errors",
            description="Number of transport request errors",
            unit="1",
        )


# Global metrics instance
_metrics: AgentRuntimesMetrics | None = None


# ============================================================================
# Main instrumentation entry point
# ============================================================================


def instrument_agent_runtimes(
    logfire_instance: Any = None,
    *,
    tracer_provider: Any | None = None,
    meter_provider: Any | None = None,
    capture_prompts: bool = True,
    capture_responses: bool = True,
) -> None:
    """
    Instrument agent-runtimes for OpenTelemetry tracing and metrics.

    This follows the Logfire pattern of external monkey-patching – the core
    agent-runtimes code is not modified; instrumentation happens from outside.

    Args:
        logfire_instance: Optional Logfire instance. If provided, uses its
            tracer provider.
        tracer_provider: Optional OpenTelemetry TracerProvider. Falls back
            to the global provider if not given.
        meter_provider: Optional OpenTelemetry MeterProvider. Falls back
            to the global provider if not given.
        capture_prompts: Whether to capture prompt text as span attributes.
        capture_responses: Whether to capture response content as span attributes.

    Example with Logfire:
        import logfire
        from agent_runtimes.otel import instrument_agent_runtimes

        logfire.configure()
        instrument_agent_runtimes(logfire)

    Example with plain OpenTelemetry:
        from opentelemetry.sdk.trace import TracerProvider
        from agent_runtimes.otel import instrument_agent_runtimes

        provider = TracerProvider()
        instrument_agent_runtimes(tracer_provider=provider)
    """
    global _instrumented, _metrics

    if not OTEL_AVAILABLE:
        logger.warning(
            "OpenTelemetry not available – agent-runtimes instrumentation skipped. "
            "Install: pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http"
        )
        return

    if _instrumented:
        logger.warning("agent-runtimes is already instrumented. Call uninstrument_agent_runtimes() first.")
        return

    # Resolve tracer provider
    if logfire_instance is not None:
        try:
            resolved_provider = logfire_instance.get_tracer_provider()
        except AttributeError:
            resolved_provider = trace.get_tracer_provider()
    elif tracer_provider is not None:
        resolved_provider = tracer_provider
    else:
        resolved_provider = trace.get_tracer_provider()

    # Resolve meter provider
    if meter_provider is None and METRICS_AVAILABLE:
        meter_provider = metrics.get_meter_provider()

    tracer = resolved_provider.get_tracer("agent_runtimes", "0.1.0")

    # Initialise metrics instruments
    if meter_provider is not None and METRICS_AVAILABLE:
        meter = meter_provider.get_meter("agent_runtimes", "0.1.0")
        _metrics = AgentRuntimesMetrics(meter)

    capture_config = {
        "prompts": capture_prompts,
        "responses": capture_responses,
    }

    # Instrument sub-systems
    _instrument_adapters(tracer, capture_config)
    _instrument_transports(tracer, capture_config)

    _instrumented = True
    logger.info("agent-runtimes instrumentation enabled")


def uninstrument_agent_runtimes() -> None:
    """Remove agent-runtimes instrumentation and restore original methods."""
    global _instrumented, _metrics

    for key, original in list(_original_methods.items()):
        module_path, attr_name = key.rsplit(".", 1)
        try:
            import importlib

            # Try to get the class/module directly
            parts = module_path.split(".")
            obj = importlib.import_module(".".join(parts[:-1]))
            cls = getattr(obj, parts[-1])
            setattr(cls, attr_name, original)
            logger.debug("Restored %s.%s", module_path, attr_name)
        except Exception as exc:
            logger.warning("Failed to restore %s.%s: %s", module_path, attr_name, exc)

    _original_methods.clear()
    _metrics = None
    _instrumented = False
    logger.info("agent-runtimes instrumentation disabled")


# ============================================================================
# Adapter instrumentation – BaseAgent.run() and BaseAgent.stream()
# ============================================================================


def _instrument_adapters(
    tracer: Any, capture_config: dict[str, bool]
) -> None:
    """Instrument BaseAgent.run() and BaseAgent.stream()."""
    try:
        from agent_runtimes.adapters.base import BaseAgent
    except ImportError:
        logger.warning("Could not import agent_runtimes.adapters.base – skipping adapter instrumentation")
        return

    # --- run() ---
    original_run = BaseAgent.run
    _original_methods["agent_runtimes.adapters.base.BaseAgent.run"] = original_run

    async def traced_run(self: Any, prompt: str, context: Any) -> Any:
        agent_name = getattr(self, "name", type(self).__name__)
        session_id = getattr(context, "session_id", None)

        span_name = f"agent.run {agent_name}"
        attributes: dict[str, Any] = {
            "agent.name": agent_name,
            "agent.type": type(self).__name__,
        }
        if session_id:
            attributes["agent.session_id"] = session_id
        if capture_config.get("prompts") and prompt:
            attributes["agent.prompt"] = prompt[:500]  # truncate for safety

        t0 = time.perf_counter()
        with tracer.start_as_current_span(span_name, attributes=attributes) as span:
            try:
                response = await original_run(self, prompt, context)
                duration = time.perf_counter() - t0

                if capture_config.get("responses") and hasattr(response, "content"):
                    span.set_attribute("agent.response", str(response.content)[:500])
                if hasattr(response, "tool_calls"):
                    span.set_attribute("agent.tool_call_count", len(response.tool_calls))
                if hasattr(response, "usage"):
                    for k, v in (response.usage or {}).items():
                        span.set_attribute(f"agent.usage.{k}", v)

                if _metrics:
                    _metrics.agent_run_count.add(1, {"agent.name": agent_name})
                    _metrics.agent_run_duration.record(duration, {"agent.name": agent_name})

                return response
            except Exception as exc:
                duration = time.perf_counter() - t0
                if OTEL_AVAILABLE and StatusCode is not None:
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                span.record_exception(exc)
                if _metrics:
                    _metrics.agent_run_errors.add(1, {"agent.name": agent_name})
                raise

    setattr(BaseAgent, "run", traced_run)

    # --- stream() ---
    original_stream = BaseAgent.stream
    _original_methods["agent_runtimes.adapters.base.BaseAgent.stream"] = original_stream

    async def traced_stream(self: Any, prompt: str, context: Any) -> AsyncIterator[Any]:
        agent_name = getattr(self, "name", type(self).__name__)
        session_id = getattr(context, "session_id", None)

        span_name = f"agent.stream {agent_name}"
        attributes: dict[str, Any] = {
            "agent.name": agent_name,
            "agent.type": type(self).__name__,
        }
        if session_id:
            attributes["agent.session_id"] = session_id
        if capture_config.get("prompts") and prompt:
            attributes["agent.prompt"] = prompt[:500]

        event_count = 0
        with tracer.start_as_current_span(span_name, attributes=attributes) as span:
            try:
                async for event in original_stream(self, prompt, context):
                    event_count += 1
                    yield event
                span.set_attribute("agent.stream.event_count", event_count)
                if _metrics:
                    _metrics.agent_stream_count.add(1, {"agent.name": agent_name})
                    _metrics.agent_stream_events.add(event_count, {"agent.name": agent_name})
            except Exception as exc:
                if OTEL_AVAILABLE and StatusCode is not None:
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                span.record_exception(exc)
                raise

    setattr(BaseAgent, "stream", traced_stream)

    logger.debug("Instrumented BaseAgent.run and BaseAgent.stream")


# ============================================================================
# Transport instrumentation – BaseTransport.handle_request()
# ============================================================================


def _instrument_transports(
    tracer: Any, capture_config: dict[str, bool]
) -> None:
    """Instrument BaseTransport.handle_request()."""
    try:
        from agent_runtimes.transports.base import BaseTransport
    except ImportError:
        logger.warning("Could not import agent_runtimes.transports.base – skipping transport instrumentation")
        return

    original_handle_request = BaseTransport.handle_request
    _original_methods["agent_runtimes.transports.base.BaseTransport.handle_request"] = original_handle_request

    async def traced_handle_request(self: Any, request: dict[str, Any]) -> dict[str, Any]:
        protocol = getattr(self, "protocol_name", type(self).__name__)
        span_name = f"transport.request {protocol}"
        attributes: dict[str, Any] = {
            "transport.protocol": protocol,
            "transport.type": type(self).__name__,
        }

        t0 = time.perf_counter()
        with tracer.start_as_current_span(span_name, attributes=attributes) as span:
            try:
                response = await original_handle_request(self, request)
                duration = time.perf_counter() - t0

                if _metrics:
                    _metrics.transport_request_count.add(1, {"transport.protocol": protocol})
                    _metrics.transport_request_duration.record(duration, {"transport.protocol": protocol})

                return response
            except Exception as exc:
                duration = time.perf_counter() - t0
                if OTEL_AVAILABLE and StatusCode is not None:
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                span.record_exception(exc)
                if _metrics:
                    _metrics.transport_request_errors.add(1, {"transport.protocol": protocol})
                raise

    setattr(BaseTransport, "handle_request", traced_handle_request)

    logger.debug("Instrumented BaseTransport.handle_request")


# ============================================================================
# FastAPI middleware for HTTP-level tracing
# ============================================================================


def create_otel_middleware(tracer: Any = None, service_name: str = "agent-runtimes") -> Any:
    """
    Create a Starlette/FastAPI middleware that traces every HTTP request.

    Usage::

        from fastapi import FastAPI
        from agent_runtimes.otel import create_otel_middleware

        app = FastAPI()
        app.add_middleware(create_otel_middleware())

    Args:
        tracer: Optional tracer. Defaults to the global provider's tracer.
        service_name: Service name label for spans.

    Returns:
        A Starlette ``BaseHTTPMiddleware`` class.
    """
    if tracer is None:
        tracer = get_tracer(service_name)

    try:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import Response
    except ImportError:
        logger.warning("Starlette not available – HTTP middleware not created")
        return None

    class OtelHTTPMiddleware(BaseHTTPMiddleware):
        async def dispatch(
            self,
            request: Request,
            call_next: Callable[[Request], Any],
        ) -> Response:
            if tracer is None:
                return await call_next(request)

            method = request.method
            path = request.url.path
            span_name = f"{method} {path}"
            attributes = {
                "http.method": method,
                "http.url": str(request.url),
                "http.route": path,
            }

            with tracer.start_as_current_span(span_name, attributes=attributes) as span:
                try:
                    response = await call_next(request)
                    span.set_attribute("http.status_code", response.status_code)
                    if response.status_code >= 400 and StatusCode is not None:
                        span.set_status(Status(StatusCode.ERROR))
                    return response
                except Exception as exc:
                    if StatusCode is not None:
                        span.set_status(Status(StatusCode.ERROR, str(exc)))
                    span.record_exception(exc)
                    raise

    return OtelHTTPMiddleware
