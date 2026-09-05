/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ContextSnapshotData } from './context';
import type { McpToolsetsStatusResponse } from './mcp';
import type { SkillStatus } from './skills';

export type AgentStreamEventType =
  | 'agent.snapshot'
  | 'agent.subagent'
  | 'agent.compaction'
  | 'tool_approval_created'
  | 'tool_approval_approved'
  | 'tool_approval_rejected';

/** Phase of a streamed history-compaction interaction. */
export type AgentCompactionPhase = 'start' | 'end';

/**
 * History-compaction activity pushed on the agent's monitoring stream when the
 * conversation is summarized to stay under the configured token budget. A
 * `start` event precedes summarization; the matching `end` event reports the
 * before/after token and message counts plus the elapsed time.
 */
export interface AgentStreamCompactionPayload {
  /** Interaction phase. */
  phase: AgentCompactionPhase;
  /** Token ceiling driving compaction. */
  budget: number;
  /** Estimated history tokens before compaction. */
  beforeTokens: number;
  /** Estimated history tokens after compaction (`end`). */
  afterTokens?: number;
  /** Message count before compaction. */
  beforeMessages: number;
  /** Message count after compaction (`end`). */
  afterMessages?: number;
  /** Elapsed summarization time in milliseconds (`end`). */
  durationMs?: number;
  /** Cumulative number of compactions performed (`end`). */
  compactionCount?: number;
  /** Whether history was actually reduced (`end`). */
  reduced?: boolean;
}

/**
 * Phase of a streamed subagent interaction.
 *
 * `status` is the remote side of a delegation talking: an agent reached over
 * A2A being launched, its task submitted, working, completed. It renders no
 * text; it tells a sidebar where the run stands.
 */
export type AgentSubagentPhase =
  | 'start'
  | 'status'
  | 'text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'end'
  | 'error';

/**
 * Incremental subagent activity pushed on the parent agent's monitoring
 * stream while a `delegate_task` call runs. Consumers key events by
 * `toolCallId` (the parent delegation tool call) to render a live timeline.
 */
export interface AgentStreamSubagentPayload {
  /** Name of the subagent producing the activity. */
  subagentName: string;
  /** Parent `delegate_task` tool call id, when resolvable. */
  toolCallId?: string | null;
  /** Interaction phase. */
  phase: AgentSubagentPhase;
  /** Delegated task description (`start`). */
  task?: string;
  /** Text or thinking delta (`text` / `thinking`). */
  text?: string;
  /** Tool name (`tool_call` / `tool_result`). */
  toolName?: string;
  /** Tool call arguments (`tool_call`). */
  toolArgs?: Record<string, unknown>;
  /** Tool result preview (`tool_result`). */
  result?: string;
  /** Final subagent output (`end`). */
  output?: string;
  /** Failure message (`error`). */
  error?: string;
  /**
   * How the subagent is reached: inside the parent's process, or over A2A as
   * a separate agent. Absent means in-process.
   */
  transport?: 'in-process' | 'a2a';
  /** Where the A2A agent answers (`transport: 'a2a'`). */
  url?: string;
  /**
   * Where an A2A agent runs: `local` (launched beside the parent), `cloud`
   * (a Datalayer runtime launched for it), `remote` (given by URL), or the
   * `auto` a spec asked for before the choice was made.
   */
  launch?: string;
  /** The A2A task id, once the remote agent has one (`status`). */
  taskId?: string | null;
  /**
   * Where a remote run stands (`status`): `launching`, `ready`, then the A2A
   * task states — `submitted`, `working`, `completed`, `failed`, …
   */
  state?: string;
  /** The remote agent's card, summarised. */
  agentCard?: {
    name?: string;
    description?: string;
    version?: string;
    url?: string;
    skills?: string[];
  };
  /** Uid of the runtime launched for a cloud A2A agent. */
  runtimeUid?: string;
  /** Delegation depth, `0` for a top-level delegation (server harness). */
  depth?: number;
  /** The delegation stack, the running subagent last (server harness). */
  chain?: string[];
}

