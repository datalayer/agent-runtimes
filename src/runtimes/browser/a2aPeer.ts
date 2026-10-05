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
 * **Output formats.** A peer's card says the media types it answers in (its
 * skill's `outputModes`). The asker says which it accepts with each request
 * (`acceptedOutputModes`, {@link AskA2APeerOptions.accept}); what the peer
 * gives besides words — a Jupyter notebook, `application/x-ipynb+json` —
 * arrives as artifacts, one part of a media type each, and is handed over on
 * `answered` as {@link A2APeerArtifact}s, whatever their format.
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

/**
 * A tool the peer calls while it works, as its runtime tells it: the call,
 * then its end (`ended`), the two sharing the call's id.
 */
export type A2APeerToolStep = {
  /** The call's id, when the runtime gives one: its end has the same. */
  id?: string;
  name: string;
  /** Whether this is the call's end rather than its start. */
  ended: boolean;
  /** Why it failed, when it did. */
  error?: string;
};

/** The media types an answer in words comes in: the answer itself, never an artifact of its own. */
export const TEXT_MEDIA_TYPES: readonly string[] = [
  'text/plain',
  'text/markdown',
];

/** A Jupyter notebook, as A2A carries it. */
export const NOTEBOOK_MEDIA_TYPE = 'application/x-ipynb+json';

/** What a format is, in words, for a model reading a tool's description. */
const FORMAT_NAMES: Record<string, string> = {
  [NOTEBOOK_MEDIA_TYPE]: 'a Jupyter notebook',
};

/**
 * What a peer gave besides words: one part of an artifact, by its media type.
 *
 * `data` is the part's structured data (a notebook is its nbformat document),
 * a JSON file's bytes read as JSON, other bytes as they came, or a URL.
 */
export type A2APeerArtifact = {
  mediaType: string;
  /** The artifact's name: what it is, in a few words. */
  name: string;
  /** The file it would be saved as, when the peer named one. */
  filename?: string;
  data: unknown;
};

/** A peer's answer: its words, and what it gave besides them. */
export type A2APeerAnswer = { answer: string; artifacts: A2APeerArtifact[] };

/** What happens to one request, as it happens. */
export type A2APeerEvent =
  | { phase: 'asked'; request: string; accept?: string[] }
  | {
      phase: 'working';
      taskId: string;
      note?: string;
      /** The tool it calls or has finished with, when the step is one. */
      tool?: A2APeerToolStep;
    }
  | {
      phase: 'answered';
      taskId: string;
      answer: string;
      /** What it gave besides words, in the order it gave them. */
      artifacts: A2APeerArtifact[];
    }
  | { phase: 'failed'; error: string };

/** The text of a message's or an artifact's parts. */
export function textOf(parts: Part[] | undefined): string {
  return (parts ?? [])
    .map(part => (part.content?.$case === 'text' ? part.content.value : ''))
    .join('');
}

