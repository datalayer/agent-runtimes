/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2A traffic between two agents, as the Agent Inspector records it: a
 * fetch that hands every request on and records what went (the JSON-RPC
 * request: its method, its message) and what came back — a JSON-RPC
 * response, or each server-sent event of a stream (the task, its status
 * updates, its artifact updates, a message) — with its task, context and
 * state, whole.
 *
 * It sits under the A2A SDK (`ClientFactory`'s `JsonRpcTransportFactory`
 * takes a `fetchImpl`): the SDK reads the response it is handed, and the
 * inspector reads a copy of its body. Nothing it records changes what the
 * SDK sees, and a key sent as a header is never recorded.
 *
 * A peer served by agent-runtimes tells each tool call of its agent on a
 * `working` status (`{tool_call}`, then `{tool_result}`): each call is
 * recorded besides as one entry of its own, the peer's, from its start to
 * its end, linked to the two statuses — an MCP call, a skill, or a tool its
 * runtime runs, by who claims its name. The text chunks of one artifact are
 * one entry, their count kept.
 *
 * {@link linkA2APeerEvent} attaches what the asker made of an event (an
 * `A2APeerEvent`) to the entry it came from.
 *
 * @module components/inspector/a2aInspect
 */

import type { A2APeerEvent } from '../../runtimes/browser/a2aPeer';
import {
  argumentsLine,
  formatBytes,
  jsonBytes,
  shortLine,
  type AgentInspectorEntry,
  type AgentInspectorSink,
  type ToolClass,
} from './agentInspector';

