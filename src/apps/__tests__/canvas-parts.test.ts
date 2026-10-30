/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's toolbox as a contribution point (C-20): the parts are
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
import { listProtocolSpecs } from '../../specs/protocols';

const LISTS: Record<string, readonly string[]> = {
  connection: ['connections'],
  rule: ['rules'],
  skill: ['skills'],
  test: ['tests', 'cases'],
  event: ['triggers'],
  protocol: ['protocols'],
  ui: ['ui'],
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
  if (part.kind === 'agent') {
    return { ...data, agent: part.example };
  }
  if (part.kind === 'avatar') {
    const face = (data.interface ?? {}) as Record<string, unknown>;
    return { ...data, interface: { ...face, avatar: part.example } };
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
  // A UI plugin is listed once: the Canvas selects the one a blank
  // application already starts with (its kind's, `uiFor`) instead.
  if (
    part.kind === 'ui' &&
    Array.isArray(list) &&
    list.some(
      choice =>
        (choice as { plugin?: string }).plugin ===
        (part.example as { plugin: string }).plugin,
    )
  ) {
    return data;
  }
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
      new Set([
        'agent',
        'connection',
        'skill',
        'model',
        'rule',
        'test',
        'event',
        'protocol',
        'ui',
        'avatar',
      ]),
    );
    // Every protocol of the catalogue, a planned one offered but not enabled
    // (PS-04), and every UI plugin (R8) — never a renderer.
    for (const protocol of listProtocolSpecs()) {
      expect(
        parts.find(part => part.id === `protocol:${protocol.id}`)?.enabled,
      ).toBe(protocol.status === 'shipped');
    }
    expect(ids).toContain('ui:a2ui-surface');
    expect(ids).toContain('ui:chat');
    expect(ids).not.toContain('ui:a2ui');
    expect(parts.find(part => part.id === 'ui:chat')?.example).toEqual({
      plugin: 'chat',
    });
    expect(ids).toContain('avatar:paperclip');
    // The 3D avatar, the default robot, beside Datalayer's drawings.
    expect(parts.find(part => part.id === 'avatar:model3d')?.example).toEqual({
      kind: 'model3d',
    });
    // The catalogue's harnesses as the agent (SH-43): each by the
    // catalogue agent that runs on it — Claude Code, Codex, pi, Gemini CLI,
    // goose, OpenCode, OpenHands and fast-agent alike.
    const claude = parts.find(part => part.id === 'agent:claude-code');
    expect(claude?.harness).toBe('claude-code');
    expect(claude?.example).toBe('example-harness-claude-code');
    expect(claude?.enabled).toBe(true);
    // Datalayer runs what goes through ai-inference; Codex is said, never set.
    const codex = parts.find(part => part.id === 'agent:codex');
    expect(codex?.enabled).toBe(false);
    expect(codex?.says).toContain('not offered on Datalayer');
    for (const harness of [
      'codex',
      'pi',
      'gemini-cli',
      'goose',
      'opencode',
      'openhands',
      'fast-agent',
    ]) {
      const part = parts.find(item => item.id === `agent:${harness}`);
      expect(part?.harness).toBe(harness);
      expect(part?.example).toBe(`example-harness-${harness}`);
      expect(part?.says).not.toContain(
        'No agent of the catalogue runs on it yet.',
      );
    }
    expect(ids).not.toContain('agent:custom');
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
    const added = checkAppspec(withPart(part)).problems.filter(
      problem => !checkAppspec(empty).problems.includes(problem),
    );
    // Nothing new refused: an event even answers a worker's want of one. A
    // part not enabled today is refused in its one sentence while offered —
    // a harness the catalogue describes and does not offer (MH-47) included.
    expect(
      added.filter(
        problem =>
          part.enabled ||
          !/planned, not shipped|is not enabled|is not offered/.test(problem),
      ),
    ).toEqual([]);
  });
});
