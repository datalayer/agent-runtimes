/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A header UI in the chat's title bar (the user, 18 November 2026): its
 * buttons, drop-downs and indicators, the frontend tool that sets them, and
 * what goes to the agent with a run.
 *
 * - the tool's arguments are the header's items, typed (the same schema as
 *   agentspecs' `header_tool_parameters`);
 * - a call of the tool, once answered in the conversation, changes the
 *   indicator on screen — and a conversation started over forgets it;
 * - a drop-down's option goes with the next run (`agent.header`);
 * - a button says its message as the person;
 * - each part is named, has its role, and an indicator is a polite live
 *   region.
 */

import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_UI_PLUGINS,
  agentUiChoicesOf,
  agentUiChromeOf,
  agentUiPluginsFor,
  withoutSuperseded,
} from '../agentUiPlugins';
import {
  AgentChatExtras,
  AgentRunProps,
  AgentSlots,
  mergeChatExtras,
  runForwardedProps,
} from '../core';
import {
  HEADER_ICONS,
  HeaderAction,
  HeaderChoice,
  HeaderIndicator,
  headerSpecOf,
  headerToolOf,
} from '../toolCards/headerItems';
import {
  chosenOptionOf,
  headerCallSummary,
  headerStateOf,
  headerToolName,
  headerToolParameters,
  meterShare,
  readHeaderArgs,
} from '../toolCards/headerState';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import { UI_CATALOGUE } from '../../specs/ui';
import { frontendToolName } from '../../tools/frontendToolNames';
import { AGENTSPECS } from '../../specs/agents';
import { agentAppspec } from '../AIApplication';
import type { UiHeaderItemSpec } from '../../types/agentspecs';

const HEADERS = [
  'social-header',
  'shop-header',
  'books-header',
  'trip-header',
  'earth-header',
  'aws-header',
  'notebook-header',
  'analysis-header',
];

/** Each seed agent, its public demo and its header UI. */
const SEED: Record<string, [string, string]> = {
  'worker-marketer': ['marketer-tryout', 'social-header'],
  'worker-shopper': ['shopper-tryout', 'shop-header'],
  'worker-accountant': ['accountant-tryout', 'books-header'],
  'worker-traveller': ['traveller-tryout', 'trip-header'],
  'worker-terra': ['terra-tryout', 'earth-header'],
  'worker-steward-aws': ['aws-steward-tryout', 'aws-header'],
  'worker-data-analyst': ['data-analyst-tryout', 'notebook-header'],
  'worker-functional-analyst': ['functional-analyst-tryout', 'analysis-header'],
};

const item = (ui: string, id: string): UiHeaderItemSpec =>
  headerSpecOf(ui).items.find(each => each.id === id)!;

let calls = 0;
/** A call of a tool, answered in the conversation: what the transcript records. */
const answered = (toolName: string, args: Record<string, unknown>) => {
  calls += 1;
  act(() => {
    PAGE_TOOL_RESULTS.record([
      {
        type: 'tool-call',
        status: 'complete',
        toolCallId: `call-${calls}`,
        toolName,
        args,
        result: { set: Object.keys(args) },
      },
    ]);
  });
};

/** A header UI's plugin on a reactor of its own, and its parts drawn. */
const mount = (ui: string, send = vi.fn()) => {
  const plugin = AGENT_UI_PLUGINS[ui].chrome!('header');
  const reactor = buildReactorFromPlugins([plugin]);
  reactor.start();
  const name = `@datalayer/agent-plugin-${ui}`;
  const components =
    reactor.getOutput<{
      components: {
        slot: string;
        id: string;
        Component: React.ComponentType<{ workspace?: unknown }>;
      }[];
    }>(name)?.components ?? [];
  const workspace = { viewControls: { send, busy: false } };
  const view = render(
    <ThemeProvider>
      {components.map(({ id, Component }) => (
        <Component key={id} workspace={workspace} />
      ))}
    </ThemeProvider>,
  );
  return { reactor, components, view, send };
};

afterEach(() => {
  cleanup();
  PAGE_TOOL_RESULTS.clear();
});

