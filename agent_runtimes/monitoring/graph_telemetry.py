# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Graph-level telemetry capability for pydantic-graph execution.

Instruments pydantic-graph execution to emit fine-grained OTEL telemetry
for graph-level processing: steps, joins, decisions, and parallel execution.

Unlike ``AbstractCapability`` hooks (which fire for pydantic-ai *Agent* runs),
graph telemetry tracks node-level execution within a ``pydantic-graph`` Graph.
It produces:

- Per-node OTEL counters/histograms (start, complete, error, duration)
- A graph execution trace (list of node events with timestamps and edges)
- A graph topology snapshot (nodes + edges from the Graph structure)

The trace is stored in a process-global registry keyed by ``agent_id`` so the
monitoring snapshot builder can include it in WebSocket payloads.

Examples
--------
Wrap your graph execution with :func:`run_graph_with_telemetry`::

    from agent_runtimes.monitoring.graph_telemetry import run_graph_with_telemetry

    result = await run_graph_with_telemetry(
        graph=my_graph,
        agent_id="my-agent",
        state=my_state,
        start_node=MyStartNode(),
    )

For the beta graph API, use :func:`run_beta_graph_with_telemetry`.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Process-global graph telemetry registry
# ---------------------------------------------------------------------------

_graph_telemetry_store: dict[str, GraphTelemetryData] = {}


@dataclass
class GraphNodeEvent:
    """A single node execution event in the graph trace."""

    node_id: str
    node_type: str  # e.g. "step", "join", "decision", "end", "start"
    status: str  # "started", "completed", "error"
    timestamp_ms: float
    duration_ms: float | None = None
    inputs: str | None = None  # Stringified summary of inputs
    output: str | None = None  # Stringified summary of output
    error: str | None = None
    parent_node_id: str | None = None  # Previous node in the execution chain


@dataclass
class GraphEdge:
    """An edge in the graph topology."""

    source: str
    target: str
    label: str | None = None
    edge_type: str = "normal"  # "normal", "parallel", "decision", "join"


@dataclass
class GraphTelemetryData:
    """Full graph telemetry data for an agent."""

    agent_id: str
    graph_name: str | None = None
    # Static topology (extracted from graph structure)
    nodes: list[dict[str, Any]] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)
    # Dynamic execution trace
    events: list[dict[str, Any]] = field(default_factory=list)
    # Summary stats
    total_nodes_executed: int = 0
    total_duration_ms: float = 0.0
    last_run_start_ms: float = 0.0
    last_run_end_ms: float = 0.0
    run_count: int = 0


def get_graph_telemetry(agent_id: str) -> GraphTelemetryData | None:
    """Retrieve the latest graph telemetry for an agent."""
    return _graph_telemetry_store.get(agent_id)


def get_graph_telemetry_dict(agent_id: str) -> dict[str, Any] | None:
    """Retrieve graph telemetry as a plain dict (for JSON serialisation)."""
    data = _graph_telemetry_store.get(agent_id)
    if data is None:
        return None
    return {
        "agentId": data.agent_id,
        "graphName": data.graph_name,
        "nodes": data.nodes,
        "edges": data.edges,
        "events": data.events,
        "totalNodesExecuted": data.total_nodes_executed,
        "totalDurationMs": data.total_duration_ms,
        "lastRunStartMs": data.last_run_start_ms,
        "lastRunEndMs": data.last_run_end_ms,
        "runCount": data.run_count,
    }


def clear_graph_telemetry(agent_id: str) -> None:
    """Clear stored graph telemetry for an agent."""
    _graph_telemetry_store.pop(agent_id, None)


# ---------------------------------------------------------------------------
# OTEL emitter helper (mirrors OTelHooksCapability._get_emitter)
# ---------------------------------------------------------------------------


def _get_otel_emitter(service_name: str = "agent-runtimes") -> Any | None:
    """Try to resolve an OTEL emitter for the current request user."""
    try:
        from datalayer_core.otel.emitter import OTelEmitter
    except Exception:
        return None
    try:
        from ..context.identities import get_request_user_jwt
        from ..otel.prompt_turn_metrics import decode_user_uid

        user_jwt = get_request_user_jwt()
        user_uid = decode_user_uid(user_jwt) if user_jwt else None
        if not user_uid:
            return None
        return OTelEmitter(service_name=service_name, user_uid=user_uid, token=user_jwt)
    except Exception:
        return None


