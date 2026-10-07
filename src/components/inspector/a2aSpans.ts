/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2A traffic between two agents, as OpenTelemetry spans: a fetch that
 * hands every request on and records each JSON-RPC request as a client span
 * of the asker's — `a2a <method>`, with the RPC conventions (`rpc.system`
 * `jsonrpc`, `rpc.service` `a2a`, `rpc.method`, `rpc.jsonrpc.request_id`),
 * the agent asked as `peer.service`, the request whole (`a2a.request`) and
 * its words (`a2a.message.text`) — and what came back as its events: a
 * JSON-RPC response, or each server-sent event of a stream (`a2a.task`,
 * `a2a.status_update`, `a2a.artifact_update`, `a2a.message`, `a2a.error`),
 * each with its task, context and state, and the event whole (`a2a.event`).
 * The text chunks of one artifact are one event, their count kept.
 *
 * Any other request (the agent card) is a client span too: `a2a agent card`
 * when it brings one back, its name and skills with it.
 *
 * A peer served by agent-runtimes tells each tool call of its agent on a
 * `working` status (`{tool_call}`, then `{tool_result}`): each is recorded as
 * an `execute_tool` span of the peer's under the request's span, from its
 * start to its end, an MCP call, a skill, codemode's or a tool its runtime
 * runs, by who claims its name (`datalayer.span.origin` `a2a.status`: the
 * page knows of it from the peer's own words).
 *
 * It sits under the A2A SDK (`ClientFactory`'s `JsonRpcTransportFactory`
 * takes a `fetchImpl`): the SDK reads the response it is handed, and this
 * reads a copy of its body. Nothing it records changes what the SDK sees,
 * and a key sent as a header is never recorded.
 *
 * @module components/inspector/a2aSpans
 */

import type {
  OtelAttributes,
  OtelLiveSpan,
  OtelLiveTracer,
} from '@datalayer/core/lib/otel/live';
import {
  endToolCall,
  jsonAttribute,
  shortLine,
  startToolCall,
  type ToolClass,
} from './agentSpans';

export type A2ASpansOptions = {
  tracer: OtelLiveTracer;
  /** The agent that asks: `Sales`. */
  asker: string;
  /** The agent asked: `Accounting`. */
  peer: string;
  /**
   * Where a peer's tool call comes from — an MCP server's, a skill, … — and
   * its marks (`classifyToolCall`, or a team's `teamToolClassifier`).
   * Without it, a tool the peer's runtime runs.
   */
  classifyTool?: (name: string, args?: Record<string, unknown>) => ToolClass;
  /**
   * Who presses the buttons of what the peer shows: a request carrying a
   * pressed button's action (`loop.action` in its message's metadata) is
   * theirs, not the asker's — the person (`You`) on a page that draws the
   * surfaces (STUDIO H-02). Unsaid, every request is the asker's.
   */
  pressedBy?: string;
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

/** The step a status message carries: a tool call or its end. */
function stepOf(message: unknown):
  | {
      toolId?: string;
      name: string;
      ended: boolean;
      args?: Record<string, unknown>;
      result?: unknown;
      error?: string;
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
      };
    }
  }
  return undefined;
}

/** Whether a message carries a pressed button's action: `metadata.loop.action`. */
export function pressedAction(message: unknown): boolean {
  if (!isObject(message) || !isObject(message.metadata)) {
    return false;
  }
  const loop = message.metadata.loop;
  return isObject(loop) && isObject(loop.action);
}

const FAILED_STATES = /FAILED|REJECTED|CANCELED/;

/** Records what came back for one request onto its span. */
class ResponseRecorder {
  /** The chunks of each artifact being streamed, by its id. */
  private artifacts = new Map<
    string,
    {
      name: string;
      text: string;
      events: unknown[];
      attributes: OtelAttributes;
    }
  >();
  /** The peer's tool calls still open, by task and call. */
  private calls = new Map<string, OtelLiveSpan>();

  constructor(
    private readonly options: A2ASpansOptions,
    private readonly span: OtelLiveSpan,
  ) {}