describe('a header UI in the catalogue', () => {
  it.each(HEADERS)('%s declares two or three items and its own tool', ui => {
    const header = headerSpecOf(ui);
    expect(header.items.length).toBeGreaterThanOrEqual(2);
    expect(header.items.length).toBeLessThanOrEqual(3);
    expect(header.tool).toBe(headerToolName(ui));
    expect(UI_CATALOGUE[ui].placements?.[0]).toBe('header');
    for (const each of header.items) {
      expect(
        HEADER_ICONS[each.octicon ?? ''],
        `${ui}.${each.id}`,
      ).toBeDefined();
    }
  });

  it('shows a button, a drop-down and each kind of indicator among the eight', () => {
    const items = HEADERS.flatMap(ui => headerSpecOf(ui).items);
    expect(new Set(items.map(each => each.kind))).toEqual(
      new Set(['action', 'choice', 'indicator']),
    );
    expect(new Set(items.map(each => each.display).filter(Boolean))).toEqual(
      new Set(['label', 'counter', 'status', 'meter']),
    );
  });

  // Its public demo names it too: held by agentspecs (`tests/test_ui_header.py`),
  // and carried here by the applications' catalogue once it is regenerated
  // from the agentspecs release that has the header UIs.
  it.each(Object.entries(SEED))('%s names its header', (agent, [, ui]) => {
    expect(agentUiChoicesOf(agent).map(choice => choice.plugin)).toContain(ui);
    // The model is told the header's tool by its public name (setShopHeader, notebookSetHeader).
    const tool = frontendToolName(headerSpecOf(ui).tool!);
    expect(AGENTSPECS[agent].systemPrompt).toContain(tool);
    // A visitor's demo mounts it: it needs no connection of theirs.
    expect(
      agentUiPluginsFor([ui], { anonymous: true }).map(
        plugin => (plugin as { name: string }).name,
      ),
    ).toEqual([`@datalayer/agent-plugin-${ui}`]);
  });

  it.each(Object.keys(SEED))(
    'a person’s own %s, drawn as an application (the Personal pages), carries its header and mounts it',
    agent => {
      const app = agentAppspec(AGENTSPECS[agent]);
      const ui = SEED[agent][1];
      expect(app.ui.map(choice => choice.plugin)).toContain(ui);
      expect(
        agentUiPluginsFor(app.ui).map(
          plugin => (plugin as { name: string }).name,
        ),
      ).toContain(`@datalayer/agent-plugin-${ui}`);
    },
  );

  it('stands in for the chip that said the same fact, where it is drawn', () => {
    const names = (ids: string[], anonymous = false) =>
      agentUiPluginsFor(ids, { anonymous }).map(
        plugin => (plugin as { name: string }).name,
      );
    // An Agent workspace mounts the header, and not the chip it stands in for.
    for (const agent of [
      'worker-shopper',
      'worker-traveller',
      'worker-steward-aws',
    ]) {
      const ui = SEED[agent][1];
      const chip = UI_CATALOGUE[ui].supersedes![0];
      const brought = agentUiChoicesOf(agent).map(choice => choice.plugin);
      expect(brought, agent).toEqual(expect.arrayContaining([ui, chip]));
      const mounted = agentUiPluginsFor(agentUiChoicesOf(agent)).map(
        plugin => (plugin as { name: string }).name,
      );
      expect(mounted).toContain(`@datalayer/agent-plugin-${ui}`);
      expect(mounted).not.toContain(`@datalayer/agent-plugin-${chip}`);
    }
    // Whoever brought it, and in whatever order.
    expect(names(['basket-total', 'shop-header'])).toEqual([
      '@datalayer/agent-plugin-shop-header',
    ]);
    // A chat without the header keeps its chip.
    expect(names(['basket-total'])).toEqual([
      '@datalayer/agent-plugin-basket-total',
    ]);
    expect(
      withoutSuperseded([{ plugin: 'basket-total' }, { plugin: 'chat' }]),
    ).toHaveLength(2);
    // `Chat` draws the chips and none of the headers: there the chip stays.
    expect(agentUiChromeOf(['shop-header', 'basket-total']).header).toEqual([
      'basket-total',
    ]);
  });
});