def _emit_node_metrics(
    emitter: Any,
    node_id: str,
    event: str,
    duration_ms: float | None = None,
    error_type: str | None = None,
) -> None:
    """Emit OTEL counters/histograms for a graph node event."""
    if emitter is None:
        return
    attrs = {"graph.node.id": node_id}
    if error_type:
        attrs["error.type"] = error_type
    try:
        emitter.add_counter(f"agent_runtimes.graph.node.{event}", 1, attrs)
        if duration_ms is not None:
            emitter.add_histogram(
                "agent_runtimes.graph.node.duration_ms",
                duration_ms,
                attrs,
            )
    except Exception:
        logger.debug("Failed to emit graph OTEL metric for node %s", node_id)


def _emit_run_spans(
    emitter: Any,
    agent_id: str,
    events: list[dict[str, Any]],
    run_start_ms: float,
    run_end_ms: float,
    graph_name: str | None = None,
) -> None:
    """Emit OTEL spans for a completed graph run using datalayer_core OTelEmitter.

    Creates one root span (``agent.graph.run``) covering the entire run and one
    child span per node event (``graph.node.<id>``).  Parent-child relationships
    mirror the ``parentNodeId`` chain recorded during execution so the full
    trace tree is queryable via ``OtelClient.list_traces()`` / ``fetchTraces()``.

    Timestamps are derived from the millisecond values collected during
    execution and converted to OTEL's nanosecond epoch format.

    This is the Python-side OTEL emission — uses ``datalayer_core.otel.OTelEmitter``
    (``emitter._tracer``) directly so no modifications to core are required.
    """
    if not (emitter and getattr(emitter, "enabled", False)):
        return
    tracer = getattr(emitter, "_tracer", None)
    if tracer is None:
        return

    try:
        from opentelemetry import trace as otel_trace

        run_start_ns = int(run_start_ms * 1_000_000)
        run_end_ns = int(run_end_ms * 1_000_000)

        # Root span for the whole graph run.
        root_attrs: dict[str, Any] = {
            "agent.id": agent_id,
            "graph.name": graph_name or agent_id,
            "graph.node.count": len(events),
        }
        root_span = tracer.start_span(
            "agent.graph.run",
            start_time=run_start_ns,
            attributes=root_attrs,
        )
        root_ctx = otel_trace.set_span_in_context(root_span)

        # Per-node child spans — preserve the execution parent chain.
        node_ctx_map: dict[str, Any] = {}
        for event in events:
            node_id = str(event.get("nodeId") or "unknown")
            ts_ms = float(event.get("timestampMs") or run_start_ms)
            dur_ms = float(event.get("durationMs") or 1.0)
            start_ns = int(ts_ms * 1_000_000)
            end_ns = int((ts_ms + max(dur_ms, 0.001)) * 1_000_000)

            parent_node_id = event.get("parentNodeId")
            parent_ctx = (
                node_ctx_map.get(parent_node_id, root_ctx)
                if parent_node_id
                else root_ctx
            )

            node_attrs: dict[str, Any] = {
                "graph.node.id": node_id,
                "graph.node.type": str(event.get("nodeType") or "step"),
                "graph.node.status": str(event.get("status") or "completed"),
                "agent.id": agent_id,
            }
            if event.get("error"):
                node_attrs["error.message"] = str(event["error"])

            node_span = tracer.start_span(
                f"graph.node.{node_id}",
                context=parent_ctx,
                start_time=start_ns,
                attributes=node_attrs,
            )
            node_span.end(end_time=end_ns)
            node_ctx_map[node_id] = otel_trace.set_span_in_context(node_span)

        root_span.end(end_time=run_end_ns)
        logger.debug(
            "[GraphTelemetry] Emitted %d node spans for agent_id=%s",
            len(events),
            agent_id,
        )
    except Exception as exc:
        logger.debug(
            "[GraphTelemetry] Failed to emit run spans for agent_id=%s: %s",
            agent_id,
            exc,
        )


# ---------------------------------------------------------------------------
# Topology extraction helpers
# ---------------------------------------------------------------------------