  /** One JSON-RPC message of the response: a response, or an event of a stream. */
  record(message: unknown, streamed: boolean): void {
    if (!isObject(message)) {
      return;
    }
    const whole = { 'a2a.event': jsonAttribute(message) };
    if (isObject(message.error)) {
      const error = message.error;
      const words =
        `${String(error.code ?? '')} ${String(error.message ?? '')}`.trim();
      this.span.addEvent('a2a.error', { ...whole, 'a2a.error': words });
      this.span.setStatus('ERROR', words);
      return;
    }
    const result = isObject(message.result) ? message.result : undefined;
    if (!result) {
      this.span.addEvent('a2a.response', whole);
      return;
    }
    if (isObject(result.task)) {
      const task = result.task;
      const status = isObject(task.status) ? task.status : {};
      this.task(
        String(task.id ?? ''),
        String(task.contextId ?? ''),
        String(status.state ?? ''),
      );
      this.span.addEvent('a2a.task', {
        ...whole,
        'a2a.task.id': String(task.id ?? ''),
        'a2a.context.id': String(task.contextId ?? ''),
        'a2a.task.state': String(status.state ?? ''),
      });
    } else if (isObject(result.statusUpdate)) {
      this.status(result.statusUpdate, whole);
    } else if (isObject(result.artifactUpdate)) {
      this.artifact(result.artifactUpdate, message);
    } else if (isObject(result.message)) {
      const reply = result.message;
      const text = partsText(reply.parts);
      this.span.addEvent('a2a.message', {
        ...whole,
        'a2a.task.id': String(reply.taskId ?? ''),
        'a2a.context.id': String(reply.contextId ?? ''),
        'a2a.message.text': text,
      });
      this.span.setAttribute('a2a.answer.text', text || undefined);
    } else {
      this.span.addEvent(streamed ? 'a2a.event' : 'a2a.response', whole);
    }
  }

  /** The task the span is about, and its latest state. */
  private task(taskId: string, contextId: string, state: string): void {
    this.span.setAttributes({
      'a2a.task.id': taskId || undefined,
      'a2a.context.id': contextId || undefined,
      'a2a.task.state': state || undefined,
    });
    if (FAILED_STATES.test(state)) {
      this.span.setStatus('ERROR', state);
    }
  }

  private status(update: Json, whole: OtelAttributes): void {
    const status = isObject(update.status) ? update.status : {};
    const taskId = String(update.taskId ?? '');
    const state = String(status.state ?? '');
    const step = stepOf(status.message);
    const text = partsText(
      isObject(status.message) ? status.message.parts : undefined,
    );
    this.task(taskId, String(update.contextId ?? ''), state);
    this.span.addEvent('a2a.status_update', {
      ...whole,
      'a2a.task.id': taskId,
      'a2a.context.id': String(update.contextId ?? ''),
      'a2a.task.state': state,
      'a2a.message.text': text || undefined,
      'gen_ai.tool.name': step?.name,
      'gen_ai.tool.call.id': step?.toolId,
    });
    if (!step) {
      return;
    }
    // The call, as a span of the peer's: from its start to its end.
    const key = `${taskId}:${step.toolId ?? step.name}`;
    if (!step.ended) {
      if (this.calls.has(key)) {
        return;
      }
      const { peer, classifyTool } = this.options;
      this.calls.set(
        key,
        startToolCall(this.options.tracer, {
          agent: peer,
          name: step.name,
          id: step.toolId,
          args: step.args ?? {},
          tool: classifyTool?.(step.name, step.args) ?? { kind: 'runtime' },
          parent: this.span.context,
          origin: 'a2a.status',
        }),
      );
      return;
    }
    const call = this.calls.get(key);
    if (call) {
      this.calls.delete(key);
      endToolCall(call, { result: step.result, error: step.error });
    }
  }

  private artifact(update: Json, message: Json): void {
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
    const chunk = known ?? {
      name: String(artifact.name ?? (artifactId || 'artifact')),
      text: '',
      events: [],
      attributes: {
        'a2a.task.id': String(update.taskId ?? ''),
        'a2a.context.id': String(update.contextId ?? ''),
        'a2a.artifact.id': artifactId,
        'a2a.artifact.name': String(
          artifact.name ?? (artifactId || 'artifact'),
        ),
        'a2a.artifact.media_type':
          typeof media === 'string' ? media : undefined,
      },
    };
    chunk.text += text;
    chunk.events.push(message);
    if (update.append && !update.lastChunk) {
      // A chunk of an artifact being streamed: one event once it is whole.
      this.artifacts.set(artifactId, chunk);
      return;
    }
    this.artifacts.delete(artifactId);
    this.emitArtifact(chunk);
  }