export interface AgentStreamMessage<TPayload = Record<string, unknown>> {
  version: string;
  type: AgentStreamEventType | string;
  agentId?: string;
  timestamp: string;
  payload: TPayload;
  // Backward compatibility with existing consumers.
  event?: string;
  data?: unknown;
}

export interface AgentStreamToolApprovalPayload {
  id: string;
  agent_id?: string;
  runtime_name?: string;
  tool_name: string;
  tool_call_id?: string;
  tool_args?: Record<string, unknown>;
  status?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AgentStreamSnapshotPayload {
  agentId?: string;
  approvals: AgentStreamToolApprovalPayload[];
  pendingApprovalCount: number;
  contextSnapshot?: ContextSnapshotData | null;
  costUsage?: ContextSnapshotData['costUsage'];
  mcpStatus?: McpToolsetsStatusResponse | null;
  codemodeStatus?: CodemodeStatusData | null;
  fullContext?: Record<string, unknown> | null;
  graphTelemetry?: GraphTelemetryData | null;
}

/** Graph-level telemetry data from pydantic-graph execution. */
export interface GraphTelemetryData {
  agentId?: string;
  graphName?: string | null;
  /** Static topology: graph node definitions. */
  nodes: GraphTelemetryNode[];
  /** Static topology: edges between nodes. */
  edges: GraphTelemetryEdge[];
  /** Dynamic execution trace: per-node events. */
  events: GraphNodeEvent[];
  totalNodesExecuted: number;
  totalDurationMs: number;
  lastRunStartMs: number;
  lastRunEndMs: number;
  runCount: number;
}

export interface GraphTelemetryNode {
  id: string;
  name: string;
  category: string; // "step" | "end" | "start" | "join" | "decision" | "end_or_continue"
}

export interface GraphTelemetryEdge {
  source: string;
  target: string;
  label?: string | null;
  edgeType: string; // "normal" | "parallel" | "decision" | "join"
}

export interface GraphNodeEvent {
  nodeId: string;
  nodeType: string; // "step" | "end" | "join" | "decision" | "parallel" | "error"
  status: string; // "started" | "completed" | "error"
  timestampMs: number;
  durationMs?: number | null;
  parentNodeId?: string | null;
  error?: string | null;
}

/** Codemode status as pushed via the monitoring WebSocket. */
export interface CodemodeStatusData {
  enabled: boolean;
  skills: Array<{
    id?: string;
    name: string;
    description?: string;
    tags?: string[];
    has_scripts?: boolean;
    has_resources?: boolean;
    status?: SkillStatus;
    approved?: boolean;
    skill_definition?: string | null;
    source_variant?: 'module' | 'package' | 'path' | 'unknown';
    module?: string;
    package?: string;
    method?: string;
    path?: string;
  }>;
  available_skills: Array<{
    id?: string;
    name: string;
    description?: string;
    tags?: string[];
    has_scripts?: boolean;
    has_resources?: boolean;
    status?: SkillStatus;
    approved?: boolean;
    skill_definition?: string | null;
    source_variant?: 'module' | 'package' | 'path' | 'unknown';
    module?: string;
    package?: string;
    method?: string;
    path?: string;
  }>;
  sandbox?: Record<string, unknown> | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

export function parseAgentStreamMessage(
  raw: unknown,
): AgentStreamMessage | null {
  if (!isObject(raw)) {
    return null;
  }

  // New envelope format.
  if (typeof raw.type === 'string' && isObject(raw.payload)) {
    return {
      version: typeof raw.version === 'string' ? raw.version : '1.0',
      type: raw.type,
      agentId: typeof raw.agentId === 'string' ? raw.agentId : undefined,
      timestamp:
        typeof raw.timestamp === 'string'
          ? raw.timestamp
          : new Date().toISOString(),
      payload: raw.payload,
      event: typeof raw.event === 'string' ? raw.event : undefined,
      data: raw.data,
    };
  }

  // Legacy event/data format.
  if (typeof raw.event === 'string' && isObject(raw.data)) {
    return {
      version: '1.0',
      type: raw.event,
      timestamp: new Date().toISOString(),
      payload: raw.data,
      event: raw.event,
      data: raw.data,
    };
  }

  return null;
}