def _extract_topology_classic(graph: Any) -> tuple[list[dict], list[dict]]:
    """Extract nodes and edges from a classic pydantic-graph Graph."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    node_classes = getattr(graph, "_node_types", None) or getattr(graph, "nodes", [])
    if not node_classes:
        return nodes, edges

    seen_node_ids: set[str] = set()
    for node_cls in node_classes:
        node_name = getattr(node_cls, "__name__", str(node_cls))
        if node_name in seen_node_ids:
            continue
        seen_node_ids.add(node_name)
        nodes.append(
            {
                "id": node_name,
                "name": node_name,
                "category": _classify_node(node_cls),
            }
        )
        # Extract edges from return type annotations
        run_method = getattr(node_cls, "run", None)
        if run_method is None:
            continue
        annotations = getattr(run_method, "__annotations__", {})
        return_type = annotations.get("return")
        if return_type is None:
            continue
        targets = _extract_target_types(return_type)
        for target_name in targets:
            if target_name == "End":
                edges.append(
                    {
                        "source": node_name,
                        "target": "__end__",
                        "label": None,
                        "edgeType": "normal",
                    }
                )
            else:
                edges.append(
                    {
                        "source": node_name,
                        "target": target_name,
                        "label": None,
                        "edgeType": "normal",
                    }
                )

    # Add __end__ node if referenced
    if any(e["target"] == "__end__" for e in edges):
        nodes.append({"id": "__end__", "name": "End", "category": "end"})

    return nodes, edges


def _extract_topology_beta(graph: Any) -> tuple[list[dict], list[dict]]:
    """Extract nodes and edges from a beta pydantic-graph Graph.

    The beta Graph exposes a ``render()`` method that produces Mermaid
    stateDiagram-v2 code.  We parse the Mermaid code to extract nodes
    and edges, which is more reliable than trying to inspect internal
    builder structures.
    """
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    try:
        mermaid_code = graph.render()
    except Exception:
        return nodes, edges

    seen_node_ids: set[str] = set()
    for line in mermaid_code.splitlines():
        line = line.strip()
        if "-->" in line:
            # Parse "A --> B" or "A --> B: label"
            parts = line.split("-->")
            if len(parts) == 2:
                source = parts[0].strip()
                rest = parts[1].strip()
                label = None
                if ":" in rest:
                    target, label = rest.split(":", 1)
                    target = target.strip()
                    label = label.strip()
                else:
                    target = rest
                # Normalise special mermaid symbols
                source = source.replace("[*]", "__start__")
                target = target.replace("[*]", "__end__")
                edges.append(
                    {
                        "source": source,
                        "target": target,
                        "label": label,
                        "edgeType": "normal",
                    }
                )
                for nid in (source, target):
                    if nid not in seen_node_ids:
                        seen_node_ids.add(nid)
                        cat = (
                            "start"
                            if nid == "__start__"
                            else "end"
                            if nid == "__end__"
                            else "step"
                        )
                        nodes.append({"id": nid, "name": nid, "category": cat})

    return nodes, edges


def _classify_node(node_cls: Any) -> str:
    """Return a category string for a classic graph node class."""
    name = getattr(node_cls, "__name__", "")
    # Check if it returns End
    run_method = getattr(node_cls, "run", None)
    if run_method:
        annotations = getattr(run_method, "__annotations__", {})
        return_type = annotations.get("return")
        if return_type is not None:
            type_str = str(return_type)
            if "End" in type_str:
                return "end_or_continue"
    return "step"


def _extract_target_types(return_type: Any) -> list[str]:
    """Extract target node type names from a return annotation.

    Handles ``NodeA | NodeB | End[T]`` unions and plain types.
    """
    targets: list[str] = []
    # Handle typing.Union / X | Y
    args = getattr(return_type, "__args__", None)
    if args:
        for arg in args:
            name = getattr(arg, "__name__", None)
            if name:
                targets.append(name)
            else:
                # End[T] has __origin__ = End
                origin = getattr(arg, "__origin__", None)
                if origin:
                    targets.append(getattr(origin, "__name__", str(origin)))
    else:
        name = getattr(return_type, "__name__", None)
        if name:
            targets.append(name)
    return targets


# ---------------------------------------------------------------------------
# Classic Graph instrumented execution
# ---------------------------------------------------------------------------


async def run_graph_with_telemetry(
    graph: Any,
    agent_id: str,
    *,
    start_node: Any,
    state: Any = None,
    deps: Any = None,
    service_name: str = "agent-runtimes",
    **kwargs: Any,
) -> Any:
    """Run a classic pydantic-graph Graph with OTEL telemetry.

    Uses ``graph.iter()`` to step through execution node-by-node,
    emitting OTEL metrics and building a trace of node events.

    Returns the graph result.
    """
    from pydantic_graph import End

    emitter = _get_otel_emitter(service_name)
    telemetry = _graph_telemetry_store.get(agent_id)
    if telemetry is None:
        telemetry = GraphTelemetryData(agent_id=agent_id)
        _graph_telemetry_store[agent_id] = telemetry

    # Extract topology
    topo_nodes, topo_edges = _extract_topology_classic(graph)
    telemetry.nodes = topo_nodes
    telemetry.edges = topo_edges
    telemetry.graph_name = getattr(graph, "name", None) or graph.__class__.__name__

    run_start = time.perf_counter()
    telemetry.last_run_start_ms = time.time() * 1000

    events: list[dict[str, Any]] = []
    prev_node_id: str | None = None

    iter_kwargs: dict[str, Any] = {}
    if state is not None:
        iter_kwargs["state"] = state
    if deps is not None:
        iter_kwargs["deps"] = deps
    iter_kwargs.update(kwargs)

    try:
        async with graph.iter(start_node, **iter_kwargs) as run:
            async for node in run:
                node_id = type(node).__name__
                is_end = isinstance(node, End)
                if is_end:
                    node_id = "__end__"

                node_start = time.perf_counter()
                _emit_node_metrics(emitter, node_id, "started")

                event: dict[str, Any] = {
                    "nodeId": node_id,
                    "nodeType": "end" if is_end else "step",
                    "status": "completed",
                    "timestampMs": time.time() * 1000,
                    "durationMs": (time.perf_counter() - node_start) * 1000,
                    "parentNodeId": prev_node_id,
                }
                events.append(event)
                _emit_node_metrics(
                    emitter,
                    node_id,
                    "completed",
                    duration_ms=event["durationMs"],
                )
                prev_node_id = node_id

        result = run.result
    except Exception as exc:
        events.append(
            {
                "nodeId": prev_node_id or "__unknown__",
                "nodeType": "error",
                "status": "error",
                "timestampMs": time.time() * 1000,
                "durationMs": None,
                "error": str(exc),
                "parentNodeId": prev_node_id,
            }
        )
        _emit_node_metrics(
            emitter,
            prev_node_id or "__unknown__",
            "error",
            error_type=type(exc).__name__,
        )
        raise
    finally:
        run_end = time.perf_counter()
        telemetry.events = events
        telemetry.total_nodes_executed += len(events)
        telemetry.total_duration_ms += (run_end - run_start) * 1000
        telemetry.last_run_end_ms = time.time() * 1000
        telemetry.run_count += 1

        # Emit OTEL spans (traces) — one root span + per-node child spans.
        # This makes the execution tree queryable via OtelClient.fetchTraces().
        _emit_run_spans(
            emitter,
            agent_id,
            events,
            telemetry.last_run_start_ms,
            telemetry.last_run_end_ms,
            graph_name=telemetry.graph_name,
        )

        # Push monitoring snapshot if possible
        _try_push_snapshot(agent_id)

    return result


# ---------------------------------------------------------------------------
# Beta Graph instrumented execution
# ---------------------------------------------------------------------------


async def run_beta_graph_with_telemetry(
    graph: Any,
    agent_id: str,
    *,
    state: Any = None,
    deps: Any = None,
    inputs: Any = None,
    service_name: str = "agent-runtimes",
    **kwargs: Any,
) -> Any:
    """Run a beta pydantic-graph Graph with OTEL telemetry.

    Uses ``graph.iter()`` to step through execution, emitting OTEL
    metrics and building a trace.

    Returns the graph output.
    """
    emitter = _get_otel_emitter(service_name)
    telemetry = _graph_telemetry_store.get(agent_id)
    if telemetry is None:
        telemetry = GraphTelemetryData(agent_id=agent_id)
        _graph_telemetry_store[agent_id] = telemetry

    # Extract topology from the beta graph
    topo_nodes, topo_edges = _extract_topology_beta(graph)
    telemetry.nodes = topo_nodes
    telemetry.edges = topo_edges
    telemetry.graph_name = getattr(graph, "name", None) or "BetaGraph"

    run_start = time.perf_counter()
    telemetry.last_run_start_ms = time.time() * 1000

    events: list[dict[str, Any]] = []
    prev_node_id: str | None = None

    iter_kwargs: dict[str, Any] = {}
    if state is not None:
        iter_kwargs["state"] = state
    if deps is not None:
        iter_kwargs["deps"] = deps
    if inputs is not None:
        iter_kwargs["inputs"] = inputs
    iter_kwargs.update(kwargs)

    result = None
    try:
        async with graph.iter(**iter_kwargs) as graph_run:
            async for event_item in graph_run:
                node_start = time.perf_counter()

                # Beta graph yields GraphTask or EndMarker objects
                node_id = _extract_beta_node_id(event_item)
                node_type = _classify_beta_event(event_item)

                _emit_node_metrics(emitter, node_id, "started")

                evt: dict[str, Any] = {
                    "nodeId": node_id,
                    "nodeType": node_type,
                    "status": "completed",
                    "timestampMs": time.time() * 1000,
                    "durationMs": (time.perf_counter() - node_start) * 1000,
                    "parentNodeId": prev_node_id,
                }
                events.append(evt)
                _emit_node_metrics(
                    emitter,
                    node_id,
                    "completed",
                    duration_ms=evt["durationMs"],
                )
                prev_node_id = node_id

                if graph_run.output is not None:
                    result = graph_run.output
                    break

        if result is None and hasattr(graph_run, "output"):
            result = graph_run.output
    except Exception as exc:
        events.append(
            {
                "nodeId": prev_node_id or "__unknown__",
                "nodeType": "error",
                "status": "error",
                "timestampMs": time.time() * 1000,
                "durationMs": None,
                "error": str(exc),
                "parentNodeId": prev_node_id,
            }
        )
        _emit_node_metrics(
            emitter,
            prev_node_id or "__unknown__",
            "error",
            error_type=type(exc).__name__,
        )
        raise
    finally:
        run_end = time.perf_counter()
        telemetry.events = events
        telemetry.total_nodes_executed += len(events)
        telemetry.total_duration_ms += (run_end - run_start) * 1000
        telemetry.last_run_end_ms = time.time() * 1000
        telemetry.run_count += 1

        # Emit OTEL spans (traces) — one root span + per-node child spans.
        _emit_run_spans(
            emitter,
            agent_id,
            events,
            telemetry.last_run_start_ms,
            telemetry.last_run_end_ms,
            graph_name=telemetry.graph_name,
        )

        _try_push_snapshot(agent_id)

    return result


def _extract_beta_node_id(event: Any) -> str:
    """Extract node_id from a beta graph iteration event."""
    # GraphTask has .node_id
    if hasattr(event, "node_id"):
        return str(event.node_id)
    # EndMarker
    cls_name = type(event).__name__
    if "End" in cls_name:
        return "__end__"
    # List of GraphTasks
    if isinstance(event, list) and event:
        first = event[0]
        if hasattr(first, "node_id"):
            return str(first.node_id)
    return cls_name


def _classify_beta_event(event: Any) -> str:
    """Classify a beta graph event type."""
    cls_name = type(event).__name__
    if "End" in cls_name:
        return "end"
    if "Join" in cls_name:
        return "join"
    if "Decision" in cls_name:
        return "decision"
    if isinstance(event, list):
        return "parallel"
    return "step"


# ---------------------------------------------------------------------------
# Snapshot push helper
# ---------------------------------------------------------------------------


def _try_push_snapshot(agent_id: str) -> None:
    """Best-effort push of monitoring snapshot after graph execution."""
    try:
        import asyncio

        from ..streams.loop import (
            build_monitoring_snapshot_payload,
            enqueue_stream_message,
        )
        from ..streams.messages import AgentStreamMessage

        async def _push() -> None:
            snapshot = await build_monitoring_snapshot_payload(agent_id)
            msg = AgentStreamMessage.create(
                type="agent.snapshot",
                payload=snapshot.model_dump(by_alias=True),
                agent_id=agent_id,
            )
            enqueue_stream_message(agent_id, msg)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_push())
        except RuntimeError:
            pass
    except Exception:
        logger.debug(
            "[GraphTelemetry] Failed to push snapshot for agent_id=%s",
            agent_id,
        )
