/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's toolbox as a contribution point (LOOP C-20): the parts are
 * what the enabled plugins contribute, a source turned off takes its parts
 * off, and every part arrives with an example the Appspec takes as it is.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_PART_PLUGINS,
  CANVAS_PART_SOURCES,
  canvasPartsOf,
  canvasPartsPluginName,
  canvasPartsReactor,
  canvasPartsReactorOf,
} from '../plugins/canvas-parts';
import { LoopCanvasPart, type CanvasPartContribution } from '../core';
import { dumpAppspec, emptyAppspec } from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { getSkillSpecs } from '../../specs/skills';

const LISTS: Record<string, readonly string[]> = {
  connection: ['connections'],
  rule: ['rules'],
  skill: ['skills'],
  test: ['tests', 'cases'],
  event: ['triggers'],
};

/** An empty application with a part placed, as the Canvas places it: appended to its list, or a model set. */
function withPart(part: CanvasPartContribution): Record<string, unknown> {
  // Events start a worker: a chat application starts when somebody opens it.
  const data = {
    ...(dumpAppspec(emptyAppspec()) as Record<string, unknown>),
    ...(part.kind === 'event' ? { kind: 'worker' } : {}),
  };
  if (part.kind === 'model') {
    return { ...data, model: part.example };
  }
  const [head, tail] = LISTS[part.kind];
  if (tail) {
    const holder = (data[head] ?? {}) as Record<string, unknown>;
    return {
      ...data,
      [head]: {
        ...holder,
        [tail]: [...((holder[tail] as unknown[]) ?? []), part.example],
      },
    };
  }
  const list = data[head];
  return {
    ...data,
    [head]: [
      ...(Array.isArray(list) ? list : list ? [list] : []),
      part.example,
    ],
  };
}

describe('the toolbox is what the enabled plugins contribute', () => {
  it('offers every server, skill and chat model of the catalogue, and the rules, tests and events', () => {
    const parts = canvasPartsOf(canvasPartsReactor());
    const ids = new Set(parts.map(part => part.id));
    expect(ids.size).toBe(parts.length);
    for (const server of Object.values(MCP_SERVER_LIBRARY)) {
      expect(ids).toContain(`connection:${server.id}`);
    }
    for (const skill of getSkillSpecs()) {
      expect(ids).toContain(`skill:${skill.id}`);
    }
    expect(new Set(parts.map(part => part.kind))).toEqual(
      new Set(['connection', 'skill', 'model', 'rule', 'test', 'event']),
    );
    expect(CANVAS_PART_PLUGINS.map(plugin => plugin.name)).toEqual(
      CANVAS_PART_SOURCES.map(canvasPartsPluginName),
    );
  });

  it('takes a source’s parts off when it is turned off, and refuses a plugin it does not have', () => {
    const parts = canvasPartsOf(canvasPartsReactorOf(['skills', 'a2ui']));
    expect(parts.some(part => part.kind === 'skill')).toBe(false);
    expect(parts.some(part => part.kind === 'connection')).toBe(true);
    expect(() => canvasPartsReactor(['no-such-plugin'])).toThrow(
      /No plugin of the toolbox/,
    );
  });

  it('reads a part a plugin of its own contributes, and nothing it does not', () => {
    const reactor = canvasPartsReactor([], []);
    expect(reactor.getContributions(LoopCanvasPart)).toEqual([]);
  });
});

describe('every part arrives with an example the Appspec takes as it is', () => {
  const baseline = checkAppspec(dumpAppspec(emptyAppspec())).problems;
  it('and would say so of one it does not take', () => {
    const wrong = {
      id: 'rule:wrong',
      kind: 'rule',
      label: 'Wrong',
      says: '',
      example: { action: 'Send', applies_to: ['send'], behaviour: 'whenever' },
      enabled: true,
    } as CanvasPartContribution;
    expect(checkAppspec(withPart(wrong)).problems.length).toBeGreaterThan(
      baseline.length,
    );
  });

  it.each(
    canvasPartsOf(canvasPartsReactor()).map(part => [part.id, part] as const),
  )('%s', (_, part) => {
    const empty =
      part.kind === 'event'
        ? { ...(dumpAppspec(emptyAppspec()) as object), kind: 'worker' }
        : dumpAppspec(emptyAppspec());
    // Nothing new refused: an event even answers a worker's want of one.
    expect(checkAppspec(empty).problems).toEqual(
      expect.arrayContaining(checkAppspec(withPart(part)).problems),
    );
  });
});
