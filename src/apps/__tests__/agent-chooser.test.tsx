/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent chooser (the user, 28 November 2026: the landing's *Choose an
 * agent* moved into the agent's header): a plugin a host makes with the
 * agents it offers, by category, and what a choice does; its launcher, the
 * apps grid, sits at the trailing end of the chat's title bar
 * (`AgentSlots.chatHeaderEnd`, after full screen, pinned) and opens them in
 * a modal dialog that keeps the focus inside, closes on Escape, the close
 * button or a click outside, gives the focus back to the launcher, and
 * tells the host the agent chosen.
 */

// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Core's Fluent drawings load lazily: the emoji as text stands in.
vi.mock('@datalayer/core/lib/components/emoji', () => ({
  FluentEmoji: ({ emoji }: { emoji: string }) => (
    <span data-emoji="">{emoji}</span>
  ),
}));

import { ThemeProvider, BaseStyles } from '@primer/react';
import { buildReactorFromPlugins, type PluginRef } from '@datalayer/reactor';
import { ReactorSlot, registerReactor } from '@datalayer/reactor/react';
import { AgentSlots, type AgentWorkspaceContext } from '../core';
import { defineAgentCapacityPlugin } from '../plugins/agent-capacity';
import {
  AGENT_CHOOSER_PLUGIN_NAME,
  AGENT_CHOOSER_WORDS,
  agentChooserPlugin,
  agentOrderOf,
  groupToneOf,
  rovedIndex,
  trappedIndex,
  type AgentChooserGroup,
} from '../plugins/agent-chooser';
import { AgentChooser } from '../plugins/agent-chooser/AgentChooser';
import { headerSlotItems } from '../plugins/chat/headerSlotItems';
import { getAgentPresentation } from '../../specs/agentPresentations';

afterEach(() => {
  cleanup();
  registerReactor(null);
  document.body.style.overflow = '';
});

const source = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8');

/** The landing's eight, by category. */
const GROUPS: AgentChooserGroup[] = [
  { name: 'Personal', agents: ['worker-shopper', 'worker-traveller'] },
  { name: 'Business', agents: ['worker-accountant', 'worker-marketer'] },
  {
    name: 'Technology',
    agents: [
      'worker-functional-analyst',
      'worker-data-analyst',
      'worker-terra',
      'worker-steward-aws',
    ],
  },
];
const ALL = agentOrderOf(GROUPS);

function withPlatform(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  return reactor;
}

/** The Shopper at work, as its application contributes it. */
const shopperApplication = () =>
  defineAgentCapacityPlugin({
    key: 'app-test',
    displayName: 'Shopper application',
    description: 'The Shopper, for its agent.',
    specId: 'worker-shopper:0.0.1',
  }) as PluginRef;

const workspace = {
  agentId: 'shopper-instance',
} as unknown as AgentWorkspaceContext;

const themed = (node: React.ReactNode) =>
  render(
    <ThemeProvider>
      <BaseStyles>{node}</BaseStyles>
    </ThemeProvider>,
  );

function chooser(
  onChoose: (agentId: string) => void = () => undefined,
  onOuterKey: () => void = () => undefined,
) {
  withPlatform([shopperApplication()]);
  return themed(
    <div onKeyDown={onOuterKey}>
      <AgentChooser
        workspace={workspace}
        options={{
          groups: GROUPS,
          onChoose,
          heading: 'Choose an agent to try',
          says: 'Each one is live.',
        }}
      />
    </div>,
  );
}

const launcher = () =>
  screen.getByRole('button', { name: AGENT_CHOOSER_WORDS.open(8) });
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
const tile = (agentId: string) =>
  dialog().querySelector(
    `[data-agent-chooser-agent="${agentId}"]`,
  ) as HTMLElement;

describe('the chooser’s plugin', () => {
  it('puts its launcher at the trailing end of the chat’s title bar', () => {
    const plugin = agentChooserPlugin({
      groups: GROUPS,
      onChoose: () => undefined,
    });
    const reactor = withPlatform([plugin as PluginRef]);
    expect(reactor.listPlugins()).toContain(AGENT_CHOOSER_PLUGIN_NAME);
    const components =
      reactor.getOutput<{ components: { slot: string; id: string }[] }>(
        AGENT_CHOOSER_PLUGIN_NAME,
      )?.components ?? [];
    expect(components.map(entry => [entry.slot, entry.id])).toEqual([
      [AgentSlots.chatHeaderEnd, 'agent-chooser'],
    ]);
    expect(AgentSlots.chatHeaderEnd).toBe('agent.chatHeader.end');
  });

  it('refuses no agent, an empty group, and an agent that says no presentation', () => {
    const onChoose = () => undefined;
    expect(() => agentChooserPlugin({ groups: [], onChoose })).toThrow(
      /offers no agent/,
    );
    expect(() =>
      agentChooserPlugin({ groups: [{ name: 'Empty', agents: [] }], onChoose }),
    ).toThrow(/Empty has no agent/);
    expect(() =>
      agentChooserPlugin({
        groups: [{ name: 'Odd', agents: ['worker-nobody'] }],
        onChoose,
      }),
    ).toThrow(/worker-nobody says no presentation/);
  });

  it('draws its launcher through the slot', async () => {
    withPlatform([
      shopperApplication(),
      agentChooserPlugin({
        groups: GROUPS,
        onChoose: () => undefined,
      }) as PluginRef,
    ]);
    themed(
      <ReactorSlot slot={AgentSlots.chatHeaderEnd} props={{ workspace }} />,
    );
    expect(
      await screen.findByRole('button', { name: AGENT_CHOOSER_WORDS.open(8) }),
    ).toBeTruthy();
  });
});

describe('the end of the title bar', () => {
  it('pins what is placed at the end, and lets the other items leave first', () => {
    const entries = [
      {
        slot: AgentSlots.chatHeaderEnd,
        id: 'agent-chooser',
        Component: () => null,
      },
    ];
    const [end] = headerSlotItems(entries as never, workspace, 'end');
    expect(end).toMatchObject({
      key: 'slot-agent.chatHeader.end:agent-chooser',
      type: 'custom',
      pinned: true,
    });
    expect(end).not.toHaveProperty('priority');
    const [item] = headerSlotItems(
      [{ ...entries[0], slot: AgentSlots.chatHeader }] as never,
      workspace,
      'items',
    );
    expect(item).toMatchObject({ priority: -1 });
    expect(item).not.toHaveProperty('pinned');
  });

  it('is drawn after full screen, the chat’s last control', () => {
    const chat = source('plugins/chat/ChatView.tsx');
    expect(chat).toContain(
      'const chatHeaderEndItems = useSlotComponents(AgentSlots.chatHeaderEnd);',
    );
    expect(chat).toContain(
      "...headerSlotItems(chatHeaderItems, workspace, 'items'),",
    );
    const fullScreen = chat.indexOf("key: 'full-screen',");
    const end = chat.indexOf(
      "...headerSlotItems(chatHeaderEndItems, workspace, 'end'),",
    );
    expect(fullScreen).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(fullScreen);
  });
});

describe('the agent chooser', () => {
  it('is a launcher, the apps grid, that controls a closed dialog', () => {
    chooser();
    expect(launcher().getAttribute('aria-haspopup')).toBe('dialog');
    expect(launcher().getAttribute('aria-expanded')).toBe('false');
    expect(launcher().getAttribute('aria-controls')).toBe(dialog().id);
    expect(launcher().querySelector('svg')).not.toBeNull();
    expect(launcher().textContent).toContain('Choose an agent (8)');
    expect(launcher().textContent).toContain(AGENT_CHOOSER_WORDS.openShort);
    expect(dialog().closest('[hidden]')).not.toBeNull();
  });

  it('opens every agent offered, under its category, in a modal dialog named by its heading, the focus on the agent at work', () => {
    chooser();
    fireEvent.click(launcher());
    expect(launcher().getAttribute('aria-expanded')).toBe('true');
    expect(dialog().closest('[hidden]')).toBeNull();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(
      document.getElementById(dialog().getAttribute('aria-labelledby')!)!
        .textContent,
    ).toBe('Choose an agent to try');
    expect(within(dialog()).getByText('Each one is live.')).toBeTruthy();
    const tiles = Array.from(
      dialog().querySelectorAll('[data-agent-chooser-agent]'),
    );
    expect(
      tiles.map(one => one.getAttribute('data-agent-chooser-agent')),
    ).toEqual(ALL);
    GROUPS.forEach((group, index) => {
      const section = dialog().querySelector(
        `[data-agent-chooser-group="${group.name}"]`,
      ) as HTMLElement;
      expect(
        document.getElementById(section.getAttribute('aria-labelledby')!)!
          .textContent,
      ).toBe(group.name);
      expect(
        Array.from(section.querySelectorAll('[data-agent-chooser-agent]')).map(
          one => one.getAttribute('data-agent-chooser-agent'),
        ),
      ).toEqual([...group.agents]);
      expect(
        (section.querySelector('h3') as HTMLElement).style.getPropertyValue(
          '--dla-tone',
        ),
      ).toBe(groupToneOf(index).fg);
    });
    // Each agent in its presentation's words.
    const traveller = getAgentPresentation('worker-traveller')!;
    expect(tile('worker-traveller').textContent).toContain(traveller.name);
    expect(tile('worker-traveller').textContent).toContain(traveller.tagline);
    expect(document.activeElement).toBe(tile('worker-shopper'));
    expect(tile('worker-shopper').getAttribute('aria-current')).toBe('true');
    expect(tile('worker-shopper').textContent).toContain(
      AGENT_CHOOSER_WORDS.current,
    );
    expect(tile('worker-traveller').hasAttribute('aria-current')).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('tells the host the agent chosen: the dialog closes, the focus back on the launcher', () => {
    const chosen: string[] = [];
    chooser(one => chosen.push(one));
    fireEvent.click(launcher());
    fireEvent.click(tile('worker-accountant'));
    expect(chosen).toEqual(['worker-accountant']);
    expect(launcher().getAttribute('aria-expanded')).toBe('false');
    expect(dialog().closest('[hidden]')).not.toBeNull();
    expect(document.activeElement).toBe(launcher());
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape, on the close button and on a click outside, the focus back on the launcher', () => {
    chooser();
    fireEvent.click(launcher());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(launcher().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(launcher());
    fireEvent.click(launcher());
    fireEvent.click(
      within(dialog()).getByRole('button', { name: AGENT_CHOOSER_WORDS.close }),
    );
    expect(launcher().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(launcher());
    // A click inside the dialog keeps it open; one on the backdrop closes it.
    fireEvent.mouseDown(dialog());
    expect(launcher().getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseDown(
      document.querySelector('[data-agent-chooser-backdrop]')!,
    );
    expect(launcher().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the focus inside while open: Tab wraps, the arrows walk the agents, and its keys stay its own', () => {
    const outer = vi.fn();
    chooser(undefined, outer);
    fireEvent.click(launcher());
    const focusables = Array.from(
      dialog().querySelectorAll<HTMLElement>('button'),
    );
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    tile('worker-shopper').focus();
    fireEvent.keyDown(tile('worker-shopper'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tile('worker-traveller'));
    fireEvent.keyDown(tile('worker-traveller'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tile('worker-shopper'));
    fireEvent.keyDown(tile('worker-shopper'), { key: 'End' });
    expect(document.activeElement).toBe(tile(ALL[ALL.length - 1]));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(tile(ALL[0]));
    // From a portal, the title bar's toolbar would walk its own controls.
    expect(outer).not.toHaveBeenCalled();
    expect(trappedIndex(-1, 3, false)).toBe(0);
    expect(trappedIndex(0, 3, true)).toBe(2);
    expect(rovedIndex('ArrowUp', 0, 8)).toBe(7);
    expect(rovedIndex('a', 0, 8)).toBeUndefined();
  });

  it('is in the theme’s tokens, one column on a phone, short in a narrow bar, with no motion under reduced motion', () => {
    const view = source('plugins/agent-chooser/AgentChooser.tsx');
    expect(view).toContain(
      "import AppsGridIcon from '@datalayer/icons-react/data1/AppsGridIcon';",
    );
    expect(view).toContain('@media (max-width: 639px)');
    expect(view).toContain('@container (max-width: ${CHOOSER_SHORT - 1}px)');
    expect(view).toContain('@media (prefers-reduced-motion: reduce)');
    expect(view).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(view).toContain('createPortal(');
  });
});