describe('the frontend tool of a header', () => {
  it('takes one typed argument per item it sets', () => {
    const parameters = headerToolParameters(headerSpecOf('shop-header')) as {
      additionalProperties: boolean;
      properties: Record<
        string,
        { enum?: string[]; properties?: Record<string, { enum?: string[] }> }
      >;
    };
    expect(parameters.additionalProperties).toBe(false);
    expect(Object.keys(parameters.properties)).toEqual([
      'basket',
      'budget',
      'approval',
    ]);
    expect(Object.keys(parameters.properties.basket.properties!)).toEqual([
      'value',
      'label',
      'tone',
      'visible',
    ]);
    expect(parameters.properties.basket.properties!.tone.enum).toEqual([
      'neutral',
      'accent',
      'success',
      'attention',
      'danger',
    ]);
    expect(Object.keys(parameters.properties.approval.properties!)).toEqual([
      'label',
      'tone',
      'visible',
    ]);
    expect(parameters.properties.budget.enum).toEqual([
      'none',
      '50',
      '100',
      '250',
    ]);
    const meter = (
      headerToolParameters(headerSpecOf('earth-header')) as typeof parameters
    ).properties.cloud;
    expect(Object.keys(meter.properties!)).toEqual([
      'value',
      'max',
      'label',
      'tone',
      'visible',
    ]);
    // Nobody sets a button.
    expect(
      (
        headerToolParameters(
          headerSpecOf('notebook-header'),
        ) as typeof parameters
      ).properties.profile,
    ).toBeUndefined();
  });

  it('answers what it set, says what it ignored, and refuses a call that sets nothing', async () => {
    const tool = headerToolOf('shop-header')!;
    expect(tool.name).toBe('set_shop_header');
    expect(tool.description).toContain('Call it each time the basket changes');
    await expect(
      tool.handler!({ basket: { value: 3, label: '$84.00' } }),
    ).resolves.toEqual({ set: ['basket'] });
    const mixed = (await tool.handler!({
      basket: { value: 2, tone: 'purple' },
      total: 12,
    })) as { set: string[]; ignored: string[] };
    expect(mixed.set).toEqual(['basket']);
    expect(mixed.ignored).toHaveLength(2);
    await expect(tool.handler!({ budget: '75' })).rejects.toThrow(
      "Budget has no option '75'",
    );
    await expect(tool.handler!({})).rejects.toThrow('Nothing to set');
    // What its card says in the conversation.
    expect(tool.summaryOf!({ basket: { value: 3, label: '$84.00' } }, {})).toBe(
      'Basket: 3 · $84.00',
    );
  });

  it('reads only what the header declares', () => {
    const read = readHeaderArgs(headerSpecOf('earth-header'), {
      cloud: {
        value: '4',
        max: 0,
        label: ' Sentinel-2 · 8 May ',
        visible: true,
      },
      sensor: 'landsat',
    });
    expect(read.indicators.cloud).toEqual({
      value: 4,
      label: 'Sentinel-2 · 8 May',
      visible: true,
    });
    expect(read.choices).toEqual({ sensor: 'landsat' });
    expect(read.problems).toEqual(["'cloud.max' is not a number above zero."]);
  });

  it('adds up with a host’s own tools in the chat’s extras, each name once', () => {
    const tool = headerToolOf('shop-header')!;
    const merged = mergeChatExtras(
      { frontendTools: [{ ...tool, name: 'host_tool' }], hidePrompt: true },
      { frontendTools: [tool, { ...tool, name: 'host_tool' }] },
    );
    expect(merged.frontendTools?.map(each => each.name)).toEqual([
      'host_tool',
      'set_shop_header',
    ]);
    expect(merged.hidePrompt).toBe(true);
  });
});

describe('the state of a header', () => {
  it('is the fold of its tool’s calls, each naming what it changes', () => {
    const header = headerSpecOf('shop-header');
    const state = headerStateOf(header, [
      {
        order: 2,
        args: { approval: { label: 'Approval needed', tone: 'attention' } },
      },
      { order: 1, args: { basket: { value: 2, label: '$40.00' } } },
      { order: 3, args: { basket: { value: 3 }, budget: '100' } },
      { order: 4, args: { approval: { visible: false } } },
    ]);
    expect(state.indicators.basket).toEqual({
      value: 3,
      label: '$40.00',
      visible: true,
      order: 3,
    });
    expect(state.indicators.approval.visible).toBe(false);
    expect(state.choices.budget).toEqual({ option: '100', after: 3 });
    expect(state.last).toBe(4);
    // Shown again without saying so: it shows.
    expect(
      headerStateOf(header, [
        { order: 1, args: { approval: { visible: false } } },
        { order: 2, args: { approval: { label: 'Approval needed' } } },
      ]).indicators.approval.visible,
    ).toBe(true);
  });

  it('keeps a drop-down on what the person picked, unless the tool set it since', () => {
    const budget = item('shop-header', 'budget');
    expect(chosenOptionOf(budget, undefined, undefined)).toBe('none');
    expect(chosenOptionOf(budget, { option: '50', after: 0 }, undefined)).toBe(
      '50',
    );
    expect(
      chosenOptionOf(
        budget,
        { option: '50', after: 2 },
        { option: '100', after: 2 },
      ),
    ).toBe('50');
    expect(
      chosenOptionOf(
        budget,
        { option: '50', after: 2 },
        { option: '100', after: 3 },
      ),
    ).toBe('100');
  });

  it('fills a meter by its share, within its bounds', () => {
    const cloud = item('earth-header', 'cloud');
    expect(meterShare(cloud, { value: 4 })).toBeCloseTo(0.04);
    expect(meterShare(cloud, { value: 150 })).toBe(1);
    expect(meterShare(cloud, { value: 5, max: 10 })).toBe(0.5);
    expect(
      headerCallSummary(headerSpecOf('earth-header'), {
        cloud: { value: 4, label: 'Sentinel-2 · 8 May' },
        sensor: 'sentinel-2',
      }),
    ).toBe('Sensor: Sentinel-2 · Cloud cover: 4%, Sentinel-2 · 8 May');
  });
});