/** Whether a media type is JSON: `application/json`, or `+json` like a notebook. */
function isJson(mediaType: string): boolean {
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/**
 * What an artifact gives besides words: each part that is not text, by its
 * media type. A part without one is not told apart, and is left out.
 */
export function artifactsOf(
  artifact: { name?: string; parts?: Part[] } | undefined,
): A2APeerArtifact[] {
  const found: A2APeerArtifact[] = [];
  for (const part of artifact?.parts ?? []) {
    const content = part.content;
    const mediaType = part.mediaType;
    if (!content || content.$case === 'text' || !mediaType) {
      continue;
    }
    let data: unknown = content.value;
    if (content.$case === 'raw' && isJson(mediaType)) {
      data = JSON.parse(new TextDecoder().decode(content.value));
    }
    found.push({
      mediaType,
      name: artifact?.name || part.filename || mediaType,
      ...(part.filename ? { filename: part.filename } : {}),
      data,
    });
  }
  return found;
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

/**
 * What a working status says while the peer works: in a few words, and the
 * tool step when it is one.
 *
 * The runtime's A2A worker publishes each tool call of its agent, and each
 * call's end, as a `working` status whose message has one data part:
 * `{tool_call: {id, name, arguments}}`, then
 * `{tool_result: {id, name, result, error}}`.
 */
export function stepOf(message: Message | undefined): {
  note?: string;
  tool?: A2APeerToolStep;
} {
  for (const part of message?.parts ?? []) {
    const content = part.content;
    if (content?.$case === 'text' && content.value.trim()) {
      return { note: content.value };
    }
    if (content?.$case === 'data' && content.value) {
      const data = content.value as {
        tool_call?: {
          id?: string | null;
          name?: string | null;
          note?: string | null;
        };
        tool_result?: {
          id?: string | null;
          name?: string | null;
          error?: string | null;
          note?: string | null;
        };
      };
      const told = data.tool_call ?? data.tool_result;
      if (told?.name) {
        const ended = !data.tool_call;
        return {
          // A tool that composes an output says what it does in words
          // (`Writing a notebook…`); any other is named.
          note:
            told.note || (ended ? `Read ${told.name}` : `Calling ${told.name}`),
          tool: {
            ...(told.id ? { id: told.id } : {}),
            name: told.name,
            ended,
            ...(data.tool_result?.error
              ? { error: String(data.tool_result.error) }
              : {}),
          },
        };
      }
    }
  }
  return {};
}

const ENDED_BADLY: Partial<Record<TaskState, string>> = {
  [TaskState.TASK_STATE_FAILED]: 'failed',
  [TaskState.TASK_STATE_CANCELED]: 'was canceled',
  [TaskState.TASK_STATE_REJECTED]: 'was rejected',
  [TaskState.TASK_STATE_AUTH_REQUIRED]: 'asks for a key it was not given',
  [TaskState.TASK_STATE_INPUT_REQUIRED]: 'asks for more than it was told',
};

export type AskA2APeerOptions = {
  signal?: AbortSignal;
  onEvent?: (event: A2APeerEvent) => void;
  /**
   * The media types the asker accepts (`acceptedOutputModes`): words, and
   * any format it can show, such as a notebook. Unsaid, nothing is named and
   * the peer answers in words alone.
   */
  accept?: readonly string[];
};

/**
 * Ask a peer once, streaming the task, and return its answer.
 *
 * The answer is the text of the task's artifacts, assembled from their
 * chunks, or the final status message's when there is none; what it gave
 * besides words comes with it, by media type. A task that ends other than
 * completed is thrown, with what the peer said.
 */
export async function askA2APeer(
  peer: A2APeer,
  request: string,
  options: AskA2APeerOptions = {},
): Promise<A2APeerAnswer> {
  const { signal, onEvent, accept } = options;
  onEvent?.({
    phase: 'asked',
    request,
    ...(accept?.length ? { accept: [...accept] } : {}),
  });
  try {
    return await streamTask(peer, request, signal, onEvent, accept);
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
  accept: readonly string[] | undefined,
): Promise<A2APeerAnswer> {
  const texts = new Map<string, string>();
  // What it gave besides words, by artifact: the last chunk says it whole.
  const given = new Map<string, A2APeerArtifact[]>();
  let taskId = '';
  let final = '';
  let ended: TaskState | undefined;
  const stream = peer.client.sendMessageStream(
    {
      tenant: '',
      message: textMessage(request),
      configuration: accept?.length
        ? {
            acceptedOutputModes: [...accept],
            taskPushNotificationConfig: undefined,
            returnImmediately: false,
          }
        : undefined,
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
        onEvent?.({ phase: 'working', taskId, ...stepOf(status.message) });
      } else if (status) {
        ended = status.state;
        final = textOf(status.message?.parts) || final;
      }
    } else if (payload.$case === 'artifactUpdate') {
      const artifact = payload.value.artifact;
      if (artifact) {
        const text = textOf(artifact.parts);
        const besides = artifactsOf(artifact);
        if (besides.length) {
          given.set(artifact.artifactId, besides);
        }
        if (text || !besides.length) {
          const before = texts.get(artifact.artifactId) ?? '';
          // Chunks are appended; the last chunk carries the whole answer again.
          texts.set(
            artifact.artifactId,
            payload.value.append && !payload.value.lastChunk
              ? before + text
              : text,
          );
        }
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
  const answer = [...texts.values()].filter(text => text).join('\n') || final;
  const artifacts = [...given.values()].flat();
  onEvent?.({ phase: 'answered', taskId, answer, artifacts });
  return { answer, artifacts };
}

export type A2APeerToolOptions = {
  peer: A2APeer;
  /** Told each step of each request, as it happens. */
  onEvent?: (event: A2APeerEvent) => void;
  /**
   * The media types the asker accepts, words and the formats its page can
   * show: what each request accepts unless the model narrows it with
   * `formats`. Unsaid, words alone.
   */
  accept?: readonly string[];
};

/** The formats a peer gives besides words that the asker accepts too. */
export function offeredFormats(
  peer: A2APeer,
  accept: readonly string[] | undefined,
): string[] {
  const outputs = peer.skill.outputModes.length
    ? peer.skill.outputModes
    : peer.card.defaultOutputModes;
  return outputs.filter(
    mode => !TEXT_MEDIA_TYPES.includes(mode) && (accept ?? []).includes(mode),
  );
}

/** The input of a peer's tool: one request, in words, and the formats wanted besides. */
function requestSchema(formats: string[]) {
  return {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description:
          'What to ask, in one request that can be acted on without the rest of this conversation.',
      },
      ...(formats.length
        ? {
            formats: {
              type: 'array',
              items: { type: 'string', enum: formats },
              description: `What to ask for besides its answer in words, by media type: ${formats
                .map(format => `${format} (${FORMAT_NAMES[format] ?? format})`)
                .join(
                  ', ',
                )}. Empty for words alone; left out, it may give any of them.`,
            },
          }
        : {}),
    },
    required: ['request'],
  } as const;
}

/** The tool's description: the peer's skill, what it may be asked, and what it gives besides words. */
export function peerToolDescription(
  peer: A2APeer,
  accept?: readonly string[],
): string {
  const { card, skill } = peer;
  const examples = skill.examples.length
    ? ` For example: ${skill.examples.map(example => `"${example}"`).join('; ')}.`
    : '';
  const formats = offeredFormats(peer, accept);
  const besides = formats.length
    ? ` It can also give ${formats.map(format => FORMAT_NAMES[format] ?? format).join(' or ')}, shown to the person as it arrives: ask for it with \`formats\` when the person wants one, and do not repeat its content.`
    : '';
  return `Ask ${card.name}, over A2A: ${skill.description}${examples} It answers in words; report its answer as it gave it.${besides}`;
}

/**
 * The tool an agent asks its peer with: a request in, the peer's answer out.
 *
 * A failed request is returned rather than thrown, so the agent can tell the
 * person what the peer said instead of the whole run failing.
 */
export function a2aPeerTool(options: A2APeerToolOptions): Tool {
  const { peer, onEvent, accept } = options;
  const formats = offeredFormats(peer, accept);
  return tool({
    description: peerToolDescription(peer, accept),
    inputSchema: jsonSchema(requestSchema(formats) as never),
    execute: async (input, execution) => {
      const { request, formats: wanted } = (input ?? {}) as {
        request?: string;
        formats?: string[];
      };
      if (!request?.trim()) {
        return { error: `A request to ${peer.card.name} says what it asks.` };
      }
      // Words always; besides them, what the model asked for, or else
      // whatever the asker accepts.
      const accepted = Array.isArray(wanted)
        ? [
            ...(accept ?? []).filter(mode => TEXT_MEDIA_TYPES.includes(mode)),
            ...wanted.filter(mode => formats.includes(mode)),
          ]
        : accept;
      try {
        const { answer, artifacts } = await askA2APeer(peer, request, {
          signal: execution?.abortSignal,
          onEvent,
          accept: accepted,
        });
        // What it gave besides words is shown to the person; the model is
        // told it came, not its content.
        return artifacts.length
          ? {
              answer,
              attached: artifacts.map(artifact => ({
                mediaType: artifact.mediaType,
                name: artifact.name,
                shown: 'to the person, as it arrived',
              })),
            }
          : { answer };
      } catch (reason) {
        return {
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
    },
  });
}
