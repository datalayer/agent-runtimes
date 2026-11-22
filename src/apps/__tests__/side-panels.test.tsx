/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace's side panels and the agent's notices (the user, 18 November
 * 2026: "left and right side panels are the main deliverable. They are real
 * panels that receive controls and visuals: an agent's UI plugins placed
 * there … the agent can open, close and fill them through frontend tools;
 * they are kept per conversation; open/close toggles", then "the N/E/S/W
 * sliding panels are only for notices").
 *
 * - open or closed is read from the conversation's calls: the agent's
 *   `open_side_panel` / `close_side_panel`, the first call of the UI placed
 *   there, the person's toggle until the agent's next call; a conversation
 *   started over closes them;
 * - the deck placed `right` is drawn in the right panel, a line per call in
 *   the conversation; a header UI placed in a panel stacks its items;
 * - two panels never leave the view too narrow: the one opened last stays;
 * - `show_notice` slides a notice in, one per edge, words only, said to come
 *   from the agent.
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
import {
  buildReactorFromPlugins,
  definePlugin,
  type PluginRef,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SIDE_PANELS_SHOWN,
  SIDE_PANEL_VIEW_MIN,
  SidePanel,
  SidePanelToggle,
  bothFit,
  sidePanelCallEvent,
  sidePanelOpen,
  useSidePanels,
} from '../shell/SidePanel';
import { agentUiPluginsFor } from '../agentUiPlugins';
import { AgentChatExtras } from '../core';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import { CardSideContext } from '../toolCards/kit';
import { PAGE_DECK } from '../plugins/page-deck/store';
import { PageDeckCard } from '../plugins/page-deck';
import { sidePanelsTools } from '../plugins/side-panels';
import {
  NOTICES_WORDS,
  NoticeBoard,
  conversationInsets,
  NoticesOverlay,
  noticesTools,
  readNotice,
} from '../plugins/notices';
import type { RecordedToolCall } from '../toolCards/toolResults';
import type { ToolCallRenderContext } from '../../types/chat';

// The decks library draws with Reveal, which a test's document cannot size.
vi.mock('../plugins/page-deck/DeckStage', async () => {
  const actual = await vi.importActual<
    typeof import('../plugins/page-deck/DeckStage')
  >('../plugins/page-deck/DeckStage');
  return {
    ...actual,
    default: ({ spec }: { spec: { slides: unknown[] } }) => (
      <div data-testid="deck-stage" data-slides={spec.slides.length} />
    ),
  };
});

afterEach(() => {
  cleanup();
  act(() => {
    PAGE_TOOL_RESULTS.clear();
    PAGE_DECK.reset();
  });
  registerReactor(null);
});

let ids = 0;
/** A call answered in the conversation, as the transcript records it. */
const recorded = (
  toolName: string,
  args: Record<string, unknown>,
  result: unknown = { ok: true },
): string => {
  ids += 1;
  const toolCallId = `side-call-${ids}`;
  act(() => {
    PAGE_TOOL_RESULTS.record([
      {
        type: 'tool-call',
        status: 'complete',
        toolCallId,
        toolName,
        args,
        result,
      },
    ]);
  });
  return toolCallId;
};

const call = (
  name: string,
  args: Record<string, unknown>,
  order: number,
  result: unknown = { ok: true },
): RecordedToolCall => ({
  toolCallId: `c${order}`,
  toolName: name,
  args,
  result,
  order,
});

describe('open or closed, from the conversation', () => {
  it('is the agent’s last word on that side', () => {
    const calls = [
      call('open_side_panel', { side: 'right' }, 1),
      call('open_side_panel', { side: 'left' }, 2),
      call('close_side_panel', { side: 'right' }, 3),
    ];
    expect(sidePanelCallEvent('right', calls, [])).toEqual({
      open: false,
      order: 3,
      seq: 0,
    });
    expect(sidePanelCallEvent('left', calls, [])?.open).toBe(true);
    // A refused call says nothing.
    expect(
      sidePanelCallEvent(
        'right',
        [call('open_side_panel', { side: 'right' }, 1, 'Nothing is placed')],
        [],
      ),
    ).toBeUndefined();
  });

  it('opens with the first call of what is placed there, once', () => {
    const calls = [
      call('deck_create', { title: 'Recap' }, 1),
      call('deck_add_slide', { title: 'One' }, 2),
    ];
    expect(sidePanelCallEvent('right', calls, ['deck_create'])).toEqual({
      open: true,
      order: 1,
      seq: 0,
    });
    // Closed by the agent since: closed, though slides keep coming.
    expect(
      sidePanelCallEvent(
        'right',
        [
          ...calls,
          call('close_side_panel', { side: 'right' }, 3),
          call('deck_create', { title: 'Another' }, 4),
        ],
        ['deck_create', 'deck_add_slide'],
      )?.open,
    ).toBe(false);
  });

  it('gives the person the last word until the agent’s next call', () => {
    const agent = { open: true, order: 4, seq: 0 };
    expect(sidePanelOpen(agent, { open: false, order: 4, seq: 1 })).toBe(false);
    expect(sidePanelOpen(agent, { open: false, order: 3, seq: 9 })).toBe(true);
    expect(sidePanelOpen(undefined, undefined)).toBe(false);
  });

  it('keeps two panels beside the view only where the view keeps its room', () => {
    const panel = { width: 400 };
    expect(bothFit(400 + 400 + SIDE_PANEL_VIEW_MIN, panel, panel)).toBe(true);
    expect(bothFit(1100, panel, { width: 520 })).toBe(false);
    expect(bothFit(600, { width: 0 }, { width: 0 })).toBe(false);
  });
});

/** The shell's part: both toggles, both panels, a view between them. */
function Shell({ rowWidth = 1600 }: { rowWidth?: number }): React.JSX.Element {
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const panels = useSidePanels(rowRef);
  return (
    <div>
      <SidePanelToggle panel={panels.left} />
      <SidePanelToggle panel={panels.right} />
      <div ref={rowRef} data-row-width={rowWidth}>
        <SidePanel panel={panels.left} narrow={panels.narrow} props={{}} />
        <main>the conversation</main>
        <SidePanel panel={panels.right} narrow={panels.narrow} props={{}} />
      </div>
    </div>
  );
}

const mount = (plugins: PluginRef[]) => {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  const view = render(
    <ThemeProvider>
      <Shell />
    </ThemeProvider>,
  );
  return { reactor, view };
};

/** A button's accessible name: its label, or the tooltip that labels it (Primer's IconButton). */
const nameOf = (button: HTMLElement): string | null | undefined =>
  button.getAttribute('aria-label') ??
  document.getElementById(button.getAttribute('aria-labelledby') ?? '')
    ?.textContent;

const rightPanel = () =>
  document.querySelector<HTMLElement>('[data-agent-right-panel]');
const rightToggle = () =>
  document.querySelector<HTMLButtonElement>('[data-agent-right-panel-toggle]');

describe('the deck placed in the right panel', () => {
  const placed = () =>
    agentUiPluginsFor([
      { plugin: 'page-deck', placement: 'right' },
      { plugin: 'side-panels', placement: 'message' },
    ]);

  it('is the right panel’s, its toggle trailing, closed to start with', () => {
    const { reactor } = mount(placed());
    expect(rightPanel()).not.toBeNull();
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
    expect(document.querySelector('[data-agent-left-panel-toggle]')).toBeNull();
    const toggle = rightToggle()!;
    expect(nameOf(toggle)).toBe('Deck in the page');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(rightPanel()!.id);
    // The deck's tools and the panels' reach the agent with the chat's extras.
    const tools = reactor
      .getContributions(AgentChatExtras)
      .flatMap(entry => entry.value.extras.value.frontendTools ?? [])
      .map(tool => tool.name);
    expect(tools).toEqual(
      expect.arrayContaining([
        'deck_create',
        'open_side_panel',
        'close_side_panel',
      ]),
    );
  });

  it('opens with the first slide, and the conversation keeps a line per call', async () => {
    mount(placed());
    expect(SIDE_PANELS_SHOWN.right).toEqual(['page-deck-right']);
    // The handler builds the deck in the page; the transcript records the call.
    await act(async () => {
      PAGE_DECK.set({
        ...PAGE_DECK.read(),
        spec: {
          ...PAGE_DECK.read().spec,
          slides: [
            { id: 's1', template: 'title', content: { title: 'Recap' } },
          ] as never,
        },
      });
    });
    const id = recorded('deck_create', { title: 'Recap' });
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    expect(rightToggle()).toBeNull();
    expect(rightPanel()!.querySelector('[data-page-deck]')).not.toBeNull();
    // In the conversation, the call is a line, not the deck.
    const context: ToolCallRenderContext = {
      toolCallId: id,
      toolName: 'deck_create',
      name: 'deck_create',
      args: { title: 'Recap' },
      result: { ok: true },
      status: 'complete',
    };
    const line = render(
      <ThemeProvider>
        <CardSideContext.Provider value="right">
          <PageDeckCard context={context} />
        </CardSideContext.Provider>
      </ThemeProvider>,
    );
    expect(
      line.container.querySelector('[data-page-tool-line="deck_create"]'),
    ).not.toBeNull();
    expect(line.container.querySelector('[data-page-deck]')).toBeNull();
  });

  it('closes with its Close control, the focus back on its toggle', () => {
    mount(placed());
    recorded('deck_create', { title: 'Recap' });
    const close = document.querySelector<HTMLButtonElement>(
      '[data-agent-right-panel-close]',
    )!;
    expect(nameOf(close)).toBe('Close: Deck in the page');
    act(() => close.click());
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
    expect(document.activeElement).toBe(rightToggle());
    // Escape closes it too, once opened again.
    act(() => rightToggle()!.click());
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    fireEvent.keyDown(rightPanel()!, { key: 'Escape' });
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
  });

  it('opens and closes with the agent’s calls, the person’s word lasting until its next one', () => {
    mount(placed());
    recorded(
      'open_side_panel',
      { side: 'right' },
      { side: 'right', open: true },
    );
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-agent-right-panel-close]')!
        .click(),
    );
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
    recorded(
      'open_side_panel',
      { side: 'right' },
      { side: 'right', open: true },
    );
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    recorded(
      'close_side_panel',
      { side: 'right' },
      { side: 'right', open: false },
    );
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
  });

  it('is the conversation’s: started over, it closes', () => {
    mount(placed());
    recorded('deck_create', { title: 'Recap' });
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    act(() => PAGE_TOOL_RESULTS.clear());
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
    expect(rightToggle()).not.toBeNull();
  });
});

