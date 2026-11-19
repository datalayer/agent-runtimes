/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application runs with, under its composer (the user, 18 November
 * 2026): its MCP servers, its skills and its model, each listed whole — on
 * or off — with its state and why, to read and not to change.
 */

import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  declaredEquipment,
  equipmentModelsUrl,
  equipmentUrl,
  readEquipment,
  readEquipmentModels,
  useEquipment,
  type Equipment,
} from '../../hooks/useEquipment';
import {
  EQUIPMENT_WORDS,
  EquipmentBar,
  modelRow,
  rowWords,
  serverRow,
  skillRow,
} from '../prompt/menus/EquipmentMenus';

/** What the runtime answers for the Marketer with GITHUB_TOKEN alone set up. */
const ANSWER = {
  agent: 'at-demo-marketer',
  mcp_servers: [
    {
      id: 'discord',
      name: 'Discord',
      optional: true,
      state: 'left_out',
      reason: 'needs DISCORD_BOT_TOKEN, DISCORD_GUILD_ID',
      missing_env_vars: ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID'],
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      optional: true,
      state: 'started',
      reason: null,
      missing_env_vars: [],
      tools: 7,
    },
    {
      id: 'kiwi',
      name: 'Kiwi',
      optional: false,
      state: 'failed',
      reason: 'It did not answer in 30 seconds.',
      missing_env_vars: [],
    },
  ],
  skills: [
    {
      id: 'github',
      name: 'GitHub Skill',
      description: '',
      optional: true,
      state: 'active',
      reason: null,
      missing_env_vars: [],
      one_of_env_vars: [],
    },
    {
      id: 'image-stock',
      name: 'Stock Image Skill',
      description: '',
      optional: true,
      state: 'not_activated',
      reason: 'needs one of PEXELS_API_KEY, UNSPLASH_ACCESS_KEY',
      missing_env_vars: [],
      one_of_env_vars: ['PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY'],
    },
  ],
};

const MODELS = {
  models: [
    { id: 'bedrock:claude', name: 'Claude Sonnet', available: true },
    {
      id: 'alibaba:qwen-max',
      name: 'Qwen Max',
      available: false,
      reason: 'Not served to visitors.',
    },
  ],
};

