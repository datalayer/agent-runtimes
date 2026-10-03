/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application in a LOOP workspace (LOOP R-01): the agent created with the
 * application in its payload, and the application's starters on the empty
 * chat.
 */

import { describe, expect, it } from 'vitest';
import { LoopAgentBlueprint, LoopChatSuggestion } from '../core';
import { APP_CATALOGUE } from '../../specs/apps';
import { agentIdOf, defineAppPlugin } from '../apps/AppRenderer';
import { dumpAppspec } from '../apps/appspec';

const contributed = (
  plugin: ReturnType<typeof defineAppPlugin>,
  point: unknown,
) =>
  (plugin.contributes ?? []).filter(
    (item: { point?: unknown }) => item.point === point,
  ) as Array<{ value: Record<string, any> }>;

describe('the application plugin', () => {
  const research = APP_CATALOGUE['web-research'];
  const plugin = defineAppPlugin(research);

  it('creates the application’s agent with the application in its payload', () => {
    const [blueprint] = contributed(plugin, LoopAgentBlueprint);
    expect(blueprint.value.specId).toBe('cog-crawler');
    expect(blueprint.value.createPayload.name).toBe('web-research');
    expect(blueprint.value.createPayload.app_spec).toEqual(
      dumpAppspec(research),
    );
    expect(blueprint.value.createPayload.agent_library).toBe('pydantic-ai');
  });

  it('offers the application’s starters on the empty chat', () => {
    const [suggestions] = contributed(plugin, LoopChatSuggestion);
    expect(suggestions.value.suggestions).toEqual(
      research.interface.starters.map(starter => ({
        text: starter.label,
        message: starter.message,
      })),
    );
  });

  it('offers nothing when the application has no starter, and names itself', () => {
    const plain = defineAppPlugin({
      ...research,
      interface: { ...research.interface, starters: [] },
    });
    expect(contributed(plain, LoopChatSuggestion)).toEqual([]);
    expect(plugin.name).toBe('@datalayer/loop-plugin-agent-app-web-research');
    expect(plugin.displayName).toBe('Web Research');
  });

  it('names the agent without its version, a team when there is no agent', () => {
    expect(agentIdOf({ agent: 'cog-crawler:0.0.1', team: '' })).toBe(
      'cog-crawler',
    );
    expect(agentIdOf({ agent: '', team: 'jupyter:0.0.1' })).toBe('jupyter');
    expect(agentIdOf({ agent: 'x', team: '' })).toBe('x');
  });
});