describe('the parts of a header', () => {
  it('an indicator is a named, polite live region, in its tone', () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <HeaderIndicator
          item={item('social-header', 'drafts')}
          state={undefined}
        />
      </ThemeProvider>,
    );
    // Nothing is shown before the agent said it; the region is there, empty.
    const empty = container.querySelector('[data-header-indicator="drafts"]')!;
    expect(empty.getAttribute('aria-live')).toBe('polite');
    expect(empty.getAttribute('data-header-shown')).toBe('false');
    expect(empty.textContent).toBe('');
    rerender(
      <ThemeProvider>
        <HeaderIndicator
          item={item('social-header', 'drafts')}
          state={{ value: 2, tone: 'attention' }}
        />
      </ThemeProvider>,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-label')).toBe('Drafts to approve: 2');
    expect(status.getAttribute('data-header-tone')).toBe('attention');
    expect(status.textContent).toBe('2Drafts to approve');
  });

  it('a meter says its value with its unit', () => {
    render(
      <ThemeProvider>
        <HeaderIndicator
          item={item('aws-header', 'coverage')}
          state={{ value: 38, tone: 'attention' }}
        />
      </ThemeProvider>,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe(
      'Savings Plans coverage: 38%',
    );
    expect(
      status.querySelector('[data-header-meter-fill]') as HTMLElement,
    ).not.toBeNull();
    expect(status.textContent).toContain('38%');
  });

  it('a drop-down is a menu button named for what it is on, its options radios', () => {
    const chosen = vi.fn();
    render(
      <ThemeProvider>
        <HeaderChoice
          item={item('social-header', 'network')}
          chosen="bluesky"
          onChoose={chosen}
        />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button', { name: 'Network: Bluesky' });
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    fireEvent.click(button);
    const options = screen.getAllByRole('menuitemradio');
    expect(options.map(option => option.textContent)).toEqual([
      'All networks',
      'X',
      'Bluesky',
      'LinkedIn',
      'Discord',
    ]);
    expect(
      options.find(option => option.getAttribute('aria-checked') === 'true')
        ?.textContent,
    ).toBe('Bluesky');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'LinkedIn' }));
    expect(chosen).toHaveBeenCalledWith('linkedin');
  });

  it('a button is named and says its message when pressed', () => {
    const pressed = vi.fn();
    render(
      <ThemeProvider>
        <HeaderAction
          item={item('notebook-header', 'profile')}
          onPress={pressed}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Profile data' }));
    expect(pressed).toHaveBeenCalledTimes(1);
  });
});