describe('two panels beside a view too narrow for three', () => {
  it('keep only the one opened last', () => {
    // The row is as wide as the landing's chat: 1118px.
    const width = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ width: 1118 }) as DOMRect);
    const observers: Array<(entries: unknown[]) => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: unknown[]) => void) {
          observers.push(callback);
        }
        observe() {
          observers.forEach(callback =>
            callback([{ contentRect: { width: 1118 } }]),
          );
        }
        disconnect() {}
      },
    );
    const about = {
      slot: 'agent.leftPanel',
      id: 'about',
      Component: () => <p>About</p>,
      panel: { label: 'About the Marketer' },
    };
    mount([
      ...agentUiPluginsFor([{ plugin: 'page-deck', placement: 'right' }]),
      definePlugin({
        name: 'test-about',
        build: () => ({ components: [about] }),
      }) as PluginRef,
    ]);
    const leftPanel = () =>
      document.querySelector<HTMLElement>('[data-agent-left-panel]')!;
    // The deck opens the right one; the person then opens the left one.
    recorded('deck_create', { title: 'Recap' });
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-agent-left-panel-toggle]')!
        .click(),
    );
    expect(leftPanel().hasAttribute('data-open')).toBe(true);
    expect(rightPanel()!.hasAttribute('data-open')).toBe(false);
    // The agent opens the right one: it was the last to open, the left closes.
    recorded(
      'open_side_panel',
      { side: 'right' },
      { side: 'right', open: true },
    );
    expect(rightPanel()!.hasAttribute('data-open')).toBe(true);
    expect(leftPanel().hasAttribute('data-open')).toBe(false);
    width.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('the agent’s tools for the side panels', () => {
  const [open, close] = sidePanelsTools();

  it('open a side that has something placed in it, and say so of one that has not', async () => {
    SIDE_PANELS_SHOWN.right = ['page-deck-right'];
    SIDE_PANELS_SHOWN.left = [];
    await expect(open.handler!({ side: 'right' })).resolves.toEqual({
      side: 'right',
      open: true,
    });
    await expect(open.handler!({ side: 'left' })).rejects.toThrow(
      'Nothing is placed in the left panel of this chat',
    );
    await expect(open.handler!({ side: 'top' })).rejects.toThrow(
      '"side" is "left" or "right"',
    );
    await expect(close.handler!({ side: 'left' })).resolves.toEqual({
      side: 'left',
      open: false,
    });
    expect(open.summaryOf!({ side: 'right' }, {})).toBe(
      'Opened the right panel',
    );
    SIDE_PANELS_SHOWN.right = [];
  });
});

