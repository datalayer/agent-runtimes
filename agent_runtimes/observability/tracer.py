# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Tracing utilities for agent-runtimes.

Provides:
- AgentTracer for creating traced agent operations
- Decorators for tracing agent runs and tool calls
- Context propagation for distributed tracing
"""

import asyncio
import functools
import logging
from contextlib import contextmanager, asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable, Generator, TypeVar

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


class AgentTracer:
    """
    Tracer for agent operations.
    
    Wraps OpenTelemetry tracer with agent-specific functionality.
    """
    
    def __init__(
        self,
        service_name: str = "agent-runtimes",
        agent_id: str | None = None,
    ):
        """
        Initialize the agent tracer.
        
        Args:
            service_name: Name of the service for tracing.
            agent_id: Default agent ID to attach to spans.
        """
        self.service_name = service_name
        self.agent_id = agent_id
        self._tracer = self._get_tracer()
    
    def _get_tracer(self) -> Any:
        """Get the OpenTelemetry tracer."""
        try:
            from opentelemetry import trace
            return trace.get_tracer(self.service_name)
        except ImportError:
            logger.debug("OpenTelemetry not available, using no-op tracer")
            return None
    
    @contextmanager
    def span(
        self,
        name: str,
        attributes: dict[str, Any] | None = None,
        agent_id: str | None = None,
        session_id: str | None = None,
    ) -> Generator[Any, None, None]:
        """
        Create a traced span context.
        
        Args:
            name: Name of the span.
            attributes: Additional attributes for the span.
            agent_id: Agent ID to attach to the span.
            session_id: Session ID to attach to the span.
            
        Yields:
            The span object (or None if tracing unavailable).
        """
        if not self._tracer:
            yield None
            return
        
        # Prepare attributes
        span_attributes = attributes or {}
        span_attributes["agent.id"] = agent_id or self.agent_id
        if session_id:
            span_attributes["session.id"] = session_id
        
        # Remove None values
        span_attributes = {k: v for k, v in span_attributes.items() if v is not None}
        
        with self._tracer.start_as_current_span(
            name,
            attributes=span_attributes,
        ) as span:
            yield span
    
    @asynccontextmanager
    async def async_span(
        self,
        name: str,
        attributes: dict[str, Any] | None = None,
        agent_id: str | None = None,
        session_id: str | None = None,
    ) -> AsyncGenerator[Any, None]:
        """
        Create an async traced span context.
        
        Args:
            name: Name of the span.
            attributes: Additional attributes for the span.
            agent_id: Agent ID to attach to the span.
            session_id: Session ID to attach to the span.
            
        Yields:
            The span object (or None if tracing unavailable).
        """
        # Use sync version - context managers work the same
        with self.span(name, attributes, agent_id, session_id) as span:
            yield span
    
    def trace_run(
        self,
        agent_id: str | None = None,
        session_id: str | None = None,
    ) -> Callable[[F], F]:
        """
        Decorator to trace agent run methods.
        
        Args:
            agent_id: Agent ID to attach to spans.
            session_id: Session ID to attach to spans.
            
        Returns:
            Decorated function.
        """
        def decorator(func: F) -> F:
            if asyncio.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    async with self.async_span(
                        f"agent.run.{func.__name__}",
                        attributes={
                            "agent.method": func.__name__,
                        },
                        agent_id=agent_id,
                        session_id=session_id,
                    ) as span:
                        try:
                            result = await func(*args, **kwargs)
                            if span:
                                span.set_attribute("agent.run.success", True)
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("agent.run.success", False)
                                span.set_attribute("agent.run.error", str(e))
                                span.record_exception(e)
                            raise
                return async_wrapper  # type: ignore
            else:
                @functools.wraps(func)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    with self.span(
                        f"agent.run.{func.__name__}",
                        attributes={
                            "agent.method": func.__name__,
                        },
                        agent_id=agent_id,
                        session_id=session_id,
                    ) as span:
                        try:
                            result = func(*args, **kwargs)
                            if span:
                                span.set_attribute("agent.run.success", True)
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("agent.run.success", False)
                                span.set_attribute("agent.run.error", str(e))
                                span.record_exception(e)
                            raise
                return sync_wrapper  # type: ignore
        return decorator
    
    def trace_tool(
        self,
        tool_name: str | None = None,
        agent_id: str | None = None,
    ) -> Callable[[F], F]:
        """
        Decorator to trace tool calls.
        
        Args:
            tool_name: Name of the tool (uses function name if not provided).
            agent_id: Agent ID to attach to spans.
            
        Returns:
            Decorated function.
        """
        def decorator(func: F) -> F:
            name = tool_name or func.__name__
            
            if asyncio.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    async with self.async_span(
                        f"tool.call.{name}",
                        attributes={
                            "tool.name": name,
                            "tool.method": func.__name__,
                        },
                        agent_id=agent_id,
                    ) as span:
                        try:
                            result = await func(*args, **kwargs)
                            if span:
                                span.set_attribute("tool.success", True)
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("tool.success", False)
                                span.set_attribute("tool.error", str(e))
                                span.record_exception(e)
                            raise
                return async_wrapper  # type: ignore
            else:
                @functools.wraps(func)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    with self.span(
                        f"tool.call.{name}",
                        attributes={
                            "tool.name": name,
                            "tool.method": func.__name__,
                        },
                        agent_id=agent_id,
                    ) as span:
                        try:
                            result = func(*args, **kwargs)
                            if span:
                                span.set_attribute("tool.success", True)
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("tool.success", False)
                                span.set_attribute("tool.error", str(e))
                                span.record_exception(e)
                            raise
                return sync_wrapper  # type: ignore
        return decorator
    
    def trace_code_execution(
        self,
        agent_id: str | None = None,
        session_id: str | None = None,
    ) -> Callable[[F], F]:
        """
        Decorator to trace code execution.
        
        Args:
            agent_id: Agent ID to attach to spans.
            session_id: Session ID to attach to spans.
            
        Returns:
            Decorated function.
        """
        def decorator(func: F) -> F:
            if asyncio.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    # Try to extract code from args
                    code = ""
                    if args:
                        code = str(args[0])[:500]  # First 500 chars
                    
                    async with self.async_span(
                        "code.execution",
                        attributes={
                            "code.preview": code[:100],
                            "code.length": len(code),
                        },
                        agent_id=agent_id,
                        session_id=session_id,
                    ) as span:
                        start_time = datetime.now(timezone.utc)
                        try:
                            result = await func(*args, **kwargs)
                            if span:
                                span.set_attribute("code.success", True)
                                span.set_attribute(
                                    "code.duration_ms",
                                    (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                                )
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("code.success", False)
                                span.set_attribute("code.error", str(e))
                                span.record_exception(e)
                            raise
                return async_wrapper  # type: ignore
            else:
                @functools.wraps(func)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    code = ""
                    if args:
                        code = str(args[0])[:500]
                    
                    with self.span(
                        "code.execution",
                        attributes={
                            "code.preview": code[:100],
                            "code.length": len(code),
                        },
                        agent_id=agent_id,
                        session_id=session_id,
                    ) as span:
                        start_time = datetime.now(timezone.utc)
                        try:
                            result = func(*args, **kwargs)
                            if span:
                                span.set_attribute("code.success", True)
                                span.set_attribute(
                                    "code.duration_ms",
                                    (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                                )
                            return result
                        except Exception as e:
                            if span:
                                span.set_attribute("code.success", False)
                                span.set_attribute("code.error", str(e))
                                span.record_exception(e)
                            raise
                return sync_wrapper  # type: ignore
        return decorator


# Convenience functions
_default_tracer: AgentTracer | None = None


def get_tracer(
    service_name: str = "agent-runtimes",
    agent_id: str | None = None,
) -> AgentTracer:
    """
    Get or create the default tracer.
    
    Args:
        service_name: Name of the service for tracing.
        agent_id: Default agent ID to attach to spans.
        
    Returns:
        The AgentTracer instance.
    """
    global _default_tracer
    if _default_tracer is None:
        _default_tracer = AgentTracer(service_name, agent_id)
    return _default_tracer


def trace_agent_run(
    agent_id: str | None = None,
    session_id: str | None = None,
) -> Callable[[F], F]:
    """
    Decorator to trace agent run methods using default tracer.
    
    Args:
        agent_id: Agent ID to attach to spans.
        session_id: Session ID to attach to spans.
        
    Returns:
        Decorated function.
    """
    tracer = get_tracer()
    return tracer.trace_run(agent_id, session_id)


def trace_tool_call(
    tool_name: str | None = None,
    agent_id: str | None = None,
) -> Callable[[F], F]:
    """
    Decorator to trace tool calls using default tracer.
    
    Args:
        tool_name: Name of the tool.
        agent_id: Agent ID to attach to spans.
        
    Returns:
        Decorated function.
    """
    tracer = get_tracer()
    return tracer.trace_tool(tool_name, agent_id)