describe('a header UI’s plugin', () => {
  it('fills the title bar’s slot with one entry per item', () => {
    const { components } = mount('shop-header');
    expect(components.map(each => each.slot)).toEqual([
      AgentSlots.chatHeader,
      AgentSlots.chatHeader,
      AgentSlots.chatHeader,
    ]);
    expect(components.map(each => each.id)).toEqual([
      'shop-header-basket',
      'shop-header-budget',
      'shop-header-approval',
    ]);
  });

  it('hands its tool to the chat', () => {
    const { reactor } = mount('trip-header');
    const tools = reactor
      .getContributions(AgentChatExtras)
      .flatMap(entry => entry.value.extras.value.frontendTools ?? []);
    expect(tools.map(tool => tool.name)).toEqual(['set_trip_header']);
  });

  it('a call of its tool, answered, changes the indicator on screen', () => {
    const { view } = mount('shop-header');
    // Before the agent said anything: no basket, no approval; the budget is there.
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Budget: No limit' }),
    ).toBeTruthy();

    answered('set_shop_header', { basket: { value: 2, label: '$40.00' } });
    const basket = view.container.querySelector(
      '[data-header-indicator="basket"]',
    )!;
    expect(basket.getAttribute('aria-label')).toBe('Basket: 2 · $40.00');

    answered('set_shop_header', {
      basket: { value: 3, label: '$84.00' },
      approval: { label: 'Approval needed', tone: 'attention' },
    });
    expect(
      view.container
        .querySelector('[data-header-indicator="basket"]')!
        .getAttribute('aria-label'),
    ).toBe('Basket: 3 · $84.00');
    const approval = view.container.querySelector(
      '[data-header-indicator="approval"]',
    )!;
    expect(approval.getAttribute('data-header-tone')).toBe('attention');
    expect(approval.textContent).toBe('Approval needed');

    answered('set_shop_header', { approval: { visible: false } });
    expect(
      view.container
        .querySelector('[data-header-indicator="approval"]')!
        .getAttribute('data-header-shown'),
    ).toBe('false');

    // A conversation started over forgets it.
    act(() => PAGE_TOOL_RESULTS.clear());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reads the basket the agent showed until its tool says it', () => {
    const { view } = mount('shop-header');
    answered('show_basket', {
      items: [
        { title: 'Kettle', quantity: 2, price: 30, currency: 'USD' },
        { title: 'Filter', quantity: 1, price: 12, currency: 'USD' },
      ],
    });
    const basket = () =>
      view.container.querySelector('[data-header-indicator="basket"]')!;
    expect(basket().getAttribute('data-header-shown')).toBe('true');
    expect(basket().getAttribute('aria-label')).toMatch(/^Basket: 3 · /);
    // The tool, later, is what shows.
    answered('set_shop_header', { basket: { value: 4, label: '$99.00' } });
    expect(basket().getAttribute('aria-label')).toBe('Basket: 4 · $99.00');
  });

  it('a drop-down’s option goes with the next run, and the agent may set it', () => {
    const { reactor } = mount('trip-header');
    const runProps = () =>
      runForwardedProps(
        reactor.getContributions(AgentRunProps).map(entry => entry.value),
        { agent: { modes: { depth: 'quick' } } },
      );
    // Its default, from the first run.
    expect(runProps()).toEqual({
      agent: {
        header: { 'trip-header': { travellers: '2' } },
        modes: { depth: 'quick' },
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Travellers: 2 travellers' }),
    );
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: '4 travellers' }),
    );
    expect(
      screen.getByRole('button', { name: 'Travellers: 4 travellers' }),
    ).toBeTruthy();
    expect(runProps()?.agent).toMatchObject({
      header: { 'trip-header': { travellers: '4' } },
    });
    // The person says "we are three" and the agent sets it: the drop-down follows.
    answered('set_trip_header', { travellers: '3' });
    expect(
      screen.getByRole('button', { name: 'Travellers: 3 travellers' }),
    ).toBeTruthy();
    expect(runProps()?.agent).toMatchObject({
      header: { 'trip-header': { travellers: '3' } },
    });
  });

  it('two headers’ options go together, each under its own name', () => {
    expect(
      runForwardedProps([
        {
          id: 'a',
          props: () => ({
            agent: { header: { 'shop-header': { budget: '50' } } },
          }),
        },
        {
          id: 'b',
          props: () => ({
            agent: { header: { 'earth-header': { sensor: 'landsat' } } },
          }),
        },
      ]),
    ).toEqual({
      agent: {
        header: {
          'shop-header': { budget: '50' },
          'earth-header': { sensor: 'landsat' },
        },
      },
    });
  });

  it('a button says its message to the agent, as the person', () => {
    const { send, reactor } = mount('notebook-header');
    fireEvent.click(screen.getByRole('button', { name: 'Profile data' }));
    expect(send).toHaveBeenCalledWith(
      'Profile every column — types, missing values, and ranges that look wrong.',
    );
    // No drop-down: nothing goes with its runs.
    expect(reactor.getContributions(AgentRunProps)).toHaveLength(0);
  });
});
