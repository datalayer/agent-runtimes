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
import { loopAccentStyles } from '@datalayer/primer-addons';
import {
  agentIdOf,
  appThemeOverrides,
  defineAppPlugin,
} from '../apps/AppRenderer';
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

describe('the application’s accent in its conversation (LOOP T-05, T-18)', () => {
  it('is laid over the theme the chat wears, in both modes', () => {
    const research = APP_CATALOGUE['web-research'];
    expect(research.interface.accent).toBe('sky');
    // The chat sets its theme again inside it: without this, its bubbles and
    // its links would wear the theme's mint whatever the page around it set.
    expect(appThemeOverrides(research)).toEqual({
      light: loopAccentStyles('sky', 'light'),
      dark: loopAccentStyles('sky', 'dark'),
    });
    expect(appThemeOverrides(research)?.light?.['--loop-accent']).toBe(
      '#8CCBF9',
    );
  });

  it('lays nothing over an application that names none', () => {
    const research = APP_CATALOGUE['web-research'];
    const plain = {
      ...research,
      interface: { ...research.interface, accent: undefined },
    } as unknown as typeof research;
    expect(appThemeOverrides(plain)).toBeUndefined();
  });
});