export type A2AInspectOptions = {
  sink: AgentInspectorSink;
  /** The agent that asks: `Sales`. */
  asker: string;
  /** The agent asked: `Accounting`. */
  peer: string;
  /**
   * Where a peer's tool call comes from — an MCP server's, a skill, … — and
   * its mark (`classifyToolCall`, or a team's `teamToolClassifier`).
   * Without it, a tool the peer's runtime runs (`backend-tool`).
   */
  classifyTool?: (name: string, args?: Record<string, unknown>) => ToolClass;
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The text of an A2A 1.0 message's or artifact's parts, as JSON carries them. */
export function partsText(parts: unknown): string {
  return Array.isArray(parts)
    ? parts
        .map(part =>
          isObject(part) && typeof part.text === 'string' ? part.text : '',
        )
        .join('')
    : '';
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

/** A JSON-RPC request's body, if the request carries one. */
function rpcOf(body: unknown): Json | null {
  if (typeof body !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    return isObject(parsed) && parsed.jsonrpc === '2.0' ? parsed : null;
  } catch {
    return null;
  }
}

/** What a request asks, in a line. */
function requestSummary(method: string, params: unknown): string {
  const message = isObject(params) ? params.message : undefined;
  const text = isObject(message) ? partsText(message.parts) : '';
  if (text) {
    return shortLine(text);
  }
  if (isObject(params) && typeof params.id === 'string') {
    return `${method} ${params.id}`;
  }
  return method;
}

/** The step a status message carries: a tool call or its end. */
function stepOf(message: unknown):
  | {
      toolId?: string;
      name: string;
      ended: boolean;
      args?: Record<string, unknown>;
      result?: unknown;
      error?: string;
      note?: string;
    }
  | undefined {
  if (!isObject(message) || !Array.isArray(message.parts)) {
    return undefined;
  }
  for (const part of message.parts) {
    const data = isObject(part) ? part.data : undefined;
    if (!isObject(data)) {
      continue;
    }
    const call = isObject(data.tool_call) ? data.tool_call : undefined;
    const done = isObject(data.tool_result) ? data.tool_result : undefined;
    const told = call ?? done;
    if (told && typeof told.name === 'string') {
      return {
        ...(typeof told.id === 'string' ? { toolId: told.id } : {}),
        name: told.name,
        ended: !call,
        ...(call && isObject(call.arguments)
          ? { args: call.arguments as Record<string, unknown> }
          : {}),
        ...(done && 'result' in done ? { result: done.result } : {}),
        ...(done && done.error ? { error: String(done.error) } : {}),
        ...(typeof told.note === 'string' && told.note
          ? { note: told.note }
          : {}),
      };
    }
  }
  return undefined;
}

/** Records the stream of one request, event by event. */
class StreamRecorder {
  /** The entry of each artifact being streamed, by its id. */
  private artifacts = new Map<
    string,
    { id: string; text: string; events: unknown[] }
  >();

  constructor(
    private readonly options: A2AInspectOptions,
    private readonly method: string,
    private readonly rpcId: string | number | undefined,
  ) {}

  private classify(name: string, args?: Record<string, unknown>): ToolClass {
    return (
      this.options.classifyTool?.(name, args) ?? { source: 'backend-tool' }
    );
  }

  /** One JSON-RPC message of the response: a response, or an event of a stream. */
  record(message: unknown, streamed: boolean): void {
    const { sink, asker, peer } = this.options;
    const direction = { from: peer, to: asker };
    const base = { actor: peer, source: 'a2a' as const, direction };
    if (!isObject(message)) {
      return;
    }
    if (isObject(message.error)) {
      const error = message.error;
      sink.push({
        ...base,
        kind: 'error',
        name: this.method,
        status: 'failed',
        summary: shortLine(
          `${String(error.code ?? '')} ${String(error.message ?? '')}`,
        ),
        error: String(error.message ?? ''),
        a2a: { method: this.method, rpcId: this.rpcId },
        payload: message,
      });
      return;
    }
    const result = isObject(message.result) ? message.result : undefined;
    if (!result) {
      sink.push({
        ...base,
        kind: 'response',
        name: this.method,
        summary: this.method,
        a2a: { method: this.method, rpcId: this.rpcId },
        payload: message,
      });
      return;
    }
    const a2a = { method: this.method, rpcId: this.rpcId };
    if (isObject(result.task)) {
      const task = result.task;
      const status = isObject(task.status) ? task.status : {};
      sink.push({
        ...base,
        kind: 'task',
        summary: `Task ${stateWord(status.state)}`,
        a2a: {
          ...a2a,
          taskId: String(task.id ?? ''),
          contextId: String(task.contextId ?? ''),
          state: String(status.state ?? ''),
        },
        payload: message,
      });
    } else if (isObject(result.statusUpdate)) {
      this.status(result.statusUpdate, message, a2a);
    } else if (isObject(result.artifactUpdate)) {
      this.artifact(result.artifactUpdate, message, a2a);
    } else if (isObject(result.message)) {
      const reply = result.message;
      sink.push({
        ...base,
        kind: 'message',
        summary: shortLine(partsText(reply.parts)) || 'A message',
        a2a: {
          ...a2a,
          taskId: String(reply.taskId ?? ''),
          contextId: String(reply.contextId ?? ''),
        },
        payload: message,
      });
    } else {
      sink.push({
        ...base,
        kind: streamed ? 'event' : 'response',
        summary: this.method,
        a2a,
        payload: message,
      });
    }
  }

  private status(update: Json, message: Json, a2a: Json): void {
    const { sink, asker, peer } = this.options;
    const status = isObject(update.status) ? update.status : {};
    const taskId = String(update.taskId ?? '');
    const state = String(status.state ?? '');
    const step = stepOf(status.message);
    const text = partsText(
      isObject(status.message) ? status.message.parts : undefined,
    );
    const summary = step
      ? step.ended
        ? `${stateWord(state)} · ${step.error ? `${step.name} failed` : `${step.name} returned`}`
        : `${stateWord(state)} · calls ${step.name}(${argumentsLine(step.args)})`
      : `${stateWord(state)}${text ? ` · ${shortLine(text)}` : ''}`;
    const failed = /FAILED|REJECTED|CANCELED/.test(state);
    const id = sink.push({
      actor: peer,
      source: 'a2a',
      direction: { from: peer, to: asker },
      kind: 'status-update',
      summary,
      ...(failed ? { status: 'failed' as const } : {}),
      a2a: {
        ...a2a,
        taskId,
        contextId: String(update.contextId ?? ''),
        state,
        ...(step
          ? {
              step: { toolId: step.toolId, name: step.name, ended: step.ended },
            }
          : {}),
      },
      payload: message,
    });
    if (!step) {
      return;
    }
    // The call, as one entry of its own, the peer's: from its start to its end.
    const key = `a2a:${taskId}:${step.toolId ?? step.name}`;
    if (!step.ended) {
      const kind = this.classify(step.name, step.args);
      sink.start({
        key,
        actor: peer,
        source: kind.source,
        ...(kind.icon ? { icon: kind.icon } : {}),
        ...(kind.emoji ? { emoji: kind.emoji } : {}),
        kind: 'tool-call',
        name: step.name,
        summary: step.note ?? argumentsLine(step.args),
        payload: step.args ?? {},
        links: [id],
      });
    } else if (sink.running(key)) {
      sink.end(key, {
        status: step.error ? 'failed' : 'done',
        result: step.result,
        ...(step.error ? { error: step.error } : {}),
        links: [id],
      });
    }
  }

  private artifact(update: Json, message: Json, a2a: Json): void {
    const { sink, asker, peer } = this.options;
    const artifact = isObject(update.artifact) ? update.artifact : {};
    const artifactId = String(artifact.artifactId ?? '');
    const text = partsText(artifact.parts);
    const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
    const media = parts
      .map(part => (isObject(part) ? part.mediaType : undefined))
      .find(
        type => typeof type === 'string' && type && !type.startsWith('text/'),
      );
    const known = this.artifacts.get(artifactId);
    if (known && update.append && !update.lastChunk) {
      // A chunk of an artifact being streamed: one entry, its text growing.
      known.text += text;
      known.events.push(message);
      const chunks = known.events.length;
      const words = known.text;
      sink.update(known.id, entry => ({
        summary: `${String(artifact.name ?? 'artifact')} · ${shortLine(words)}`,
        payload: [...known.events],
        a2a: { ...entry.a2a, chunks },
      }));
      return;
    }
    const name = String(artifact.name ?? (artifactId || 'artifact'));
    const summary = media
      ? `${name} · ${String(media)}, ${formatBytes(jsonBytes(message))}`
      : `${name} · ${shortLine(text)}`;
    const id = sink.push({
      actor: peer,
      source: 'a2a',
      direction: { from: peer, to: asker },
      kind: 'artifact-update',
      name,
      summary,
      a2a: {
        ...a2a,
        taskId: String(update.taskId ?? ''),
        contextId: String(update.contextId ?? ''),
        artifactId,
        chunks: 1,
      },
      payload: message,
    });
    if (update.append && !update.lastChunk) {
      this.artifacts.set(artifactId, { id, text, events: [message] });
    } else {
      this.artifacts.delete(artifactId);
    }
  }
}

/** The JSON of each event of a server-sent stream, as it arrives. */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) {
      return;
    }
    try {
      onEvent(JSON.parse(data));
    } catch {
      onEvent({ unparsed: data });
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let at: number;
    while ((at = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, at);
      buffer = buffer.slice(at).replace(/^\r?\n\r?\n/, '');
      flush(block);
    }
  }
  if (buffer.trim()) {
    flush(buffer);
  }
}