const live = (): Equipment => ({
  source: 'live',
  modelsSource: 'live',
  ...readEquipment(ANSWER),
  models: readEquipmentModels(MODELS, undefined),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('reading what the runtime says', () => {
  it('asks the application’s own routes', () => {
    expect(equipmentUrl('https://r/api/x/', 'at-demo marketer')).toBe(
      'https://r/api/x/api/v1/apps/agents/at-demo%20marketer/equipment',
    );
    expect(equipmentModelsUrl('https://r', 'a')).toBe(
      'https://r/api/v1/configure/models?agent_id=a',
    );
  });

  it('keeps every server and skill, with its state, its reason and the names it needs', () => {
    const { servers, skills } = readEquipment(ANSWER);
    expect(servers.map(server => [server.id, server.state])).toEqual([
      ['discord', 'left_out'],
      ['linkedin', 'started'],
      ['kiwi', 'failed'],
    ]);
    expect(servers[0].missingEnvVars).toEqual([
      'DISCORD_BOT_TOKEN',
      'DISCORD_GUILD_ID',
    ]);
    expect(servers[1].tools).toBe(7);
    expect(skills[1]).toMatchObject({
      state: 'not_activated',
      reason: 'needs one of PEXELS_API_KEY, UNSPLASH_ACCESS_KEY',
      oneOfEnvVars: ['PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY'],
    });
    // An answer it does not understand is nothing, not an error.
    expect(readEquipment(null)).toEqual({ servers: [], skills: [] });
    expect(
      readEquipment({ mcp_servers: [{ id: 'x', state: 'on-fire' }] }).servers[0]
        .state,
    ).toBe('not_started');
  });

  it('lists every model, the one in use marked, an unusable one with why', () => {
    const models = readEquipmentModels(MODELS, undefined);
    expect(models.map(model => [model.id, model.current])).toEqual([
      ['bedrock:claude', true],
      ['alibaba:qwen-max', false],
    ]);
    expect(models[1].isAvailable).toBe(false);
    expect(models[1].unavailableReason).toBe('Not served to visitors.');
    expect(
      readEquipmentModels(MODELS, 'alibaba:qwen-max').find(m => m.current)?.id,
    ).toBe('alibaba:qwen-max');
  });
});

describe('before the runtime answers', () => {
  it('lists what the agent’s spec declares, with no state', () => {
    const declared = declaredEquipment('worker-marketer:0.0.1');
    expect(declared.source).toBe('declared');
    expect(declared.servers.map(server => server.id)).toEqual(
      expect.arrayContaining(['discord', 'linkedin']),
    );
    expect(declared.servers.every(server => server.state === undefined)).toBe(
      true,
    );
    expect(declared.servers.find(s => s.id === 'discord')?.optional).toBe(true);
    expect(declared.skills.length).toBeGreaterThan(3);
    expect(declared.models[0].current).toBe(true);
    expect(declared.models.length).toBeGreaterThan(1);
    // An application whose agent the catalogue does not have: nothing to list.
    expect(declaredEquipment('nobody')).toMatchObject({
      servers: [],
      skills: [],
      models: [],
    });
  });

  it('says so on its triggers and in its menus', () => {
    render(
      <ThemeProvider>
        <EquipmentBar equipment={declaredEquipment('worker-marketer')} />
      </ThemeProvider>,
    );
    const servers = screen.getByRole('button', { name: /^MCP servers — / });
    expect(servers.getAttribute('aria-label')).toMatch(/\d+ declared$/);
    expect(servers.getAttribute('data-equipment-source')).toBe('declared');
    fireEvent.click(servers);
    expect(screen.getByText(EQUIPMENT_WORDS.declared)).toBeTruthy();
    expect(
      screen.getAllByRole('menuitem')[0].getAttribute('aria-label'),
    ).toContain(EQUIPMENT_WORDS.declaredState);
  });
});

describe('the rows', () => {
  it('say a state in words, and why one is off', () => {
    const { servers, skills } = readEquipment(ANSWER);
    expect(rowWords(serverRow(servers[0]))).toBe(
      'Discord, Off, needs DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, optional',
    );
    expect(rowWords(serverRow(servers[1]))).toBe('LinkedIn, Running, 7 tools');
    expect(serverRow(servers[2])).toMatchObject({
      state: 'Failed',
      tone: 'danger',
      on: false,
      reason: 'It did not answer in 30 seconds.',
    });
    expect(rowWords(skillRow(skills[1]))).toBe(
      'Stock Image Skill, Not activated, needs one of PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, optional',
    );
    expect(skillRow(skills[0])).toMatchObject({ state: 'Active', on: true });
    const [inUse, off] = readEquipmentModels(MODELS, undefined).map(modelRow);
    expect(inUse).toMatchObject({ state: 'In use', on: true });
    expect(rowWords(off)).toBe(
      'Qwen Max, Not available, Not served to visitors.',
    );
  });
});

describe('the three menus under the composer', () => {
  it('count what is on, of all there is', () => {
    render(
      <ThemeProvider>
        <EquipmentBar equipment={live()} />
      </ThemeProvider>,
    );
    const group = screen.getByRole('group', {
      name: 'What this application runs with',
    });
    expect(group.getAttribute('data-equipment-bar')).toBe('live');
    expect(
      screen.getByRole('button', {
        name: 'MCP servers — 1 of 3 running',
      }).textContent,
    ).toBe('1/3');
    expect(
      screen.getByRole('button', { name: 'Skills — 1 of 2 active' })
        .textContent,
    ).toBe('1/2');
    expect(
      screen.getByRole('button', {
        name: 'Model — Claude Sonnet, of 2 it may run on',
      }).textContent,
    ).toBe('Claude Sonnet');
  });

  it('list everything, on or off, each a menu item that says its state', () => {
    render(
      <ThemeProvider>
        <EquipmentBar equipment={live()} />
      </ThemeProvider>,
    );
    const trigger = screen.getByRole('button', { name: /^Skills — / });
    expect(trigger.getAttribute('aria-haspopup')).toBe('true');
    fireEvent.click(trigger);
    const items = screen.getAllByRole('menuitem');
    expect(items.map(item => item.getAttribute('aria-label'))).toEqual([
      'GitHub Skill, Active, optional',
      'Stock Image Skill, Not activated, needs one of PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, optional',
    ]);
    expect(items[1].getAttribute('data-equipment-on')).toBe('false');
    // It is said to be read only.
    expect(screen.getByText(EQUIPMENT_WORDS.readOnly)).toBeTruthy();
  });

  it('change nothing when a row is chosen: the menu stays open', () => {
    render(
      <ThemeProvider>
        <EquipmentBar equipment={live()} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Model — / }));
    const off = screen.getByRole('menuitem', { name: /^Qwen Max/ });
    fireEvent.click(off);
    expect(
      screen
        .getAllByRole('menuitem')
        .map(item => item.getAttribute('aria-label')),
    ).toEqual([
      'Claude Sonnet, In use',
      'Qwen Max, Not available, Not served to visitors.',
    ]);
  });

  it('say that an application with no server uses none', () => {
    render(
      <ThemeProvider>
        <EquipmentBar
          equipment={{ ...live(), servers: [], skills: [], models: [] }}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'MCP servers — none' }));
    expect(screen.getByText(EQUIPMENT_WORDS.none.servers)).toBeTruthy();
    // No model known: no model menu, rather than an empty one.
    expect(screen.queryByRole('button', { name: /^Model — / })).toBeNull();
  });
});

