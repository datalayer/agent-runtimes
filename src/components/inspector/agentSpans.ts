/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What agents do in the page, as OpenTelemetry spans: the record the Agent
 * Inspector reads. A turn is an `invoke_agent` span, each tool call an
 * `execute_tool` span under it — the GenAI semantic conventions the runtime's
 * own spans follow (pydantic-ai's): `gen_ai.operation.name`,
 * `gen_ai.agent.name`, `gen_ai.request.model`, `gen_ai.tool.name`,
 * `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments` and `.result` (JSON
 * text), `gen_ai.input.messages` and `gen_ai.output.messages`, the
 * `gen_ai.usage.*` tokens. An agent is a service: `service.name` is its name.
 *
 * Where a tool comes from — an MCP server, the page (a frontend tool), a
 * skill, codemode, the runtime — no convention says: `datalayer.tool.kind`
 * does, beside `gen_ai.tool.type`, with the tool's marks
 * (`datalayer.mark.icon`, `datalayer.mark.emoji`).
 *
 * The tracer is core's (`createOtelLiveTracer`): one a page, shared by its
 * chats and its team (`AgentInspectorProvider`, or the `inspector` prop).
 *
 * @module components/inspector/agentSpans
 */

import {
  createContext,
  createElement,
  useContext,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  createOtelLiveTracer,
  type OtelLiveSpan,
  type OtelLiveTracer,
  type OtelSpanContext,
} from '@datalayer/core/lib/otel/live';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';

/** The attributes the record uses: the GenAI conventions, and a few of Datalayer's. */
export const AGENT_SPAN_ATTRIBUTES = {
  operation: 'gen_ai.operation.name',
  agentName: 'gen_ai.agent.name',
  conversationId: 'gen_ai.conversation.id',
  requestModel: 'gen_ai.request.model',
  inputMessages: 'gen_ai.input.messages',
  outputMessages: 'gen_ai.output.messages',
  inputTokens: 'gen_ai.usage.input_tokens',
  outputTokens: 'gen_ai.usage.output_tokens',
  toolName: 'gen_ai.tool.name',
  toolCallId: 'gen_ai.tool.call.id',
  toolArguments: 'gen_ai.tool.call.arguments',
  toolResult: 'gen_ai.tool.call.result',
  toolType: 'gen_ai.tool.type',
  /** `mcp`, `frontend`, `skill`, `codemode`, `runtime`. */
  toolKind: 'datalayer.tool.kind',
  markIcon: 'datalayer.mark.icon',
  markEmoji: 'datalayer.mark.emoji',
  /** How the page knows of a span another process did: `a2a.status`. */
  origin: 'datalayer.span.origin',
  errorType: 'error.type',
} as const;

const A = AGENT_SPAN_ATTRIBUTES;

/** Where a tool call comes from. */
export type AgentToolKind =
  'mcp' | 'frontend' | 'skill' | 'codemode' | 'runtime';

/** Every kind, in the order the filters list them. */
export const AGENT_TOOL_KINDS: readonly AgentToolKind[] = [
  'mcp',
  'frontend',
  'skill',
  'codemode',
  'runtime',
];

/** What a tool call is: where it comes from, and its marks. */
export type ToolClass = {
  kind: AgentToolKind;
  icon?: string;
  emoji?: string;
};

/** A value as an attribute carries it: JSON text. */
export function jsonAttribute(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A line short enough for a row. */
export function shortLine(text: string, length = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** A call's arguments, in a few words: `kind=customer, limit=100`. */
export function argumentsLine(args: unknown, length = 100): string {
  if (!args || typeof args !== 'object') {
    return args === undefined ? '' : shortLine(String(args), length);
  }
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([key, value]) =>
      `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
  return shortLine(parts.join(', '), length);
}

/** A message in the GenAI conventions' shape: its role and its text part. */
function messages(role: 'user' | 'assistant', text: string): string {
  return JSON.stringify([{ role, parts: [{ type: 'text', content: text }] }]);
}

/** A turn of an agent: from the question to the answer. */
export function startAgentTurn(
  tracer: OtelLiveTracer,
  turn: {
    agent: string;
    prompt: string;
    model?: string;
    conversationId?: string;
  },
): OtelLiveSpan {
  return tracer.startSpan(`invoke_agent ${turn.agent}`, {
    serviceName: turn.agent,
    parent: null,
    attributes: {
      [A.operation]: 'invoke_agent',
      [A.agentName]: turn.agent,
      [A.requestModel]: turn.model || undefined,
      [A.conversationId]: turn.conversationId,
      [A.inputMessages]: messages('user', turn.prompt),
    },
  });
}

/** Token counts, as the AI SDK and the chats say them. */
export type TurnUsage = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
};

/** End a turn: its answer, its tokens, or its error. */
export function endAgentTurn(
  span: OtelLiveSpan,
  outcome: { text?: string; usage?: TurnUsage; error?: string },
): void {
  const usage = outcome.usage;
  span.setAttributes({
    [A.outputMessages]: outcome.text
      ? messages('assistant', outcome.text)
      : undefined,
    [A.inputTokens]: usage?.inputTokens ?? usage?.promptTokens,
    [A.outputTokens]: usage?.outputTokens ?? usage?.completionTokens,
  });
  if (outcome.error) {
    span.setAttribute(A.errorType, 'error');
    span.recordException(new Error(outcome.error));
  } else {
    span.setStatus('OK');
  }
  span.end();
}

/** `gen_ai.tool.type` for a kind: an MCP server's tool is an extension. */
function toolType(kind: AgentToolKind): string {
  return kind === 'mcp' ? 'extension' : 'function';
}

/** A tool call: its name, id, arguments, kind and marks. */
export function startToolCall(
  tracer: OtelLiveTracer,
  call: {
    agent: string;
    name: string;
    id?: string;
    args?: unknown;
    tool: ToolClass;
    /** The span it is part of: the agent's innermost open span unless said. */
    parent?: OtelSpanContext;
    /** How the page knows of it, when another process made it. */
    origin?: string;
  },
): OtelLiveSpan {
  return tracer.startSpan(`execute_tool ${call.name}`, {
    serviceName: call.agent,
    ...(call.parent ? { parent: call.parent } : {}),
    attributes: {
      [A.operation]: 'execute_tool',
      [A.agentName]: call.agent,
      [A.toolName]: call.name,
      [A.toolCallId]: call.id,
      [A.toolArguments]: jsonAttribute(call.args ?? {}),
      [A.toolType]: toolType(call.tool.kind),
      [A.toolKind]: call.tool.kind,
      [A.markIcon]: call.tool.icon,
      [A.markEmoji]: call.tool.emoji,
      [A.origin]: call.origin,
    },
  });
}

/** End a tool call: its result, or its error. */
export function endToolCall(
  span: OtelLiveSpan,
  outcome: { result?: unknown; error?: string },
): void {
  span.setAttribute(A.toolResult, jsonAttribute(outcome.result));
  if (outcome.error) {
    span.setAttribute(A.errorType, 'tool_error');
    span.recordException(new Error(outcome.error));
  } else {
    span.setStatus('OK');
  }
  span.end();
}

/** Where a span comes from, for the Inspector's *Source* filter. */
export function sourceOfSpan(span: OtelSpan): string | undefined {
  const attributes = span.attributes ?? {};
  if (attributes[A.toolKind]) {
    return String(attributes[A.toolKind]);
  }
  if (
    attributes['rpc.service'] === 'a2a' ||
    span.span_name.startsWith('a2a ')
  ) {
    return 'a2a';
  }
  if (attributes[A.operation] === 'invoke_agent') {
    return 'model';
  }
  return undefined;
}

/** A source, in words. */
export const SPAN_SOURCE_LABELS: Record<string, string> = {
  a2a: 'A2A',
  mcp: 'MCP',
  frontend: 'Frontend tool',
  skill: 'Skill',
  codemode: 'Codemode',
  runtime: 'Runtime tool',
  model: 'Model',
};

/** The text of the first message of a GenAI messages attribute. */
function messageText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    const parsed = JSON.parse(value) as {
      parts?: { content?: unknown }[];
    }[];
    return (parsed[0]?.parts ?? [])
      .map(part => (typeof part.content === 'string' ? part.content : ''))
      .join('');
  } catch {
    return '';
  }
}

/** One line that says what a span carried: a call's arguments, a turn's question and answer, a message's words. */
export function describeAgentSpan(span: OtelSpan): string | undefined {
  const attributes = span.attributes ?? {};
  const operation = attributes[A.operation];
  if (operation === 'execute_tool') {
    let args: unknown;
    try {
      args = JSON.parse(String(attributes[A.toolArguments] ?? '{}'));
    } catch {
      args = attributes[A.toolArguments];
    }
    return argumentsLine(args) || undefined;
  }
  if (operation === 'invoke_agent') {
    const asked = messageText(attributes[A.inputMessages]);
    const said = messageText(attributes[A.outputMessages]);
    const input = Number(attributes[A.inputTokens] ?? 0);
    const output = Number(attributes[A.outputTokens] ?? 0);
    const tokens = input + output ? ` · ${input + output} tokens` : '';
    return (
      shortLine(said ? `${shortLine(asked, 60)} → ${said}` : asked) + tokens
    );
  }
  const text = attributes['a2a.message.text'];
  const state = attributes['a2a.task.state'];
  const words = [
    typeof state === 'string' ? stateWord(state) : '',
    typeof text === 'string' ? shortLine(text) : '',
  ].filter(Boolean);
  if (words.length) {
    return words.join(' · ');
  }
  const skills = attributes['a2a.agent.skills'];
  return Array.isArray(skills) ? skills.join(', ') : undefined;
}

/** `TASK_STATE_WORKING` is `working`. */
export function stateWord(state: unknown): string {
  return typeof state === 'string'
    ? state
        .replace(/^TASK_STATE_/, '')
        .toLowerCase()
        .replace(/_/g, ' ')
    : '';
}

/** A tracer for a page, made once (or the one given). */
export function useAgentInspector(given?: OtelLiveTracer | null): {
  tracer: OtelLiveTracer;
} {
  const [own] = useState(
    () => given ?? createOtelLiveTracer({ serviceName: 'Agent' }),
  );
  return { tracer: given ?? own };
}

/** The tracer the chats under it record into. */
export const AgentInspectorContext = createContext<OtelLiveTracer | null>(null);

/** The tracer of the nearest {@link AgentInspectorProvider}, if any. */
export function useAgentInspectorTracer(): OtelLiveTracer | null {
  return useContext(AgentInspectorContext);
}

/** Every chat under it records what its agent does into `tracer`. */
export function AgentInspectorProvider({
  tracer,
  children,
}: {
  tracer: OtelLiveTracer;
  children?: ReactNode;
}): JSX.Element {
  return createElement(
    AgentInspectorContext.Provider,
    { value: tracer },
    children,
  );
}