/**
 * A fetch that records the A2A traffic it carries into `options.sink`, and
 * hands the SDK what the network gave.
 */
export function inspectA2AFetch(
  base: typeof globalThis.fetch,
  options: A2AInspectOptions,
): typeof globalThis.fetch {
  const { sink, asker, peer } = options;
  // What the asker makes of the events (`A2APeerEvent`) is linked to them.
  sink.addLinker(a2aEventLinker);
  return async (input, init) => {
    const rpc = rpcOf(init?.body);
    const method = rpc ? String(rpc.method ?? '') : '';
    const rpcId = rpc ? (rpc.id as string | number | undefined) : undefined;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (rpc) {
      sink.push({
        actor: asker,
        source: 'a2a',
        direction: { from: asker, to: peer },
        kind: 'request',
        name: method,
        summary: requestSummary(method, rpc.params),
        a2a: { method, rpcId },
        payload: rpc,
      });
    }
    let response: Response;
    try {
      response = await base(input, init);
    } catch (reason) {
      sink.push({
        actor: asker,
        source: 'a2a',
        direction: { from: asker, to: peer },
        kind: 'error',
        name: method || undefined,
        status: 'failed',
        summary: shortLine(
          `${method || url}: ${reason instanceof Error ? reason.message : String(reason)}`,
        ),
        error: reason instanceof Error ? reason.message : String(reason),
        a2a: { method, rpcId },
      });
      throw reason;
    }
    const type = response.headers.get('content-type') ?? '';
    const recorder = new StreamRecorder(options, method, rpcId);
    if (!response.ok) {
      const copy = response.clone();
      void copy.text().then(text =>
        sink.push({
          actor: peer,
          source: 'a2a',
          direction: { from: peer, to: asker },
          kind: 'error',
          name: method || undefined,
          status: 'failed',
          summary: shortLine(
            `${response.status} ${response.statusText} ${text}`,
          ),
          error: `${response.status} ${response.statusText}`,
          a2a: { method, rpcId },
          payload: { status: response.status, body: text },
        }),
      );
      return response;
    }
    if (type.includes('text/event-stream') && response.body) {
      const [mine, theirs] = response.body.tee();
      void readEvents(mine, data => recorder.record(data, true)).catch(
        () => undefined,
      );
      return new Response(theirs, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    if (type.includes('json')) {
      const copy = response.clone();
      void copy
        .json()
        .then(data => {
          if (rpc) {
            recorder.record(data, false);
          } else if (isObject(data) && Array.isArray(data.skills)) {
            // The agent card.
            sink.push({
              actor: peer,
              source: 'a2a',
              direction: { from: peer, to: asker },
              kind: 'agent-card',
              name: String(data.name ?? peer),
              summary: shortLine(
                `${String(data.name ?? peer)} · ${data.skills
                  .map(skill =>
                    isObject(skill) ? String(skill.name ?? skill.id) : '',
                  )
                  .join(', ')}`,
              ),
              payload: data,
            });
          }
        })
        .catch(() => undefined);
    }
    return response;
  };
}

/** The entry an event of the asker's came from. */
function matchOf(event: A2APeerEvent): (entry: AgentInspectorEntry) => boolean {
  switch (event.phase) {
    case 'asked':
      return entry =>
        entry.source === 'a2a' &&
        entry.kind === 'request' &&
        /Message/.test(entry.a2a?.method ?? '') &&
        entry.events.length === 0;
    case 'working':
      if (event.tool) {
        const tool = event.tool;
        return entry =>
          entry.kind === 'status-update' &&
          entry.a2a?.taskId === event.taskId &&
          entry.a2a?.step?.name === tool.name &&
          entry.a2a?.step?.ended === tool.ended &&
          (tool.id === undefined || entry.a2a?.step?.toolId === tool.id);
      }
      if (event.note) {
        return entry =>
          entry.kind === 'status-update' &&
          entry.a2a?.taskId === event.taskId &&
          !entry.a2a?.step &&
          entry.events.length === 0;
      }
      return entry =>
        (entry.kind === 'task' || entry.kind === 'status-update') &&
        entry.a2a?.taskId === event.taskId &&
        entry.events.length === 0;
    case 'answered':
      return entry =>
        entry.kind === 'status-update' &&
        entry.a2a?.taskId === event.taskId &&
        entry.a2a?.state === 'TASK_STATE_COMPLETED';
    default:
      return entry =>
        entry.source === 'a2a' && entry.direction?.to !== undefined;
  }
}

/** Whether a value is an `A2APeerEvent`. */
function isPeerEvent(event: unknown): event is A2APeerEvent {
  return (
    isObject(event) &&
    ['asked', 'working', 'answered', 'failed'].includes(String(event.phase))
  );
}

/**
 * The linker the A2A capture adds to its sink: an `A2APeerEvent` noted
 * (`sink.note`) is attached to the entry it came from.
 */
export function a2aEventLinker(
  event: unknown,
): ((entry: AgentInspectorEntry) => boolean) | undefined {
  return isPeerEvent(event) ? matchOf(event) : undefined;
}

/** Attach what the asker made of an event to the A2A entry it came from. */
export function linkA2APeerEvent(
  sink: AgentInspectorSink,
  event: A2APeerEvent,
): void {
  sink.attach(matchOf(event), event);
}
