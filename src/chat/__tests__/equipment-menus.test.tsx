/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The MCP servers and skills of a conversation (the user, 18 and 19 November
 * 2026): each listed whole — on or off — with its state and why, in one
 * overlay opened from the dot beside the send button or the footer's menu,
 * with the conversation's switches; an application's model, to read.
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
  equipmentLists,
  modelRow,
  rowWords,
  serverRow,
  skillRow,
  summaryOf,
  type EquipmentSources,
} from '../prompt/menus/equipmentRows';
import {
  EquipmentMenu,
  EquipmentModelMenu,
  type EquipmentSwitches,
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

/** Switches that record what they were asked. */
function switches(asked: string[] = []): EquipmentSwitches {
  return {
    onToggleMcpTool: (server, tool) => asked.push(`tool ${server} ${tool}`),
    onToggleAllMcpServerTools: (server, tools, enable) =>
      asked.push(`server ${server} ${tools.join(',')} ${enable}`),
    onToggleMcpToolApproval: (server, tool) =>
      asked.push(`approve ${server} ${tool}`),
    onToggleSkill: skill => asked.push(`skill ${skill}`),
    onToggleAllSkills: (skills, enable) =>
      asked.push(`skills ${skills.join(',')} ${enable}`),
    onToggleSkillApproval: skill => asked.push(`approve-skill ${skill}`),
  };
}

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

  it('says so on its triggers and in its overlays', () => {
    render(
      <ThemeProvider>
        <EquipmentMenu
          kind="servers"
          trigger="button"
          lists={equipmentLists({
            equipment: declaredEquipment('worker-marketer'),
          })}
          switches={switches()}
        />
      </ThemeProvider>,
    );
    const servers = screen.getByRole('button', { name: /^MCP servers — / });
    expect(servers.getAttribute('aria-label')).toMatch(/\d+ declared$/);
    expect(servers.getAttribute('data-equipment-source')).toBe('declared');
    fireEvent.click(servers);
    expect(
      screen.getAllByText(EQUIPMENT_WORDS.declared).length,
    ).toBeGreaterThan(0);
    const row = document.querySelector('[data-equipment-row]');
    expect(row?.getAttribute('aria-label')).toContain(
      EQUIPMENT_WORDS.declaredState,
    );
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

/** What the visitors' runtime answers for the Traveller's demo. */
const TRAVELLER = readEquipment({
  mcp_servers: [
    { id: 'kiwi', name: 'Kiwi.com', state: 'started', tools: 1 },
    { id: 'overture', name: 'Overture', state: 'started', tools: 3 },
    {
      id: 'booking-com',
      name: 'Booking.com',
      optional: true,
      state: 'left_out',
      reason: 'needs BOOKING_COM_API_KEY',
    },
  ],
  skills: [
    { id: 'travel-planning', name: 'Travel planning', state: 'active' },
    { id: 'datalayer-memory-add', name: 'Memory add', state: 'active' },
    {
      id: 'crawl',
      name: 'Crawl',
      optional: true,
      state: 'not_activated',
      reason: 'needs TAVILY_API_KEY',
    },
  ],
});

const traveller = (more: Partial<EquipmentSources> = {}) =>
  equipmentLists({
    equipment: { source: 'live', ...TRAVELLER },
    locked: EQUIPMENT_WORDS.locked.ownRoutes,
    ...more,
  });

/** What a status from the monitoring stream says of two servers. */
const STATUS = {
  initialized: true,
  ready_count: 1,
  failed_count: 0,
  ready_servers: ['kiwi'],
  failed_servers: {},
  servers: [
    {
      id: 'kiwi',
      status: 'started' as const,
      tools: [{ name: 'search-flight' }, { name: 'feedback' }],
    },
    {
      id: 'tavily',
      status: 'failed' as const,
      error: 'Connection closed',
      reason: 'tavily could not start: the runtime cannot reach npm.',
    },
  ],
};

describe('the rows, from every source', () => {
  it('list what the runtime offers a visitor, the Datalayer skills counted, and nothing "disabled without an account"', () => {
    const lists = traveller();
    expect(lists.servers.map(row => [row.id, row.state, row.on])).toEqual([
      ['kiwi', 'Running', true],
      ['overture', 'Running', true],
      ['booking-com', 'Off', false],
    ]);
    expect(lists.skills.map(row => [row.id, row.on])).toEqual([
      ['travel-planning', true],
      ['datalayer-memory-add', true],
      ['crawl', false],
    ]);
    expect(summaryOf('servers', lists.servers, false).summary).toBe(
      '2 of 3 on',
    );
    expect(summaryOf('skills', lists.skills, false)).toMatchObject({
      status: 'on',
      count: '2/3',
    });
    // Off for a reason of its own, or for the runtime's.
    expect(lists.servers[2].locked).toBe('needs BOOKING_COM_API_KEY');
    expect(lists.servers[0].locked).toBe(EQUIPMENT_WORDS.locked.noTools);
    expect(lists.skills[2].locked).toBe('needs TAVILY_API_KEY');
    expect(lists.skills[0].locked).toBe(EQUIPMENT_WORDS.locked.ownRoutes);
    expect(JSON.stringify(lists)).not.toMatch(/without an account/);
  });

  it('take the live status, the tools and what the conversation switched on', () => {
    const lists = equipmentLists({
      mcpServers: [],
      mcpStatus: STATUS,
      enabledMcpTools: new Map([['kiwi', new Set(['search-flight'])]]),
      approvedMcpTools: new Map([['kiwi', new Set(['feedback'])]]),
      skills: [
        { id: 'github', name: 'GitHub', status: 'loaded' },
        { id: 'pdf', name: 'PDF', status: 'available' },
      ],
      enabledSkills: new Set(['github']),
      approvedSkills: new Set(['pdf']),
    });
    const [kiwi, tavily] = lists.servers;
    expect(kiwi).toMatchObject({ on: true, note: '1/2 tools on' });
    expect(kiwi.locked).toBeUndefined();
    expect(kiwi.tools).toEqual([
      { name: 'search-flight', enabled: true, approved: false },
      { name: 'feedback', enabled: false, approved: true },
    ]);
    // A failed server says the runtime's sentence, not its raw error.
    expect(tavily).toMatchObject({
      state: 'Failed',
      reason: 'tavily could not start: the runtime cannot reach npm.',
      locked: 'tavily could not start: the runtime cannot reach npm.',
    });
    expect(summaryOf('servers', lists.servers, false).status).toBe('failed');
    expect(
      lists.skills.map(row => [row.state, row.enabled, row.approved]),
    ).toEqual([
      ['Loaded', true, false],
      ['Off', false, true],
    ]);
  });

  it('count a server whose tools the conversation switched off as off, and all on before any switch', () => {
    const off = equipmentLists({
      mcpStatus: STATUS,
      enabledMcpTools: new Map([['kiwi', new Set<string>()]]),
    });
    expect(off.servers[0]).toMatchObject({ on: false, note: '0/2 tools on' });
    const untouched = equipmentLists({ mcpStatus: STATUS });
    expect(untouched.servers[0].note).toBe('2/2 tools on');
  });
});

/** The rows and switches an open overlay shows, as words. */
function shown(): string[] {
  const panel = document.querySelector('[data-equipment-panel]');
  expect(panel).toBeTruthy();
  return Array.from(
    (panel as Element).querySelectorAll(
      '[data-equipment-row], [data-equipment-switch]',
    ),
  ).map(each =>
    each.hasAttribute('data-equipment-row')
      ? `row ${each.getAttribute('aria-label')}`
      : `switch ${each.getAttribute('data-equipment-switch')} ${each.getAttribute('data-equipment-checked')} ${each.getAttribute('data-equipment-locked')}`,
  );
}

describe('one overlay, from the dot or the footer', () => {
  const lists = () =>
    equipmentLists({
      equipment: { source: 'live', ...TRAVELLER },
      mcpStatus: STATUS,
    });

  for (const kind of ['servers', 'skills'] as const) {
    it(`shows the same ${kind} rows and switches from either trigger`, () => {
      const draw = (trigger: 'dot' | 'button') =>
        render(
          <ThemeProvider>
            <EquipmentMenu
              kind={kind}
              trigger={trigger}
              lists={lists()}
              switches={switches()}
            />
          </ThemeProvider>,
        );
      draw('dot');
      const dot = document.querySelector(
        `[data-equipment-dot="${kind}"]`,
      ) as HTMLElement;
      fireEvent.click(dot);
      const fromDot = shown();
      const dotLabel = dot.getAttribute('aria-label');
      cleanup();
      draw('button');
      const button = document.querySelector(
        `[data-equipment-menu="${kind}"]`,
      ) as HTMLElement;
      fireEvent.click(button);
      expect(shown()).toEqual(fromDot);
      expect(fromDot.length).toBeGreaterThan(2);
      // The same summary, said by both.
      expect(button.getAttribute('aria-label')).toBe(dotLabel);
    });
  }

  it('colours the dot by the rows, and draws none when there are none', () => {
    render(
      <ThemeProvider>
        <EquipmentMenu
          kind="servers"
          trigger="dot"
          lists={traveller()}
          switches={switches()}
        />
        <EquipmentMenu
          kind="skills"
          trigger="dot"
          lists={equipmentLists({})}
          switches={switches()}
        />
      </ThemeProvider>,
    );
    const dot = screen.getByRole('button', {
      name: 'MCP servers — 2 of 3 on',
    });
    expect(dot.getAttribute('data-equipment-status')).toBe('on');
    expect(document.querySelector('[data-equipment-dot="skills"]')).toBeNull();
  });

  it('says that a conversation with no server uses none, in the footer', () => {
    render(
      <ThemeProvider>
        <EquipmentMenu
          kind="servers"
          trigger="button"
          lists={equipmentLists({})}
          switches={switches()}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'MCP servers — none' }));
    expect(screen.getByText(EQUIPMENT_WORDS.none.servers)).toBeTruthy();
  });
});

describe('the switches', () => {
  it('call the conversation’s handlers, and a locked one calls nothing', () => {
    const asked: string[] = [];
    render(
      <ThemeProvider>
        <EquipmentMenu
          kind="servers"
          trigger="button"
          lists={equipmentLists({
            equipment: { source: 'live', ...TRAVELLER },
            mcpStatus: STATUS,
          })}
          switches={{
            ...switches(asked),
            codemode: { enabled: false },
          }}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^MCP servers — / }));
    const press = (name: string) =>
      fireEvent.click(
        document.querySelector(
          `[data-equipment-switch="${name}"] button`,
        ) as Element,
      );
    press('server:kiwi');
    press('tool:kiwi:feedback');
    press('tool-approval:kiwi:search-flight');
    // Left out, and codemode without a handler: drawn, disabled.
    press('server:booking-com');
    press('codemode');
    expect(asked).toEqual([
      'server kiwi search-flight,feedback false',
      'tool kiwi feedback',
      'approve kiwi search-flight',
    ]);
    expect(
      document
        .querySelector('[data-equipment-switch="codemode"]')
        ?.getAttribute('title'),
    ).toBe(EQUIPMENT_WORDS.codemodeLocked);
  });

  it('switch a skill, all the skills one may, and a skill’s approval', () => {
    const asked: string[] = [];
    render(
      <ThemeProvider>
        <EquipmentMenu
          kind="skills"
          trigger="dot"
          lists={traveller({ locked: undefined })}
          switches={switches(asked)}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Skills — / }));
    const press = (name: string) =>
      fireEvent.click(
        document.querySelector(
          `[data-equipment-switch="${name}"] button`,
        ) as Element,
      );
    press('skill:travel-planning');
    press('skill-approval:datalayer-memory-add');
    press('skill:crawl');
    press('all-skills');
    expect(asked).toEqual([
      'skill travel-planning',
      'approve-skill datalayer-memory-add',
      'skills travel-planning,datalayer-memory-add false',
    ]);
    expect(
      document
        .querySelector('[data-equipment-switch="skill:crawl"]')
        ?.getAttribute('title'),
    ).toBe('needs TAVILY_API_KEY');
  });
});

describe('an application’s model, to read', () => {
  it('names the one in use, of all it may run on', () => {
    render(
      <ThemeProvider>
        <EquipmentModelMenu equipment={live()} />
      </ThemeProvider>,
    );
    expect(
      screen.getByRole('button', {
        name: 'Model — Claude Sonnet, of 2 it may run on',
      }).textContent,
    ).toBe('Claude Sonnet');
  });

  it('changes nothing when a row is chosen: the menu stays open', () => {
    render(
      <ThemeProvider>
        <EquipmentModelMenu equipment={live()} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Model — / }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Qwen Max/ }));
    expect(
      screen
        .getAllByRole('menuitem')
        .map(item => item.getAttribute('aria-label')),
    ).toEqual([
      'Claude Sonnet, In use',
      'Qwen Max, Not available, Not served to visitors.',
    ]);
    expect(screen.getByText(EQUIPMENT_WORDS.modelChosen)).toBeTruthy();
  });

  it('is not drawn when no model is known', () => {
    render(
      <ThemeProvider>
        <EquipmentModelMenu equipment={{ ...live(), models: [] }} />
      </ThemeProvider>,
    );
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
