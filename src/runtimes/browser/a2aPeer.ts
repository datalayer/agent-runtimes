/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Another application, asked over A2A from an agent whose loop turns in the page.
 *
 * A team of applications says who asks whom (agentspecs `teams`, `talks_to`
 * over `a2a`). The application asked is served on a runtime with fasta2a; the
 * one that asks may run here, in the browser, and asks with the A2A SDK
 * (`@a2a-js/sdk` 1.x) itself, with no wrapper of ours between them:
 *
 * - {@link connectA2APeer} reads the peer's agent card and makes a client
 *   from it. The card says where to send a request, what to ask (its skill:
 *   description, examples, text in, text out) and that a key is needed.
 * - {@link a2aPeerTool} is the tool the asking agent calls. It takes one
 *   request in words, as the skill does, streams the task and returns the
 *   peer's answer in words. Each step is told to {@link A2APeerEvent} as it
 *   happens, so a page can show the exchange: asked, working, answered.
 *
 * The key goes as a bearer token on every request, the card's too. The
 * runtime hands it to the peer's run, which then reaches the peer's
 * connections with it and with nothing broader.
 *
 * @module runtimes/browser/a2aPeer
 */

import {
  Role,
  TaskState,
  type AgentCard,
  type AgentSkill,
  type Message,
  type Part,
  type StreamResponse,
} from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  type Client,
} from '@a2a-js/sdk/client';
import { jsonSchema, tool, type Tool } from 'ai';

/** Where an A2A agent's card is, under the address it is served at. */
export const AGENT_CARD_PATH = '.well-known/agent-card.json';

/** A peer reached over A2A: its client, its card, and the skill it is asked for. */
export type A2APeer = {
  client: Client;
  card: AgentCard;
  skill: AgentSkill;
};

export type ConnectA2APeerOptions = {
  /** Where the peer is served: `…/api/v1/a2a/agents/<application id>`. */
  url: string;
  /** A key granted to the peer's route, sent as a bearer token. */
  key?: string;
  /** The fetch to use, for tests and hosts that wrap the network. */
  fetch?: typeof globalThis.fetch;
};

