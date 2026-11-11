# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""GenAI spans of every pydantic-ai agent, as AgentCore Evaluations reads them (AC-12, AC-13).

pydantic-ai's own instrumentation is switched on for every agent
(:func:`enable_genai_instrumentation`, ``Agent.instrument_all``): the
OpenTelemetry GenAI semantic conventions in pydantic-ai's format version 5,
an ``invoke_agent`` span per run, ``execute_tool`` per tool call (its name,
its arguments, its result) and ``chat`` per model request, each with its
``gen_ai.operation.name``.

- **The scope.** AgentCore Evaluations reads spans whose instrumentation
  scope starts with ``opentelemetry.instrumentation.``. pydantic-ai asks its
  tracer of ``tracer_provider.get_tracer("pydantic-ai", version)``: it is
  given a :class:`ScopedTracerProvider`, whose tracers all answer to
  :data:`SCOPE`.
- **The content.** Prompts, answers, tool arguments and results are captured
  as ``OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`` says (on unless it
  says ``false``), and never in a visitor's turn nor on the visitors'
  runtime: decided as each span is written, not when the agent is made.
- **Where they go.** To the process's tracer provider, the Datalayer exporter
  of the platform's otel service. On AgentCore Runtime
  (``AGENT_RUNTIMES_TARGET=agentcore``), also to the OTLP endpoint
  AgentCore Observability gives the container in the standard
  ``OTEL_EXPORTER_OTLP_*`` variables (:func:`agentcore_export_from_env`);
  without one, and with ``AGENT_OBSERVABILITY_ENABLED=true``, X-Ray's OTLP
  endpoint of ``AWS_REGION``, signed with SigV4. Nothing here listens: the
  ports 4317 and 4318 are AgentCore's own collector's. X-Ray's OTLP endpoint
  takes spans only once the account sends trace segments to CloudWatch Logs
  (CloudWatch Transaction Search); before, it answers every export 400.
- **The session.** AgentCore Evaluations judges a session from the spans
  carrying its ``session.id``: on AgentCore every span of an invocation
  carries the runtime session id it was invoked with
  (:func:`use_session_id`, :class:`SessionIdProcessor`).
"""

from __future__ import annotations

import logging
import os
import re
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Mapping, Optional
from urllib.parse import urlparse

from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor
from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from opentelemetry.trace import Tracer, TracerProvider
from pydantic_ai.models.instrumented import InstrumentationSettings

logger = logging.getLogger(__name__)

#: The instrumentation scope of every GenAI span of agent-runtimes.
SCOPE = "opentelemetry.instrumentation.agent_runtimes"

#: pydantic-ai's format of the GenAI semantic conventions.
INSTRUMENTATION_VERSION = 5

#: Whether prompts, answers and tool arguments and results are captured.
CONTENT_VARIABLE = "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT"

#: What AgentCore sets when its observability is on for the runtime.
OBSERVABILITY_VARIABLE = "AGENT_OBSERVABILITY_ENABLED"

#: The OTLP variables read, the traces' own before the general ones.
TRACES_ENDPOINT_VARIABLE = "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
ENDPOINT_VARIABLE = "OTEL_EXPORTER_OTLP_ENDPOINT"
TRACES_PROTOCOL_VARIABLE = "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL"
PROTOCOL_VARIABLE = "OTEL_EXPORTER_OTLP_PROTOCOL"
TRACES_EXPORTER_VARIABLE = "OTEL_TRACES_EXPORTER"

#: The one OTLP protocol this exporter speaks.
HTTP_PROTOBUF = "http/protobuf"

#: X-Ray's OTLP endpoint, which takes SigV4-signed requests.
_XRAY_HOST = re.compile(r"^xray\.([a-z0-9-]+)\.amazonaws\.com$")

_FALSE = ("false", "0", "no", "off")


def _version() -> str:
    from agent_runtimes import __version__

    return str(__version__)


class ScopedTracerProvider(TracerProvider):
    """Answer every tracer under :data:`SCOPE`, from another provider.

    Parameters
    ----------
    delegate : TracerProvider, optional
        The provider the spans are made by; the process's global one, read
        at each ``get_tracer``, when not given.
    """

    def __init__(self, delegate: Optional[TracerProvider] = None) -> None:
        self.delegate = delegate

    def get_tracer(
        self,
        instrumenting_module_name: str,
        instrumenting_library_version: Optional[str] = None,
        schema_url: Optional[str] = None,
        attributes: Any = None,
    ) -> Tracer:
        """Return the delegate's tracer for :data:`SCOPE`, whatever it was asked for."""
        delegate = self.delegate or trace.get_tracer_provider()
        return delegate.get_tracer(SCOPE, _version(), schema_url, attributes)


