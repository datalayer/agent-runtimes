# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent delegation — cross-agent usage tracking and OpenTelemetry propagation.

Aligned with pydantic-ai's recommended pattern:
    result = await sub_agent.run(task, usage=ctx.usage)

Usage (tokens, costs) from delegate agents accumulates into the parent's
RunUsage, giving accurate cost tracking across the entire delegation chain.

UsageLimits set at the top level are enforced across all delegated runs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class DelegationConfig:
    """Configuration for agent delegation.

    Parameters
    ----------
    model : str | None
        Model override for the sub-agent (e.g. 'openai:gpt-4.1-mini').
        If None, the sub-agent uses its default model.
    propagate_usage : bool
        Whether to propagate the parent's usage tracker to the sub-agent.
        Default True — this is the recommended pattern from pydantic-ai.
    propagate_trace : bool
        Whether to propagate OpenTelemetry trace context.
    timeout : float | None
        Timeout for the delegated run in seconds.
    """

    model: str | None = None
    propagate_usage: bool = True
    propagate_trace: bool = True
    timeout: float | None = None


@dataclass
class DelegationResult:
    """Result from a delegated agent run.

    Parameters
    ----------
    output : str
        The text output from the sub-agent.
    agent_id : str
        Identifier of the sub-agent that produced the result.
    tokens_used : int
        Tokens consumed by this delegation (input + output).
    cost_usd : float
        Estimated cost for this delegation.
    metadata : dict
        Additional metadata (model used, request count, etc.).
    """

    output: str
    agent_id: str
    tokens_used: int = 0
    cost_usd: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


async def delegate_to_agent(
    sub_agent: Any,
    task: str,
    parent_usage: Any | None = None,
    config: DelegationConfig | None = None,
) -> DelegationResult:
    """Delegate work to a sub-agent with usage tracking and OTEL propagation.

    This implements the pydantic-ai recommended delegation pattern:
    1. Pass parent's `usage` tracker to accumulate tokens/cost
    2. Propagate OTEL trace context for full-stack observability
    3. Return structured result with usage metrics

    Parameters
    ----------
    sub_agent : Any
        A pydantic-ai Agent instance to delegate to.
    task : str
        The task/prompt to send to the sub-agent.
    parent_usage : Any | None
        The parent agent's RunUsage instance. Passing it ensures tokens
        from the sub-agent accumulate into the parent's totals.
    config : DelegationConfig | None
        Optional delegation configuration.

    Returns
    -------
    DelegationResult
        Structured result with output and usage metrics.

    Example
    -------
    ```python
    @agent.tool
    async def delegate_analysis(ctx: RunContext, task: str) -> str:
        result = await delegate_to_agent(
            analysis_agent, task, parent_usage=ctx.usage
        )
        return result.output
    ```
    """
    config = config or DelegationConfig()

    # Start OTEL span for delegation tracing
    span = None
    if config.propagate_trace:
        span = _start_delegation_span(sub_agent, task)

    try:
        # Build run kwargs
        run_kwargs: dict[str, Any] = {}

        if config.propagate_usage and parent_usage is not None:
            run_kwargs["usage"] = parent_usage

        if config.model is not None:
            run_kwargs["model"] = config.model

        # Execute the delegated run
        result = await sub_agent.run(task, **run_kwargs)

        # Extract usage metrics
        tokens_used = 0
        cost_usd = 0.0
        metadata: dict[str, Any] = {}

        if hasattr(result, "usage"):
            usage = result.usage()
            tokens_used = getattr(usage, "total_tokens", 0) or 0
            metadata["requests"] = getattr(usage, "requests", 0)
            metadata["request_tokens"] = getattr(usage, "request_tokens", 0)
            metadata["response_tokens"] = getattr(usage, "response_tokens", 0)

        if hasattr(result, "cost"):
            cost_info = result.cost()
            cost_usd = getattr(cost_info, "total", 0.0) or 0.0

        # Determine agent ID
        agent_id = getattr(sub_agent, "name", None) or str(type(sub_agent).__name__)

        delegation_result = DelegationResult(
            output=str(result.output) if hasattr(result, "output") else str(result),
            agent_id=agent_id,
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            metadata=metadata,
        )

        if span is not None:
            _finish_delegation_span(span, delegation_result)

        logger.info(
            "Delegation to %s completed: %d tokens, $%.4f",
            agent_id,
            tokens_used,
            cost_usd,
        )

        return delegation_result

    except Exception as e:
        if span is not None:
            _fail_delegation_span(span, e)
        logger.error("Delegation failed: %s", e)
        raise


def _start_delegation_span(sub_agent: Any, task: str) -> Any:
    """Start an OpenTelemetry span for a delegation call."""
    try:
        from opentelemetry import trace

        tracer = trace.get_tracer("agent_runtimes.delegation")
        agent_name = getattr(sub_agent, "name", "unknown")
        span = tracer.start_span(
            f"delegate:{agent_name}",
            attributes={
                "delegation.agent": agent_name,
                "delegation.task_length": len(task),
            },
        )
        return span
    except ImportError:
        return None


def _finish_delegation_span(span: Any, result: DelegationResult) -> None:
    """Record delegation result on the OTEL span."""
    try:
        span.set_attribute("delegation.tokens_used", result.tokens_used)
        span.set_attribute("delegation.cost_usd", result.cost_usd)
        span.set_attribute("delegation.output_length", len(result.output))
        span.end()
    except Exception:
        pass


def _fail_delegation_span(span: Any, error: Exception) -> None:
    """Record delegation failure on the OTEL span."""
    try:
        from opentelemetry.trace import StatusCode

        span.set_status(StatusCode.ERROR, str(error))
        span.record_exception(error)
        span.end()
    except Exception:
        pass