describe('useEquipment', () => {
  function Probe(props: Parameters<typeof useEquipment>[0]) {
    const equipment = useEquipment(props);
    return (
      <output data-testid="probe">
        {JSON.stringify({
          source: equipment.source,
          modelsSource: equipment.modelsSource,
          servers: equipment.servers.map(s => `${s.id}:${s.state ?? ''}`),
          models: equipment.models.map(m => m.id),
        })}
      </output>
    );
  }
  const read = () =>
    JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
      source: string;
      modelsSource: string;
      servers: string[];
      models: string[];
    };

  it('shows the spec at once, then the runtime’s answer, asked with the caller’s token', async () => {
    const asked: Array<{ url: string; authorization?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push({
          url,
          authorization: (init?.headers as Record<string, string> | undefined)
            ?.Authorization,
        });
        const body = url.endsWith('/equipment') ? ANSWER : MODELS;
        return { ok: true, json: async () => body } as Response;
      }),
    );
    render(
      <Probe
        agentServerUrl="https://r"
        agentId="at-demo-marketer"
        token="visitor-token"
        specId="worker-marketer:0.0.1"
        enabled
      />,
    );
    expect(read().source).toBe('declared');
    await waitFor(() => expect(read().source).toBe('live'));
    expect(read().servers).toEqual([
      'discord:left_out',
      'linkedin:started',
      'kiwi:failed',
    ]);
    await waitFor(() => expect(read().modelsSource).toBe('live'));
    expect(read().models).toEqual(['bedrock:claude', 'alibaba:qwen-max']);
    expect(asked.find(each => each.url.endsWith('/equipment'))).toEqual({
      url: 'https://r/api/v1/apps/agents/at-demo-marketer/equipment',
      authorization: 'Bearer visitor-token',
    });
  });

  it('keeps the spec’s models when the runtime says none of them usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.endsWith('/equipment')
          ? ANSWER
          : {
              models: MODELS.models.map(each => ({
                ...each,
                available: false,
                reason: 'No ai-inference token',
              })),
            };
        return { ok: true, json: async () => body } as Response;
      }),
    );
    render(
      <Probe
        agentServerUrl="https://r"
        agentId="at-demo-marketer"
        token="visitor-token"
        specId="worker-marketer"
        enabled
      />,
    );
    await waitFor(() => expect(read().source).toBe('live'));
    expect(read().modelsSource).toBe('declared');
    expect(read().models).toEqual(
      declaredEquipment('worker-marketer').models.map(each => each.id),
    );
  });

  it('keeps the spec when the runtime does not answer the route, and asks nothing when off', async () => {
    const fetched = vi.fn(
      async () => ({ ok: false, json: async () => ({}) }) as Response,
    );
    vi.stubGlobal('fetch', fetched);
    const { rerender } = render(
      <Probe
        agentServerUrl="https://r"
        agentId="a"
        token={undefined}
        specId="worker-marketer"
        enabled
      />,
    );
    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2));
    expect(read().source).toBe('declared');
    expect(read().servers).toContain('discord:');
    fetched.mockClear();
    rerender(
      <Probe
        agentServerUrl="https://r"
        agentId="b"
        token={undefined}
        specId="worker-marketer"
        enabled={false}
      />,
    );
    expect(fetched).not.toHaveBeenCalled();
  });
});