  private emitArtifact(chunk: {
    text: string;
    events: unknown[];
    attributes: OtelAttributes;
  }): void {
    this.span.addEvent('a2a.artifact_update', {
      ...chunk.attributes,
      'a2a.artifact.chunks': chunk.events.length,
      'a2a.message.text': chunk.text ? shortLine(chunk.text, 2000) : undefined,
      'a2a.event': jsonAttribute(
        chunk.events.length === 1 ? chunk.events[0] : chunk.events,
      ),
    });
  }

  /** The response is over: what is still open is closed with it. */
  finish(error?: unknown): void {
    for (const chunk of this.artifacts.values()) {
      this.emitArtifact(chunk);
    }
    this.artifacts.clear();
    for (const call of this.calls.values()) {
      call.end();
    }
    this.calls.clear();
    if (error !== undefined) {
      this.span.recordException(error);
    }
    this.span.end();
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
 * A fetch that records the A2A traffic it carries as spans into
 * `options.tracer`, and hands the SDK what the network gave.
 */
export function traceA2AFetch(
  base: typeof globalThis.fetch,
  options: A2ASpansOptions,
): typeof globalThis.fetch {
  const { tracer, asker, peer } = options;
  return async (input, init) => {
    const rpc = rpcOf(init?.body);
    const method = rpc ? String(rpc.method ?? '') : '';
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const httpMethod = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    let path = url;
    try {
      path = new URL(url, globalThis.location?.href).pathname;
    } catch {
      // A URL the page cannot read: said whole.
    }
    const params = rpc && isObject(rpc.params) ? rpc.params : undefined;
    const message =
      params && isObject(params.message) ? params.message : undefined;
    const span = tracer.startSpan(
      rpc ? `a2a ${method}` : `${httpMethod} ${path}`,
      {
        serviceName:
          options.pressedBy && pressedAction(message)
            ? options.pressedBy
            : asker,
        kind: 'CLIENT',
        attributes: {
          'peer.service': peer,
          'url.full': url,
          'http.request.method': httpMethod,
          ...(rpc
            ? {
                'rpc.system': 'jsonrpc',
                'rpc.service': 'a2a',
                'rpc.method': method,
                'rpc.jsonrpc.version': '2.0',
                'rpc.jsonrpc.request_id':
                  rpc.id === undefined ? undefined : String(rpc.id),
                'a2a.request': jsonAttribute(rpc),
                'a2a.message.text': message
                  ? partsText(message.parts) || undefined
                  : undefined,
                'a2a.task.id':
                  typeof params?.id === 'string' ? params.id : undefined,
              }
            : {}),
        },
      },
    );
    const recorder = new ResponseRecorder(options, span);
    let response: Response;
    try {
      response = await base(input, init);
    } catch (reason) {
      recorder.finish(reason);
      throw reason;
    }
    span.setAttribute('http.response.status_code', response.status);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      void response
        .clone()
        .text()
        .then(text => {
          span.setAttribute('a2a.error', shortLine(text, 2000) || undefined);
          span.setAttribute('error.type', String(response.status));
          recorder.finish(
            new Error(`${response.status} ${response.statusText}`.trim()),
          );
        })
        .catch(reason => recorder.finish(reason));
      return response;
    }
    if (type.includes('text/event-stream') && response.body) {
      const [mine, theirs] = response.body.tee();
      void readEvents(mine, data => recorder.record(data, true))
        .then(() => recorder.finish())
        .catch(reason => recorder.finish(reason));
      return new Response(theirs, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    if (type.includes('json')) {
      void response
        .clone()
        .json()
        .then(data => {
          if (rpc) {
            recorder.record(data, false);
          } else if (isObject(data) && Array.isArray(data.skills)) {
            // The agent card.
            span.updateName('a2a agent card');
            span.setAttributes({
              'rpc.service': 'a2a',
              'a2a.agent.name': String(data.name ?? peer),
              'a2a.agent.skills': data.skills.map(skill =>
                isObject(skill) ? String(skill.name ?? skill.id) : '',
              ),
              'a2a.agent_card': jsonAttribute(data),
            });
          }
          recorder.finish();
        })
        .catch(reason => recorder.finish(reason));
      return response;
    }
    recorder.finish();
    return response;
  };
}
