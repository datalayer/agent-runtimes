/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent protocols, each a Reactor Plugin (AGENT_PROTOCOLS §3.1, decided
 * 2026-10-12) — the TypeScript twin of `agent_runtimes.protocols`.
 *
 * Every protocol is a Plugin declaring its Contribution Points
 * (`<protocol>.<point>`), its defaults contributed at order 100 that a host
 * replaces with a lower order; every extension a protocol defines is a
 * Contribution Point of its plugin (`<protocol>.extension.<name>`), an
 * implementation a Contribution to it. The `agent-protocols` Reactor
 * Extension only groups the plugins for delivery. Each protocol's
 * `reactor-points.json` holds both languages to the same points.
 *
 * @module protocols/core
 */

import {
  defineContributionPoint,
  definePlugin,
  type ContributionPoint,
  type ReactorPlatformView,
} from '@datalayer/reactor';

/** The order of a plugin's own defaults; a host contributes lower to replace one. */
export const DEFAULT_ORDER = 100;

/** One protocol as its plugin implements it. */
export interface ProtocolDescription {
  id: string;
  name: string;
  layer: 'transport' | 'consent' | 'identity' | 'commerce';
  /** The specification version implemented. */
  version: string;
  roles: string[];
  status: 'implemented' | 'partial' | 'planned';
  specification: string;
  plugin: string;
  /**
   * Its id in the agentspecs protocols catalogue (`agentspecs/protocols`,
   * AGENT_PROTOCOLS PS-01): `web-bot-auth`, `acp`… — how Studio reads a
   * runtime's answer against the catalogue (PR-50).
   */
  catalogue: string;
  /** The contribution points its plugin declares, its extensions' included. */
  points: string[];
}

/** Where each protocol plugin says what it is. */
export const ProtocolDescriptions =
  defineContributionPoint<ProtocolDescription>('protocols.description');

/** The plugin that declares {@link ProtocolDescriptions}; it contributes nothing. */
export const ProtocolsCorePlugin = definePlugin({
  name: 'agent-runtimes.protocols',
  version: '1.0.0',
  description: 'What the agent protocols say they are.',
  contributionPoints: [ProtocolDescriptions],
});

/**
 * The lowest-order contribution to a single-provider point. None, or two at
 * the same winning order, fails closed.
 */
export function firstContribution<T>(
  reactor: ReactorPlatformView,
  point: ContributionPoint<T>,
  label: string,
): T {
  const contributions = reactor.getContributions(point);
  const [first, second] = contributions;
  if (!first) {
    throw new Error(`no ${label} is contributed (${point.id})`);
  }
  if (second && second.order === first.order) {
    throw new Error(
      `two ${label}s are contributed at the same order (${point.id})`,
    );
  }
  return first.value;
}

/** As {@link firstContribution}, `undefined` when nothing is contributed. */
export function optionalContribution<T>(
  reactor: ReactorPlatformView,
  point: ContributionPoint<T>,
  label: string,
): T | undefined {
  if (!reactor.getContributions(point).length) {
    return undefined;
  }
  return firstContribution(reactor, point, label);
}

/** What the protocol plugins say they are, one per protocol, by id. */
export function listProtocols(
  reactor: ReactorPlatformView,
): ProtocolDescription[] {
  const byId = new Map<string, ProtocolDescription>();
  for (const contribution of [
    ...reactor.getContributions(ProtocolDescriptions),
  ].reverse()) {
    byId.set(contribution.value.id, contribution.value);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
