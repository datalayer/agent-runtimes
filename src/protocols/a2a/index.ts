/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2A as a Reactor Plugin (AGENT_PROTOCOLS PR-02): Agent Card extensions
 * read, published from what is contributed, and negotiated.
 *
 * Each A2A extension this runtime implements is a Contribution Point of the
 * plugin, `a2a.extension.<name>`: `orchestration` and `face` (Datalayer's,
 * defaults `datalayer`), and `other` for any extension by its URI (no
 * default, every contribution used). The twin of `agent_runtimes.protocols.a2a`.
 *
 * @module protocols/a2a
 */

import {
  contribution,
  defineContributionPoint,
  definePlugin,
  type ReactorPlatformView,
} from '@datalayer/reactor';
import { DEFAULT_ORDER, ProtocolDescriptions } from '../core';

export const A2A_PLUGIN = 'agent-runtimes.protocols.a2a';
export const ORCHESTRATION_URI =
  'https://datalayer.ai/extensions/orchestration/v1';
export const FACE_URI = 'https://datalayer.ai/extensions/face/v1';

/** One extension an Agent Card advertises. */
export interface CardExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

/** What an extension may read to say its params on one agent's card. */
export interface CardContext {
  agentId: string;
  apiPrefix?: string;
  face?: Record<string, string>;
}

/** One A2A extension this runtime implements. */
export interface A2AExtension {
  uri: string;
  description: string;
  required: boolean;
  /** Its params on this card; `undefined` when it is not published there. */
  params(context: CardContext): Record<string, unknown> | undefined;
}

export const A2AOrchestrationExtensions = defineContributionPoint<A2AExtension>(
  'a2a.extension.orchestration',
);
export const A2AFaceExtensions =
  defineContributionPoint<A2AExtension>('a2a.extension.face');
export const A2AOtherExtensions = defineContributionPoint<A2AExtension>(
  'a2a.extension.other',
);
const EXTENSION_POINTS = [
  A2AOrchestrationExtensions,
  A2AFaceExtensions,
  A2AOtherExtensions,
];

const orchestration: A2AExtension = {
  uri: ORCHESTRATION_URI,
  description:
    'Pause at a checkpoint and resume from it; steer a task while it works.',
  required: false,
  params: context => ({
    pause: `${context.apiPrefix ?? ''}/a2a/pause`,
    steer: `${context.apiPrefix ?? ''}/a2a/steer`,
  }),
};

const face: A2AExtension = {
  uri: FACE_URI,
  description: 'Its face: an emoji, and an avatar when it has one.',
  required: false,
  params: context => (context.face ? { ...context.face } : undefined),
};

export const A2APlugin = definePlugin({
  name: A2A_PLUGIN,
  version: '1.0.0',
  description:
    'Agent2Agent 1.0: the extensions an agent card publishes and a client negotiates.',
  contributionPoints: EXTENSION_POINTS,
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'a2a',
        name: 'Agent2Agent',
        layer: 'transport',
        version: '1.0',
        roles: ['client', 'server'],
        status: 'implemented',
        specification: 'https://a2a-protocol.org/latest/specification/',
        plugin: A2A_PLUGIN,
        points: EXTENSION_POINTS.map(point => point.id),
      },
      { id: 'a2a', order: DEFAULT_ORDER },
    ),
    contribution(A2AOrchestrationExtensions, orchestration, {
      id: 'datalayer',
      order: DEFAULT_ORDER,
    }),
    contribution(A2AFaceExtensions, face, {
      id: 'datalayer',
      order: DEFAULT_ORDER,
    }),
  ],
});

function assertUri(uri: unknown): asserts uri is string {
  if (typeof uri !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    throw new Error(`an extension is named by a URI, not ${String(uri)}`);
  }
}

/** Every extension a card advertises, in its order. */
export function extensionsOf(card: unknown): CardExtension[] {
  const raw = (card as { capabilities?: { extensions?: unknown } })
    ?.capabilities?.extensions;
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('capabilities.extensions is a list');
  }
  const out: CardExtension[] = raw.map(entry => {
    const { uri, description, required, params } = entry as CardExtension;
    assertUri(uri);
    return {
      uri,
      description: description ?? '',
      required: Boolean(required),
      params: params ?? {},
    };
  });
  if (new Set(out.map(e => e.uri)).size !== out.length) {
    throw new Error('the card advertises an extension twice');
  }
  return out;
}

export function findExtension(
  card: unknown,
  uri: string,
): CardExtension | undefined {
  return extensionsOf(card).find(extension => extension.uri === uri);
}

/** The extensions a card requires that the caller does not support. */
export function unsupportedRequired(
  card: unknown,
  supported: Iterable<string>,
): string[] {
  const known = new Set(supported);
  return extensionsOf(card)
    .filter(extension => extension.required && !known.has(extension.uri))
    .map(extension => extension.uri);
}

function providers(reactor: ReactorPlatformView): A2AExtension[] {
  const out: A2AExtension[] = [];
  for (const point of EXTENSION_POINTS) {
    const contributions = reactor.getContributions(point);
    if (point === A2AOtherExtensions) {
      out.push(...contributions.map(c => c.value));
    } else if (contributions.length) {
      if (
        contributions[1] &&
        contributions[1].order === contributions[0].order
      ) {
        throw new Error(`two implementations of ${point.id} at the same order`);
      }
      out.push(contributions[0].value);
    }
  }
  return out;
}

/** What one agent's card publishes: what is contributed, then what it declares. */
export function cardExtensions(
  reactor: ReactorPlatformView,
  context: CardContext,
  declared: CardExtension[] = [],
): CardExtension[] {
  const out: CardExtension[] = [];
  for (const provider of providers(reactor)) {
    const params = provider.params(context);
    if (params !== undefined) {
      out.push({
        uri: provider.uri,
        description: provider.description,
        required: provider.required,
        params,
      });
    }
  }
  for (const extension of declared) {
    assertUri(extension.uri);
    if (out.some(e => e.uri === extension.uri)) {
      throw new Error(`extension ${extension.uri} is published twice`);
    }
    out.push(extension);
  }
  return out;
}

/**
 * The extensions a client activates with an agent: those of its card that
 * are implemented here. Throws when the card requires one that is not.
 */
export function negotiateExtensions(
  card: unknown,
  reactor: ReactorPlatformView,
): string[] {
  const implemented = new Set(providers(reactor).map(provider => provider.uri));
  const missing = unsupportedRequired(card, implemented);
  if (missing.length) {
    throw new Error(
      `the agent requires extensions not implemented here: ${missing.join(', ')}`,
    );
  }
  return extensionsOf(card)
    .map(extension => extension.uri)
    .filter(uri => implemented.has(uri));
}
