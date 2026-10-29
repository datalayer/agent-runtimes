/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every protocol plugin held to its `reactor-points.json`, the same files
 * `agent_runtimes/tests/test_protocols_reactor_points.py` reads: exported under its id, declared by its plugin, its default
 * contributed at order 100 (or none), replaced by a lower order, gone with
 * the host's plugin, and two at the same winning order failing closed.
 */

import {
  contribution,
  definePlugin,
  type ContributionPoint,
} from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import protocolsPoints from '../../agent_runtimes/protocols/reactor-points.json';
import agenticCommercePoints from '../../agent_runtimes/protocols/agentic_commerce/reactor-points.json';
import a2aPoints from '../../agent_runtimes/protocols/a2a/reactor-points.json';
import mcpPoints from '../../agent_runtimes/protocols/mcp/reactor-points.json';
import pactPoints from '../../agent_runtimes/protocols/pact/reactor-points.json';
import papPoints from '../../agent_runtimes/protocols/pap/reactor-points.json';
import ucpPoints from '../../agent_runtimes/protocols/ucp/reactor-points.json';
import webBotAuthPoints from '../../agent_runtimes/protocols/web_bot_auth/reactor-points.json';
import * as a2a from './a2a';
import * as agenticCommerce from './agentic-commerce';
import {
  AgentProtocolsExtension,
  buildProtocolsReactor,
} from './agentProtocols';
import { getProtocol } from '../specs/protocols';
import * as core from './core';
import * as mcp from './mcp';
import * as pact from './pact';
import * as pap from './pap';
import * as ucp from './ucp';
import * as webBotAuth from './web-bot-auth';

type Entry = {
  id: string;
  /** null: a point of the Python runtime alone, not declared here. */
  typescript: string | null;
  members: string[];
  default: { typescript: string | null } | null;
  resolution: 'single' | 'all';
  extension: boolean;
};

const FILES = [
  { file: protocolsPoints, module: core, plugin: 'agent-runtimes.protocols' },
  { file: mcpPoints, module: mcp, plugin: 'agent-runtimes.protocols.mcp' },
  { file: a2aPoints, module: a2a, plugin: 'agent-runtimes.protocols.a2a' },
  {
    file: webBotAuthPoints,
    module: webBotAuth,
    plugin: 'agent-runtimes.protocols.web-bot-auth',
  },
  { file: ucpPoints, module: ucp, plugin: 'agent-runtimes.protocols.ucp' },
  {
    file: agenticCommercePoints,
    module: agenticCommerce,
    plugin: 'agent-runtimes.protocols.agentic-commerce',
  },
  { file: pactPoints, module: pact, plugin: 'agent-runtimes.protocols.pact' },
  { file: papPoints, module: pap, plugin: 'agent-runtimes.protocols.pap' },
];
/** The points declared in TypeScript (a Python-only one names no export). */
function declaredHere(file: { points: unknown[] }): Entry[] {
  return (file.points as Entry[]).filter(entry => entry.typescript !== null);
}
const POINTS = FILES.flatMap(({ file, module, plugin }) =>
  declaredHere(file).map(entry => ({ entry, module, plugin })),
);

function host(
  name: string,
  point: ContributionPoint<unknown>,
  value: unknown,
  order: number,
) {
  return definePlugin({
    name,
    version: '1.0.0',
    contributes: [contribution(point, value, { id: name, order })],
  });
}

describe('the agent-protocols Extension', () => {
  it('delivers one plugin per points file', () => {
    expect(
      AgentProtocolsExtension.plugins.map(p => (p as { name: string }).name),
    ).toEqual(FILES.map(f => f.plugin));
  });

  it('each plugin describes its protocol and its points', () => {
    const reactor = buildProtocolsReactor();
    const described = Object.fromEntries(
      core.listProtocols(reactor).map(d => [d.id, d]),
    );
    expect(Object.keys(described).sort()).toEqual([
      'a2a',
      'agentic_commerce',
      'mcp',
      'pact',
      'pap',
      'ucp',
      'web_bot_auth',
    ]);
    for (const { file, plugin } of FILES.slice(1)) {
      const description = Object.values(described).find(
        d => d.plugin === plugin,
      );
      expect(description?.points.sort()).toEqual(
        declaredHere(file)
          .map(e => e.id)
          .sort(),
      );
    }
  });

  it('each description names its entry in the agentspecs catalogue (PR-50)', () => {
    for (const description of core.listProtocols(buildProtocolsReactor())) {
      const spec = getProtocol(description.catalogue);
      expect(spec, description.catalogue).toBeDefined();
      expect(spec?.specVersion).toContain(description.version);
    }
  });
});

describe.each(POINTS)('$entry.id', ({ entry, module, plugin }) => {
  const point = (module as Record<string, ContributionPoint<unknown>>)[
    entry.typescript as string
  ];

  it('is exported under its id and declared by its plugin', () => {
    expect(point?.id).toBe(entry.id);
    if (entry.extension) {
      expect(entry.id).toContain('.extension.');
    }
    const reactor = buildProtocolsReactor();
    const declared = reactor.getManifest(plugin)?.contributionPoints ?? [];
    expect(declared).toContain(entry.id);
  });

  it('has its default, replaced by a lower order, gone with its plugin', () => {
    const reactor = buildProtocolsReactor();
    const own = reactor
      .getContributions(point)
      .filter(c => c.plugin === plugin);
    if (entry.default === null) {
      expect(own).toEqual([]);
    } else {
      expect(own.map(c => [c.id, c.order])).toEqual([
        [entry.default.typescript, 100],
      ]);
      for (const member of entry.members) {
        const camel = member.replace(/_([a-z])/g, (_, c: string) =>
          c.toUpperCase(),
        );
        expect(own[0].value as object).toHaveProperty(camel);
      }
    }
    const value = { host: true };
    const replaced = buildProtocolsReactor([host('host', point, value, 10)]);
    if (entry.resolution === 'single') {
      expect(core.firstContribution(replaced, point, entry.id)).toBe(value);
      const rival = buildProtocolsReactor([
        host('host', point, value, 10),
        host('rival', point, {}, 10),
      ]);
      expect(() => core.firstContribution(rival, point, entry.id)).toThrow(
        'same order',
      );
    } else {
      expect(replaced.getContributions(point).map(c => c.value)).toContain(
        value,
      );
    }
    replaced.disable('host');
    expect(replaced.getContributions(point).map(c => c.value)).not.toContain(
      value,
    );
  });
});