describe('a header UI placed in a side panel', () => {
  it('stacks its items under its name, a dash for what the agent did not say', () => {
    mount(agentUiPluginsFor([{ plugin: 'shop-header', placement: 'right' }]));
    act(() => rightToggle()!.click());
    expect(rightPanel()!.getAttribute('aria-label')).toBe('Shopping header');
    const section = rightPanel()!.querySelector<HTMLElement>(
      '[data-header-panel]',
    )!;
    expect(section.getAttribute('aria-label')).toBe('Shopping header');
    expect(
      section.querySelector('[data-header-panel-row="approval"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Budget: No limit' }),
    ).toBeTruthy();
    recorded('set_shop_header', { basket: { value: 2, label: '$40.00' } });
    expect(
      section
        .querySelector('[data-header-indicator="basket"]')!
        .getAttribute('aria-label'),
    ).toBe('Basket: 2 · $40.00');
  });
});

describe('notices', () => {
  it('take a tone, a title, a line, an edge and how long', () => {
    expect(readNotice({ tone: 'success', title: 'Deck ready' })).toEqual({
      tone: 'success',
      title: 'Deck ready',
      text: '',
      edge: 'north',
      seconds: 8,
    });
    expect(readNotice({ tone: 'error', title: 'Failed' })).toMatchObject({
      seconds: 0,
    });
    expect(readNotice({ tone: 'loud', title: 'x' })).toBe(NOTICES_WORDS.tone);
    expect(readNotice({ tone: 'info', title: ' ' })).toBe(NOTICES_WORDS.title);
    expect(readNotice({ tone: 'info', title: 'x', edge: 'up' })).toBe(
      NOTICES_WORDS.edge,
    );
    expect(readNotice({ tone: 'info', title: 'x', seconds: 99 })).toBe(
      NOTICES_WORDS.seconds,
    );
    // Words only: a button, a link or anything else is no field of a notice.
    expect(readNotice({ tone: 'info', title: 'x', action: 'Buy' })).toBe(
      NOTICES_WORDS.unknown('action'),
    );
  });

  it('slide between the chat’s title bar and its composer', () => {
    const box = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 600,
        width: 600,
        height: bottom - top,
      }) as DOMRect;
    const view = document.createElement('div');
    view.innerHTML =
      '<div data-chat-header=""></div><main></main><div class="band"><div data-chat-composer=""></div></div>';
    document.body.appendChild(view);
    view.getBoundingClientRect = () => box(100, 700);
    (
      view.querySelector('[data-chat-header]') as HTMLElement
    ).getBoundingClientRect = () => box(100, 156);
    (view.querySelector('.band') as HTMLElement).getBoundingClientRect = () =>
      box(590, 700);
    expect(conversationInsets(view)).toEqual({ top: 56, bottom: 110 });
    view.innerHTML = '<main></main>';
    expect(conversationInsets(view)).toEqual({ top: 0, bottom: 0 });
    view.remove();
  });

  it('are one per edge: a second replaces the first, and the agent is told', async () => {
    const board = new NoticeBoard();
    const [show] = noticesTools(board);
    await expect(
      show.handler!({ tone: 'info', title: 'One', edge: 'east' }),
    ).resolves.toEqual({ shown: 'east', replaced: false });
    await expect(
      show.handler!({ tone: 'warning', title: 'Two', edge: 'east' }),
    ).resolves.toEqual({ shown: 'east', replaced: true });
    await expect(show.handler!({ tone: 'nope', title: 'x' })).rejects.toThrow(
      NOTICES_WORDS.tone,
    );
    expect(board.notices().map(notice => notice.title)).toEqual(['Two']);
  });

  it('slide in inside the view, say they come from the agent, and go with Close, Escape or a new conversation', async () => {
    const board = new NoticeBoard();
    const [show] = noticesTools(board);
    render(
      <ThemeProvider>
        <div style={{ position: 'relative' }}>
          <NoticesOverlay board={board} />
          <div data-chat-header="">The chat’s title bar</div>
          <div>
            <div data-chat-composer="">The composer</div>
          </div>
        </div>
      </ThemeProvider>,
    );
    await act(async () => {
      await show.handler!({
        tone: 'success',
        title: 'Deck ready',
        text: 'Six slides.',
      });
      await show.handler!({ tone: 'error', title: 'Not sent', edge: 'south' });
    });
    const panels = document.querySelectorAll<HTMLElement>(
      '[data-sliding-panel]',
    );
    expect([...panels].map(panel => panel.dataset.slidingPanel)).toEqual([
      'north',
      'south',
    ]);
    // Between the title bar and the composer, in their measure.
    const region = document.querySelector<HTMLElement>(
      '[data-notices-region]',
    )!;
    expect(region.contains(document.querySelector('[data-chat-header]'))).toBe(
      false,
    );
    const success = screen.getByRole('status');
    expect(success.textContent).toContain(NOTICES_WORDS.from);
    expect(success.textContent).toContain('Deck ready');
    expect(success.textContent).toContain('Six slides.');
    // An error is announced at once.
    expect(screen.getByRole('alert').textContent).toContain('Not sent');
    // No control but its Close.
    expect(
      [...success.querySelectorAll('button')].map(button => nameOf(button)),
    ).toEqual([NOTICES_WORDS.close]);
    act(() => success.querySelector('button')!.click());
    expect(board.notices().map(notice => notice.edge)).toEqual(['south']);
    fireEvent.keyDown(screen.getByRole('alert'), { key: 'Escape' });
    expect(board.notices()).toEqual([]);
    await act(async () => {
      await show.handler!({ tone: 'info', title: 'Again' });
    });
    recorded('show_notice', { tone: 'info', title: 'Again' });
    act(() => PAGE_TOOL_RESULTS.clear());
    expect(board.notices()).toEqual([]);
  });
});