/** A fetch that sends the key as a bearer token, beside the caller's headers. */
function withKey(
  base: typeof globalThis.fetch,
  key: string | undefined,
): typeof globalThis.fetch {
  if (!key) {
    return base;
  }
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${key}`);
    return base(input, { ...init, headers });
  };
}

/**
 * Read a peer's agent card and make a client from it.
 *
 * The card's first skill is what the peer is asked for: a peer served from an
 * application has one, named for it.
 */
export async function connectA2APeer(
  options: ConnectA2APeerOptions,
): Promise<A2APeer> {
  const base = options.fetch ?? globalThis.fetch.bind(globalThis);
  const fetchImpl = withKey(base, options.key);
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl })],
      cardResolver: new DefaultAgentCardResolver({ fetchImpl }),
    }),
  );
  const root = options.url.replace(/\/+$/, '');
  // The full address of the card, with an empty path: the resolver's default
  // path would replace the peer's own path rather than extend it.
  const client = await factory.createFromUrl(`${root}/${AGENT_CARD_PATH}`, '');
  const card = await client.getAgentCard();
  const [skill] = card.skills;
  if (!skill) {
    throw new Error(
      `${card.name || root} offers no skill on its agent card: there is nothing to ask it.`,
    );
  }
  return { client, card, skill };
}

/** What happens to one request, as it happens. */
export type A2APeerEvent =
  | { phase: 'asked'; request: string }
  | { phase: 'working'; taskId: string; note?: string }
  | { phase: 'answered'; taskId: string; answer: string }
  | { phase: 'failed'; error: string };

/** The text of a message's or an artifact's parts. */
export function textOf(parts: Part[] | undefined): string {
  return (parts ?? [])
    .map(part => (part.content?.$case === 'text' ? part.content.value : ''))
    .join('');
}

/** A user's message of one text part, as the SDK's 1.x types write it. */
export function textMessage(text: string): Message {
  return {
    messageId: globalThis.crypto.randomUUID(),
    contextId: '',
    taskId: '',
    role: Role.ROLE_USER,
    parts: [
      {
        content: { $case: 'text', value: text },
        metadata: undefined,
        filename: '',
        mediaType: '',
      },
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

/** What a tool call or a tool result says while the peer works, in a few words. */
function noteOf(message: Message | undefined): string | undefined {
  for (const part of message?.parts ?? []) {
    const content = part.content;
    if (content?.$case === 'text' && content.value.trim()) {
      return content.value;
    }
    if (content?.$case === 'data' && content.value) {
      // What the runtime's A2A worker publishes while its agent works.
      const data = content.value as {
        tool_call?: { name?: string };
        tool_result?: { name?: string };
      };
      const name = (data.tool_call ?? data.tool_result)?.name;
      if (name) {
        return data.tool_call ? `Calling ${name}` : `Read ${name}`;
      }
    }
  }
  return undefined;
}

const ENDED_BADLY: Partial<Record<TaskState, string>> = {
  [TaskState.TASK_STATE_FAILED]: 'failed',
  [TaskState.TASK_STATE_CANCELED]: 'was canceled',
  [TaskState.TASK_STATE_REJECTED]: 'was rejected',
  [TaskState.TASK_STATE_AUTH_REQUIRED]: 'asks for a key it was not given',
  [TaskState.TASK_STATE_INPUT_REQUIRED]: 'asks for more than it was told',
};

/**
 * Ask a peer once, streaming the task, and return its answer.
 *
 * The answer is the text of the task's artifact, assembled from its chunks,
 * or the final status message's when there is no artifact. A task that ends
 * other than completed is thrown, with what the peer said.
 */
export async function askA2APeer(
  peer: A2APeer,
  request: string,
  options: {
    signal?: AbortSignal;
    onEvent?: (event: A2APeerEvent) => void;
  } = {},
): Promise<string> {
  const { signal, onEvent } = options;
  onEvent?.({ phase: 'asked', request });
  try {
    return await streamTask(peer, request, signal, onEvent);
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : String(reason);
    onEvent?.({ phase: 'failed', error });
    throw reason;
  }
}

async function streamTask(
  peer: A2APeer,
  request: string,
  signal: AbortSignal | undefined,
  onEvent: ((event: A2APeerEvent) => void) | undefined,
): Promise<string> {
  const artifacts = new Map<string, string>();
  let taskId = '';
  let final = '';
  let ended: TaskState | undefined;
  const stream = peer.client.sendMessageStream(
    {
      tenant: '',
      message: textMessage(request),
      configuration: undefined,
      metadata: undefined,
    },
    { signal },
  );
  for await (const event of stream as AsyncIterable<StreamResponse>) {
    const payload = event.payload;
    if (!payload) {
      continue;
    }
    if (payload.$case === 'task') {
      taskId = payload.value.id;
      onEvent?.({ phase: 'working', taskId });
    } else if (payload.$case === 'statusUpdate') {
      const status = payload.value.status;
      taskId = payload.value.taskId || taskId;
      if (status?.state === TaskState.TASK_STATE_WORKING) {
        onEvent?.({ phase: 'working', taskId, note: noteOf(status.message) });
      } else if (status) {
        ended = status.state;
        final = textOf(status.message?.parts) || final;
      }
    } else if (payload.$case === 'artifactUpdate') {
      const artifact = payload.value.artifact;
      if (artifact) {
        const text = textOf(artifact.parts);
        const before = artifacts.get(artifact.artifactId) ?? '';
        // Chunks are appended; the last chunk carries the whole answer again.
        artifacts.set(
          artifact.artifactId,
          payload.value.append && !payload.value.lastChunk
            ? before + text
            : text,
        );
      }
    } else if (payload.$case === 'message') {
      final = textOf(payload.value.parts);
      ended = TaskState.TASK_STATE_COMPLETED;
    }
  }
  if (ended !== TaskState.TASK_STATE_COMPLETED) {
    const how =
      (ended !== undefined && ENDED_BADLY[ended]) || 'ended without an answer';
    throw new Error(`${peer.card.name} ${how}${final ? `: ${final}` : '.'}`);
  }
  const answer = [...artifacts.values()].join('\n') || final;
  onEvent?.({ phase: 'answered', taskId, answer });
  return answer;
}

export type A2APeerToolOptions = {
  peer: A2APeer;
  /** Told each step of each request, as it happens. */
  onEvent?: (event: A2APeerEvent) => void;
};

/** The input of a peer's tool: one request, in words, as its skill takes it. */
const REQUEST_SCHEMA = {
  type: 'object',
  properties: {
    request: {
      type: 'string',
      description:
        'What to ask, in one request that can be acted on without the rest of this conversation.',
    },
  },
  required: ['request'],
} as const;

/** The tool's description: the peer's skill, and what it may be asked. */
export function peerToolDescription(peer: A2APeer): string {
  const { card, skill } = peer;
  const examples = skill.examples.length
    ? ` For example: ${skill.examples.map(example => `"${example}"`).join('; ')}.`
    : '';
  return `Ask ${card.name}, over A2A: ${skill.description}${examples} It answers in words; report its answer as it gave it.`;
}

/**
 * The tool an agent asks its peer with: a request in, the peer's answer out.
 *
 * A failed request is returned rather than thrown, so the agent can tell the
 * person what the peer said instead of the whole run failing.
 */
export function a2aPeerTool(options: A2APeerToolOptions): Tool {
  const { peer, onEvent } = options;
  return tool({
    description: peerToolDescription(peer),
    inputSchema: jsonSchema(REQUEST_SCHEMA as never),
    execute: async (input, execution) => {
      const { request } = (input ?? {}) as { request?: string };
      if (!request?.trim()) {
        return { error: `A request to ${peer.card.name} says what it asks.` };
      }
      try {
        const answer = await askA2APeer(peer, request, {
          signal: execution?.abortSignal,
          onEvent,
        });
        return { answer };
      } catch (reason) {
        return {
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
    },
  });
}