def content_setting(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Read whether content is captured, as the environment says (on by default).

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.

    Returns
    -------
    bool
        ``False`` when ``OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT``
        says so.
    """
    env = os.environ if environ is None else environ
    return (env.get(CONTENT_VARIABLE) or "").strip().lower() not in _FALSE


def _a_visitor_s() -> bool:
    """Tell whether the turn under way is a visitor's, or the runtime the visitors'."""
    from agent_runtimes.apps.visitors import in_visitor_turn, visitors_runtime

    return visitors_runtime() or in_visitor_turn()


class GenAIInstrumentationSettings(InstrumentationSettings):
    """pydantic-ai's settings, content decided as each span is written.

    ``include_content`` is the setting given, except in a visitor's turn
    and on the visitors' runtime, where it is always ``False``.
    """

    @property
    def include_content(self) -> bool:
        """Tell whether this span may carry prompts, answers and tool data."""
        return self._content_setting and not _a_visitor_s()

    @include_content.setter
    def include_content(self, value: bool) -> None:
        self._content_setting = bool(value)


def instrumentation_settings(
    tracer_provider: Optional[TracerProvider] = None,
    environ: Optional[Mapping[str, str]] = None,
) -> GenAIInstrumentationSettings:
    """Make the instrumentation settings of every agent.

    Parameters
    ----------
    tracer_provider : TracerProvider, optional
        The provider the spans are made by; the process's when not given.
    environ : Mapping[str, str], optional
        The environment the content setting is read from.

    Returns
    -------
    GenAIInstrumentationSettings
        Format version 5, the scope :data:`SCOPE`, content as configured.
    """
    return GenAIInstrumentationSettings(
        tracer_provider=ScopedTracerProvider(tracer_provider),
        include_content=content_setting(environ),
        version=INSTRUMENTATION_VERSION,
    )


def enable_genai_instrumentation(
    tracer_provider: Optional[TracerProvider] = None,
    environ: Optional[Mapping[str, str]] = None,
) -> GenAIInstrumentationSettings:
    """Switch pydantic-ai's instrumentation on for every agent of the process.

    Parameters
    ----------
    tracer_provider : TracerProvider, optional
        The provider the spans are made by; on AgentCore Runtime, the one
        :func:`genai_tracer_provider` makes, else the process's.
    environ : Mapping[str, str], optional
        The environment the content setting is read from.

    Returns
    -------
    GenAIInstrumentationSettings
        The settings every agent that sets none of its own runs with.
    """
    from pydantic_ai import Agent

    settings = instrumentation_settings(tracer_provider, environ)
    Agent.instrument_all(settings)
    return settings


# --- AgentCore Observability (AC-13) ---------------------------------------------------


@dataclass(frozen=True)
class AgentCoreExport:
    """Where the spans of an AgentCore runtime are also sent."""

    #: The OTLP/HTTP traces endpoint.
    endpoint: str
    #: The region of the SigV4 signature, for X-Ray's endpoint; else ``None``.
    sigv4_region: Optional[str] = None
    #: Where it was read from, said in the log.
    source: str = ""


def agentcore_export_from_env(
    environ: Optional[Mapping[str, str]] = None,
) -> Optional[AgentCoreExport]:
    """Read where AgentCore Observability takes the runtime's spans.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.

    Returns
    -------
    AgentCoreExport or None
        The traces endpoint, or ``None`` when AgentCore gave none (its
        observability is off for the runtime) or traces are not exported
        (``OTEL_TRACES_EXPORTER=none``).

    Raises
    ------
    ValueError
        When the protocol is not ``http/protobuf``, or X-Ray is to be used
        and no region is set, in a sentence.
    """
    env = os.environ if environ is None else environ
    exporters = (env.get(TRACES_EXPORTER_VARIABLE) or "otlp").strip().lower()
    if exporters == "none":
        return None
    protocol = (
        env.get(TRACES_PROTOCOL_VARIABLE) or env.get(PROTOCOL_VARIABLE) or HTTP_PROTOBUF
    ).strip()
    if protocol != HTTP_PROTOBUF:
        raise ValueError(
            f"AgentCore's spans are exported over OTLP {HTTP_PROTOBUF}, "
            f"not {protocol!r} ({TRACES_PROTOCOL_VARIABLE} or {PROTOCOL_VARIABLE})."
        )
    endpoint = (env.get(TRACES_ENDPOINT_VARIABLE) or "").strip()
    source = TRACES_ENDPOINT_VARIABLE
    if not endpoint:
        base = (env.get(ENDPOINT_VARIABLE) or "").strip()
        if base:
            endpoint = f"{base.rstrip('/')}/v1/traces"
            source = ENDPOINT_VARIABLE
    if not endpoint:
        if (env.get(OBSERVABILITY_VARIABLE) or "").strip().lower() != "true":
            return None
        region = (env.get("AWS_REGION") or env.get("AWS_DEFAULT_REGION") or "").strip()
        if not region:
            raise ValueError(
                f"{OBSERVABILITY_VARIABLE} is true and no OTLP endpoint is set, so "
                "spans go to X-Ray, whose region AWS_REGION does not say."
            )
        endpoint = f"https://xray.{region}.amazonaws.com/v1/traces"
        source = OBSERVABILITY_VARIABLE
    host = urlparse(endpoint).hostname or ""
    xray = _XRAY_HOST.match(host)
    return AgentCoreExport(
        endpoint=endpoint,
        sigv4_region=xray.group(1) if xray else None,
        source=source,
    )


def _sigv4_session(region: str) -> Any:
    """Make a requests session that signs each request for X-Ray with SigV4."""
    import boto3
    import requests
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest

    credentials = boto3.Session().get_credentials()
    if credentials is None:
        raise ValueError(
            "Spans go to X-Ray, which takes SigV4-signed requests, and no AWS "
            "credentials were found (the runtime's execution role)."
        )

    class SigV4Session(requests.Session):
        """Sign every request for the ``xray`` service of one region."""

        def request(  # type: ignore[override]
            self, method: str, url: str, *args: Any, **kwargs: Any
        ) -> Any:
            """Send the request signed with the current credentials."""
            headers = {**dict(self.headers), **dict(kwargs.pop("headers", None) or {})}
            signed = AWSRequest(
                method=method, url=url, data=kwargs.get("data"), headers=headers
            )
            SigV4Auth(credentials.get_frozen_credentials(), "xray", region).add_auth(
                signed
            )
            return super().request(
                method, url, *args, headers=dict(signed.headers), **kwargs
            )

    return SigV4Session()


def agentcore_span_exporter(export: AgentCoreExport) -> SpanExporter:
    """Make the OTLP exporter of AgentCore's endpoint.

    Parameters
    ----------
    export : AgentCoreExport
        Where the spans go.

    Returns
    -------
    SpanExporter
        OTLP/HTTP to the endpoint; its headers from the standard variables,
        SigV4-signed for X-Ray.
    """
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
        OTLPSpanExporter,
    )

    session = _sigv4_session(export.sigv4_region) if export.sigv4_region else None
    return OTLPSpanExporter(endpoint=export.endpoint, session=session)


#: The span attribute AgentCore Evaluations groups a session's spans by.
SESSION_ID_ATTRIBUTE = "session.id"

#: The AgentCore runtime session of the invocation being served.
_SESSION_ID: ContextVar[str] = ContextVar("agentcore_span_session_id", default="")


@contextmanager
def use_session_id(session_id: str) -> Iterator[None]:
    """Stamp every span started while an invocation runs with its session id."""
    reset = _SESSION_ID.set(session_id)
    try:
        yield
    finally:
        _SESSION_ID.reset(reset)


class SessionIdProcessor(SpanProcessor):
    """Write the invocation's session id on each span as it starts (``session.id``)."""

    def on_start(self, span: Any, parent_context: Any = None) -> None:
        """Stamp the span, when an invocation names its session."""
        session_id = _SESSION_ID.get()
        if session_id:
            span.set_attribute(SESSION_ID_ATTRIBUTE, session_id)


@dataclass
class ToGlobalProcessor(SpanProcessor):
    """Hand each ended span to the process's own provider's processors too.

    The Datalayer exporter is the process's tracer provider's (the platform's
    otel service, with the person's token): a span made by the AgentCore
    provider reaches it as well, so neither exporter replaces the other.
    """

    provider_of: Callable[[], Any] = trace.get_tracer_provider
    own: Optional[Any] = field(default=None, repr=False)

    def _target(self) -> Optional[Any]:
        provider = self.provider_of()
        if not isinstance(provider, SDKTracerProvider) or provider is self.own:
            return None
        return getattr(provider, "_active_span_processor", None)

    def on_end(self, span: ReadableSpan) -> None:
        """Pass the span on, when the process has an SDK provider of its own."""
        target = self._target()
        if target is not None:
            target.on_end(span)

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """Flush the process's provider's processors."""
        target = self._target()
        return True if target is None else bool(target.force_flush(timeout_millis))


def genai_tracer_provider(
    environ: Optional[Mapping[str, str]] = None,
    exporter: Optional[SpanExporter] = None,
    provider_of: Callable[[], Any] = trace.get_tracer_provider,
) -> Optional[SDKTracerProvider]:
    """Make the provider of the GenAI spans on AgentCore Runtime, or none elsewhere.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.
    exporter : SpanExporter, optional
        The AgentCore exporter (a test's); made from the environment when
        not given.
    provider_of : Callable, optional
        The process's provider, whose processors are given every span too.

    Returns
    -------
    opentelemetry.sdk.trace.TracerProvider or None
        On AgentCore with an endpoint, a provider exporting there and to the
        process's provider; else ``None``: the process's provider alone.
    """
    from opentelemetry.sdk.resources import Resource

    from agent_runtimes.agentcore.settings import is_agentcore_target

    env = os.environ if environ is None else environ
    if not is_agentcore_target(env):
        return None
    export = agentcore_export_from_env(env)
    if export is None:
        logger.info(
            "AgentCore gave no OTLP endpoint: the GenAI spans go to Datalayer only."
        )
        return None
    provider = SDKTracerProvider(resource=Resource.create())
    provider.add_span_processor(SessionIdProcessor())
    provider.add_span_processor(
        BatchSpanProcessor(exporter or agentcore_span_exporter(export))
    )
    provider.add_span_processor(
        ToGlobalProcessor(provider_of=provider_of, own=provider)
    )
    logger.info(
        "GenAI spans also go to AgentCore Observability at %s (%s%s)",
        export.endpoint,
        export.source,
        ", SigV4" if export.sigv4_region else "",
    )
    return provider


__all__ = [
    "CONTENT_VARIABLE",
    "INSTRUMENTATION_VERSION",
    "SCOPE",
    "AgentCoreExport",
    "GenAIInstrumentationSettings",
    "SESSION_ID_ATTRIBUTE",
    "ScopedTracerProvider",
    "SessionIdProcessor",
    "ToGlobalProcessor",
    "agentcore_export_from_env",
    "agentcore_span_exporter",
    "content_setting",
    "enable_genai_instrumentation",
    "genai_tracer_provider",
    "use_session_id",
    "instrumentation_settings",
]
