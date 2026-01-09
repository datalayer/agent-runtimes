# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Configuration for observability in agent-runtimes.

Supports:
- OpenTelemetry configuration
- SQLite storage configuration
- Optional Logfire integration
"""

import logging
import os
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ExporterType(str, Enum):
    """Supported trace exporters."""
    CONSOLE = "console"
    OTLP = "otlp"
    SQLITE = "sqlite"
    LOGFIRE = "logfire"


class ObservabilityConfig(BaseModel):
    """Configuration for observability features."""
    
    # Enable/disable observability
    enabled: bool = True
    
    # Service identification
    service_name: str = "agent-runtimes"
    service_version: str = "0.1.0"
    environment: str = "development"
    
    # Trace exporters (multiple can be enabled)
    exporters: list[ExporterType] = Field(
        default_factory=lambda: [ExporterType.SQLITE]
    )
    
    # SQLite storage settings
    sqlite_path: str = Field(
        default_factory=lambda: str(
            Path.home() / ".datalayer" / "traces" / "agent_traces.db"
        )
    )
    sqlite_max_traces: int = 10000  # Maximum traces to keep
    sqlite_retention_days: int = 30  # Days to retain traces
    
    # OTLP settings (for external collectors)
    otlp_endpoint: str | None = None
    otlp_headers: dict[str, str] = Field(default_factory=dict)
    otlp_insecure: bool = False
    
    # Logfire settings
    logfire_token: str | None = None
    logfire_project: str | None = None
    
    # Sampling
    sample_rate: float = 1.0  # 1.0 = sample all, 0.0 = sample none
    
    # What to trace
    trace_agent_runs: bool = True
    trace_tool_calls: bool = True
    trace_code_execution: bool = True
    trace_llm_calls: bool = True
    
    # Attribute limits
    max_attribute_length: int = 4096
    max_events_per_span: int = 128
    
    @classmethod
    def from_env(cls) -> "ObservabilityConfig":
        """
        Create configuration from environment variables.
        
        Environment variables:
            OTEL_ENABLED: Enable observability (default: true)
            OTEL_SERVICE_NAME: Service name
            OTEL_EXPORTER: Comma-separated exporters
            OTEL_SQLITE_PATH: Path to SQLite database
            OTEL_OTLP_ENDPOINT: OTLP collector endpoint
            LOGFIRE_TOKEN: Logfire authentication token
        """
        exporters = []
        exporter_str = os.getenv("OTEL_EXPORTER", "sqlite")
        for exp in exporter_str.split(","):
            exp = exp.strip().lower()
            if exp in [e.value for e in ExporterType]:
                exporters.append(ExporterType(exp))
        
        return cls(
            enabled=os.getenv("OTEL_ENABLED", "true").lower() == "true",
            service_name=os.getenv("OTEL_SERVICE_NAME", "agent-runtimes"),
            environment=os.getenv("OTEL_ENVIRONMENT", "development"),
            exporters=exporters or [ExporterType.SQLITE],
            sqlite_path=os.getenv(
                "OTEL_SQLITE_PATH",
                str(Path.home() / ".datalayer" / "traces" / "agent_traces.db")
            ),
            otlp_endpoint=os.getenv("OTEL_OTLP_ENDPOINT"),
            logfire_token=os.getenv("LOGFIRE_TOKEN"),
            logfire_project=os.getenv("LOGFIRE_PROJECT"),
            sample_rate=float(os.getenv("OTEL_SAMPLE_RATE", "1.0")),
        )


_config: ObservabilityConfig | None = None
_initialized: bool = False


def configure_observability(
    config: ObservabilityConfig | None = None,
) -> None:
    """
    Configure observability for agent-runtimes.
    
    This should be called once at application startup.
    
    Args:
        config: Configuration to use. If None, loads from environment.
    """
    global _config, _initialized
    
    if _initialized:
        logger.warning("Observability already configured, skipping...")
        return
    
    _config = config or ObservabilityConfig.from_env()
    
    if not _config.enabled:
        logger.info("Observability disabled")
        _initialized = True
        return
    
    # Set up exporters
    _setup_exporters(_config)
    
    _initialized = True
    logger.info(
        f"Observability configured: service={_config.service_name}, "
        f"exporters={[e.value for e in _config.exporters]}"
    )


def _setup_exporters(config: ObservabilityConfig) -> None:
    """Set up trace exporters based on configuration."""
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        
        # Create resource
        resource = Resource.create({
            SERVICE_NAME: config.service_name,
            "service.version": config.service_version,
            "deployment.environment": config.environment,
        })
        
        # Create tracer provider
        provider = TracerProvider(resource=resource)
        
        # Add exporters
        for exporter_type in config.exporters:
            _add_exporter(provider, exporter_type, config)
        
        # Set global tracer provider
        trace.set_tracer_provider(provider)
        
    except ImportError as e:
        logger.warning(f"OpenTelemetry not available: {e}")


def _add_exporter(
    provider: Any,
    exporter_type: ExporterType,
    config: ObservabilityConfig,
) -> None:
    """Add a specific exporter to the tracer provider."""
    try:
        if exporter_type == ExporterType.CONSOLE:
            from opentelemetry.sdk.trace.export import (
                SimpleSpanProcessor,
                ConsoleSpanExporter,
            )
            provider.add_span_processor(
                SimpleSpanProcessor(ConsoleSpanExporter())
            )
            logger.info("Console exporter added")
            
        elif exporter_type == ExporterType.OTLP:
            if config.otlp_endpoint:
                from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                    OTLPSpanExporter,
                )
                from opentelemetry.sdk.trace.export import BatchSpanProcessor
                
                exporter = OTLPSpanExporter(
                    endpoint=config.otlp_endpoint,
                    headers=config.otlp_headers or None,
                    insecure=config.otlp_insecure,
                )
                provider.add_span_processor(BatchSpanProcessor(exporter))
                logger.info(f"OTLP exporter added: {config.otlp_endpoint}")
            else:
                logger.warning("OTLP exporter requested but no endpoint configured")
                
        elif exporter_type == ExporterType.SQLITE:
            from .storage import SQLiteSpanExporter
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            
            exporter = SQLiteSpanExporter(
                db_path=config.sqlite_path,
                max_traces=config.sqlite_max_traces,
            )
            provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info(f"SQLite exporter added: {config.sqlite_path}")
            
        elif exporter_type == ExporterType.LOGFIRE:
            if config.logfire_token:
                try:
                    import logfire
                    logfire.configure(
                        token=config.logfire_token,
                        project_name=config.logfire_project,
                        service_name=config.service_name,
                    )
                    logger.info("Logfire exporter configured")
                except ImportError:
                    logger.warning("Logfire package not installed")
            else:
                logger.warning("Logfire exporter requested but no token configured")
                
    except Exception as e:
        logger.error(f"Failed to add {exporter_type.value} exporter: {e}")


def get_config() -> ObservabilityConfig | None:
    """Get the current observability configuration."""
    return _config


def is_initialized() -> bool:
    """Check if observability is initialized."""
    return _initialized
