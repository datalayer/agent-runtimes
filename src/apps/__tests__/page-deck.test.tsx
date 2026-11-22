/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deck built in the page with frontend tools (the user, 18 November 2026:
 * "add to the marketer the frontend tools to create slides").
 *
 * - the tools are typed, and each checks what it is given in the page: a
 *   refusal is a sentence, and the deck stands as it was;
 * - a slide holds text: a picture or a link only at an https address, no
 *   field of the model's own;
 * - a deck holds so many slides, and says so;
 * - the deck is the conversation's: built again from the recorded calls of
 *   a restored conversation, emptied when the conversation starts over;
 * - the last call that changed it draws it, each call before is a line;
 * - a Battle's deck arena is three of these tools, with its five slides.
 */

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolBindings } from '@datalayer/reactor/ui';
import {
  DECK_ARENA_TOOL_NAMES,
  DECK_LIMITS,
  DECK_SLIDE_KINDS,
  DECK_TEMPLATES,
  DECK_TEMPLATE_NAMES,
  DECK_TOOL_NAMES,
  applyDeckCall,
  deckArenaTools,
  deckSays,
  deckTools,
  emptyDeck,
  slideOf,
  type DeckState,
} from '../pageTools/deck';
import { ConversationBound, succeeded } from '../pageTools/conversation';
import { AgentChatExtras } from '../core';
import { agentUiIdsOf, agentUiPluginsFor } from '../agentUiPlugins';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import {
  PageDeckCard,
  PageDeckPlugin,
  deckCallSays,
} from '../plugins/page-deck';
import { PAGE_DECK, pageDeckTools } from '../plugins/page-deck/store';
import { stagedDeck } from '../plugins/page-deck/DeckStage';
import type { ToolCallRenderContext } from '../../types/chat';

// The decks library draws with Reveal, which a test's document cannot size:
// the stage is stood in for by what it was given.
vi.mock('../plugins/page-deck/DeckStage', async () => {
  const actual = await vi.importActual<
    typeof import('../plugins/page-deck/DeckStage')
  >('../plugins/page-deck/DeckStage');
  return {
    ...actual,
    default: ({ spec, shown }: { spec: DeckState['spec']; shown?: number }) => (
      <div
        data-testid="deck-stage"
        data-slides={spec.slides.length}
        data-shown={shown}
      />
    ),
  };
});

type Tool = { name: string; handler?: (args: never) => Promise<unknown> };

const call = (tools: Tool[], name: string, args: Record<string, unknown>) => {
  const tool = tools.find(each => each.name === name);
  if (!tool?.handler) {
    throw new Error(`No tool ${name}`);
  }
  return tool.handler(args as never) as Promise<Record<string, unknown>>;
};

const bound = () => {
  let state = emptyDeck();
  const tools = deckTools({
    read: () => state,
    change: next => (state = next(state)),
  });
  return { tools, read: () => state };
};

let ids = 0;
const recorded = (
  toolName: string,
  args: Record<string, unknown>,
  result: unknown = { ok: true },
): string => {
  ids += 1;
  const toolCallId = `deck-call-${ids}`;
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

const context = (
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  more: Partial<ToolCallRenderContext> = {},
): ToolCallRenderContext => ({
  toolCallId,
  toolName,
  name: toolName,
  args,
  status: 'complete',
  result: { ok: true },
  defaultUI: <span data-testid="default-row">row</span>,
  ...more,
});

afterEach(() => {
  cleanup();
  act(() => {
    PAGE_TOOL_RESULTS.clear();
    PAGE_DECK.reset();
  });
});

describe('the deck tools', () => {
  it('are nine, typed, each with a handler', () => {
    const { tools } = bound();
    expect(tools.map(tool => tool.name)).toEqual([...DECK_TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.parameters).toMatchObject({ type: 'object' });
      expect(typeof tool.handler).toBe('function');
      expect(tool.description.length).toBeGreaterThan(20);
    }
    const add = tools.find(tool => tool.name === 'deck_add_slide')!;
    const properties = (
      add.parameters as { properties: Record<string, { enum?: string[] }> }
    ).properties;
    expect(properties.type.enum).toEqual([
      ...DECK_SLIDE_KINDS,
      'metrics',
      'image',
    ]);
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'title',
        'items',
        'notes',
        'image',
        'metrics',
        'at',
      ]),
    );
  });

  it('build a deck: create, add with notes and a picture, replace, move, delete, theme, read', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', {
      title: 'Autumn launch',
      subtitle: 'Harbor & Pine',
    });
    await call(tools, 'deck_add_slide', {
      type: 'title',
      title: 'Autumn launch',
      notes: 'Open warmly.',
    });
    await call(tools, 'deck_add_slide', {
      type: 'bullets',
      title: 'The plan',
      items: ['Tease on Monday', 'Launch on Thursday'],
      image: 'https://images.example.com/beans.jpg',
      image_alt: 'Roasted beans',
    });
    await call(tools, 'deck_add_slide', {
      type: 'metrics',
      title: 'Last campaign',
      metrics: [
        { value: '4.2%', label: 'click rate' },
        { value: 1280, label: 'new followers' },
      ],
    });
    const added = await call(tools, 'deck_add_slide', {
      type: 'closing',
      title: 'Thank you',
      cta: 'Reply to book a tasting',
    });
    expect(added).toMatchObject({ ok: true, slides: 4 });
    expect(read().spec.slides.map(slide => slide.type)).toEqual([
      'title',
      'artifact',
      'metrics',
      'closing',
    ]);
    expect(read().spec.slides[0].notes).toBe('Open warmly.');
    expect(read().spec.slides[1]).toMatchObject({
      visual: {
        src: 'https://images.example.com/beans.jpg',
        alt: 'Roasted beans',
      },
    });

    await call(tools, 'deck_update_slide', {
      slide: 2,
      type: 'bullets',
      title: 'The plan',
      items: ['One', 'Two', 'Three'],
    });
    expect(read().spec.slides[1]).toEqual({
      type: 'bullets',
      title: 'The plan',
      items: ['One', 'Two', 'Three'],
    });
    expect(read().shown).toBe(2);

    await call(tools, 'deck_move_slide', { slide: 3, to: 2 });
    expect(read().spec.slides.map(slide => slide.type)).toEqual([
      'title',
      'metrics',
      'bullets',
      'closing',
    ]);

    await call(tools, 'deck_add_slide', {
      type: 'section',
      title: 'Results',
      at: 2,
    });
    expect(read().spec.slides.map(slide => slide.type)).toEqual([
      'title',
      'section',
      'metrics',
      'bullets',
      'closing',
    ]);

    await call(tools, 'deck_delete_slide', { slide: 5 });
    expect(read().spec.slides).toHaveLength(4);

    const themed = await call(tools, 'deck_set_theme', {
      template: 'brand',
      color_mode: 'dark',
    });
    expect(themed).toEqual({ ok: true, template: 'brand', color_mode: 'dark' });
    expect(read().spec.deck).toMatchObject({
      title: 'Autumn launch',
      template: 'datalayer-brand',
      colorMode: 'dark',
    });

    const said = (await call(tools, 'deck_read', {})).deck as string;
    expect(said).toContain('Deck “Autumn launch” — Harbor & Pine, 4 slides.');
    expect(said).toContain('1. title: Autumn launch (notes)');
    expect(said).toContain(
      '3. metrics “Last campaign”: 4.2% click rate; 1280 new followers',
    );
  });

  it('refuse in a sentence, and leave the deck as it was', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', { title: 'A deck' });
    await call(tools, 'deck_add_slide', { type: 'section', title: 'One' });
    const before = read();
    const refusals: [string, Record<string, unknown>, RegExp][] = [
      ['deck_add_slide', { type: 'bullets', title: 'No items' }, /takes items/],
      ['deck_add_slide', { type: 'poster', title: 'x' }, /A slide is one of/],
      [
        'deck_add_slide',
        { type: 'section', title: 'x', html: '<b>x</b>' },
        /not html/,
      ],
      [
        'deck_add_slide',
        { type: 'image', image: 'javascript:alert(1)' },
        /https:\/\//,
      ],
      [
        'deck_add_slide',
        { type: 'image', image: 'data:text/html;base64,AAAA' },
        /https:\/\//,
      ],
      [
        'deck_add_slide',
        { type: 'section', title: '[click](javascript:alert(1))' },
        /links only to an address starting with https/,
      ],
      [
        'deck_add_slide',
        { type: 'section', title: 'x'.repeat(DECK_LIMITS.title + 1) },
        /160 at most/,
      ],
      [
        'deck_add_slide',
        {
          type: 'bullets',
          items: Array.from({ length: 9 }, (_, i) => `line ${i}`),
        },
        /8 items at most/,
      ],
      [
        'deck_add_slide',
        {
          type: 'section',
          title: 'x',
          notes: 'n'.repeat(DECK_LIMITS.notes + 1),
        },
        /2000 at most/,
      ],
      [
        'deck_update_slide',
        { slide: 4, type: 'section', title: 'x' },
        /between 1 and 1/,
      ],
      ['deck_move_slide', { slide: 1, to: 9 }, /between 1 and 1/],
      ['deck_delete_slide', { slide: 0 }, /between 1 and 1/],
      ['deck_delete_slide', { slide: '1' }, /a slide's number/],
      ['deck_set_theme', { template: 'neon' }, /one of datalayer, brand, ink/],
      ['deck_set_theme', {}, /Name a template/],
      ['deck_create', { title: '  ' }, /non-empty text/],
    ];
    for (const [name, args, why] of refusals) {
      await expect(
        call(tools, name, args),
        `${name} ${JSON.stringify(args).slice(0, 60)}`,
      ).rejects.toThrow(why);
      expect(read()).toBe(before);
    }
  });

  it('keep what a slide says as text: markup is words, never an element', () => {
    const slide = slideOf({
      type: 'bullets',
      title: '<script>alert(1)</script>',
      items: ['<img src=x onerror=alert(1)>'],
    });
    expect(slide).toEqual({
      type: 'bullets',
      title: '<script>alert(1)</script>',
      items: ['<img src=x onerror=alert(1)>'],
    });
    // An https link is the one address a slide's text may carry.
    expect(
      slideOf({
        type: 'section',
        title: 'See [the plan](https://example.com/plan)',
      }),
    ).toMatchObject({ type: 'section' });
  });

  it('hold forty slides, and say so to the model', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', { title: 'Long' });
    for (let i = 0; i < DECK_LIMITS.slides; i += 1) {
      await call(tools, 'deck_add_slide', {
        type: 'section',
        title: `Part ${i + 1}`,
      });
    }
    await expect(
      call(tools, 'deck_add_slide', { type: 'section', title: 'One more' }),
    ).rejects.toThrow(
      /A deck holds 40 slides at most, and this one has them: replace or delete a slide instead\./,
    );
    expect(read().spec.slides).toHaveLength(40);
  });

  it('are, for a Battle, three tools and five kinds of slide', async () => {
    let state = emptyDeck();
    const tools = deckArenaTools({
      read: () => state,
      change: next => (state = next(state)),
    });
    expect(tools.map(tool => tool.name)).toEqual([...DECK_ARENA_TOOL_NAMES]);
    const add = tools.find(tool => tool.name === 'deck_add_slide')!;
    const properties = (
      add.parameters as { properties: Record<string, { enum?: string[] }> }
    ).properties;
    expect(properties.type.enum).toEqual([...DECK_SLIDE_KINDS]);
    expect(properties.at).toBeUndefined();
    expect(add.description).toBe(
      'Add a slide at the end of the deck: a `title` (title, subtitle), a `section` (title), `bullets` (title, items: three to five short lines), a `statement` (statement, attribution), or a `closing` (title, cta).',
    );
    await call(tools, 'deck_set_title', { title: 'Why a newsletter' });
    await expect(
      call(tools, 'deck_add_slide', {
        type: 'metrics',
        metrics: [{ value: '1', label: 'x' }],
      }),
    ).rejects.toThrow(
      /A slide is one of title, section, bullets, statement, closing\./,
    );
    await call(tools, 'deck_add_slide', { type: 'section', title: 'The why' });
    expect(deckSays(state)).toBe(
      'Deck “Why a newsletter”, 1 slide.\n1. section: The why',
    );
  });
});

describe('the deck’s templates', () => {
  it('are the decks library’s own, each under the name it registers', async () => {
    const { deckTemplates } = await import('@datalayer/decks');
    for (const name of DECK_TEMPLATES) {
      expect(deckTemplates[DECK_TEMPLATE_NAMES[name]], name).toBeDefined();
    }
    expect(deckTemplates[emptyDeck().spec.deck.template]).toBeDefined();
  });
});

describe('the conversation’s deck', () => {
  const CALLS: [string, Record<string, unknown>][] = [
    ['deck_create', { title: 'Recap' }],
    ['deck_add_slide', { type: 'section', title: 'Reach' }],
    ['deck_add_slide', { type: 'statement', statement: 'Up a third.' }],
    ['deck_move_slide', { slide: 2, to: 1 }],
  ];

  it('is the same built by the handlers and replayed from the calls', async () => {
    const { tools, read } = bound();
    let replayed = emptyDeck();
    for (const [name, args] of CALLS) {
      await call(tools, name, args);
      replayed = applyDeckCall(replayed, name, args);
    }
    expect(replayed).toEqual(read());
  });

  it('is built again from the recorded calls of a restored conversation, without those refused', async () => {
    recorded('deck_create', { title: 'Recap' });
    recorded('deck_add_slide', { type: 'section', title: 'Reach' });
    recorded(
      'deck_add_slide',
      { type: 'bullets' },
      'A bullets slide takes items: one short line each.',
    );
    recorded('worker__deck_add_slide', {
      type: 'statement',
      statement: 'Up a third.',
    });
    await act(() => PAGE_DECK.sync(PAGE_TOOL_RESULTS.callsOf(DECK_TOOL_NAMES)));
    expect(deckSays(PAGE_DECK.read())).toBe(
      'Deck “Recap”, 2 slides.\n1. section: Reach\n2. statement: Up a third.',
    );
  });

  it('takes the next call on top of what was restored, and is emptied when the conversation starts over', async () => {
    recorded('deck_create', { title: 'Recap' });
    recorded('deck_add_slide', { type: 'section', title: 'Reach' });
    const tools = pageDeckTools();
    const added = await call(tools, 'deck_add_slide', {
      type: 'closing',
      title: 'Thanks',
    });
    expect(added).toMatchObject({ ok: true, slides: 2 });
    expect(PAGE_DECK.read().spec.deck.title).toBe('Recap');
    recorded('deck_add_slide', { type: 'closing', title: 'Thanks' });
    await act(() => PAGE_DECK.sync(PAGE_TOOL_RESULTS.callsOf(DECK_TOOL_NAMES)));
    // Not replayed over what the handlers built: still two slides.
    expect(PAGE_DECK.read().spec.slides).toHaveLength(2);
    act(() => PAGE_TOOL_RESULTS.clear());
    await act(() => PAGE_DECK.sync(PAGE_TOOL_RESULTS.callsOf(DECK_TOOL_NAMES)));
    expect(PAGE_DECK.read()).toEqual(emptyDeck());
  });

  it('reads a call as done only when its tool answered ok', () => {
    expect(succeeded({ result: { ok: true, slides: 1 } })).toBe(true);
    expect(succeeded({ result: '{"ok": true}' })).toBe(true);
    expect(succeeded({ result: 'The title is a non-empty text.' })).toBe(false);
    expect(succeeded({ result: { error: 'x' } })).toBe(false);
    expect(succeeded({ result: undefined })).toBe(false);
  });

  it('keeps one replay at a time and lets a handler’s state stand', async () => {
    let release: (state: number) => void = () => undefined;
    const slow = new ConversationBound<number>({
      fresh: () => 0,
      writes: ['count'],
      replay: () => new Promise<number>(resolve => (release = resolve)),
    });
    const syncing = slow.sync([
      {
        toolCallId: 'a',
        toolName: 'count',
        args: {},
        result: { ok: true },
        order: 1,
      },
    ]);
    await Promise.resolve();
    slow.set(7);
    release(1);
    await syncing;
    expect(slow.read()).toBe(7);
  });
});

describe('the page-deck plugin', () => {
  it('hands the chat the deck tools with its extras, and binds each to its card', () => {
    const contributes = (
      PageDeckPlugin as unknown as {
        contributes: { point: unknown; value: unknown; id?: string }[];
      }
    ).contributes;
    const extras = contributes.find(entry => entry.point === AgentChatExtras);
    const tools = (
      extras?.value as { extras: { value: { frontendTools: Tool[] } } }
    ).extras.value.frontendTools;
    expect(tools.map(tool => tool.name)).toEqual([...DECK_TOOL_NAMES]);
    expect(
      contributes.filter(entry => entry.point === ToolBindings),
    ).toHaveLength(DECK_TOOL_NAMES.length);
    expect((PageDeckPlugin as { name: string }).name).toBe(
      '@datalayer/agent-plugin-page-deck',
    );
  });

  it('is mounted for a visitor too, with the Accountant’s sheet: neither needs a connection', () => {
    const mounted = agentUiPluginsFor(
      [{ plugin: 'page-deck' }, { plugin: 'page-sheet' }],
      { anonymous: true },
    ).map(plugin => (plugin as { name: string }).name);
    expect(mounted).toEqual([
      '@datalayer/agent-plugin-page-deck',
      '@datalayer/agent-plugin-page-sheet',
    ]);
    expect(agentUiIdsOf('worker-marketer')).toContain('page-deck');
    expect(agentUiIdsOf('worker-accountant')).toContain('page-sheet');
  });

  it('draws the deck at the last call that changed it, and a line at each call before', async () => {
    const tools = pageDeckTools();
    await call(tools, 'deck_create', { title: 'Autumn launch' });
    await call(tools, 'deck_add_slide', { type: 'section', title: 'Why now' });
    const first = recorded('deck_create', { title: 'Autumn launch' });
    const second = recorded('deck_add_slide', {
      type: 'section',
      title: 'Why now',
    });
    render(
      <ThemeProvider>
        <PageDeckCard
          context={context(first, 'deck_create', { title: 'Autumn launch' })}
        />
        <PageDeckCard
          context={context(second, 'deck_add_slide', {
            type: 'section',
            title: 'Why now',
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Started the deck “Autumn launch”')).toBeTruthy();
    expect(screen.getByText('Added a section slide “Why now”')).toBeTruthy();
    const frames = document.querySelectorAll('[data-page-deck]');
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute('data-page-deck-slides')).toBe('1');
    expect(frames[0].getAttribute('aria-label')).toBe('Deck: Autumn launch');
    expect(screen.getByText('1 slide')).toBeTruthy();
    const stage = await screen.findByTestId('deck-stage');
    expect(stage.getAttribute('data-shown')).toBe('1');

    // A third call: the deck moves down to it, live, with the new slide.
    await act(async () => {
      await call(tools, 'deck_add_slide', { type: 'closing', title: 'Thanks' });
    });
    expect(
      document
        .querySelector('[data-page-deck]')
        ?.getAttribute('data-page-deck-slides'),
    ).toBe('2');
  });

  it('leaves a refused or failed call to the chat’s own row, and a running one to a line', () => {
    render(
      <ThemeProvider>
        <PageDeckCard
          context={context(
            'x1',
            'deck_add_slide',
            { type: 'bullets' },
            { result: 'A bullets slide takes items.' },
          )}
        />
        <PageDeckCard
          context={context(
            'x2',
            'deck_add_slide',
            {},
            { status: 'error', result: undefined },
          )}
        />
        <PageDeckCard
          context={context(
            'x3',
            'deck_add_slide',
            {},
            { status: 'executing' as never, result: undefined },
          )}
        />
      </ThemeProvider>,
    );
    expect(screen.getAllByTestId('default-row')).toHaveLength(2);
    expect(screen.getByText('Writing the deck…')).toBeTruthy();
    expect(document.querySelector('[data-page-deck]')).toBeNull();
  });

  it('says each call in a line', () => {
    expect(
      deckCallSays('deck_update_slide', { slide: 3, title: 'Reach' }),
    ).toBe('Replaced slide 3 “Reach”');
    expect(deckCallSays('deck_move_slide', { slide: 3, to: 1 })).toBe(
      'Moved slide 3 to 1',
    );
    expect(deckCallSays('deck_delete_slide', { slide: 2 })).toBe(
      'Deleted slide 2',
    );
    expect(
      deckCallSays('deck_set_theme', { template: 'brand', color_mode: 'dark' }),
    ).toBe('Set the deck’s look: brand, dark');
    expect(deckCallSays('deck_read', {})).toBe('Read the deck');
  });

  it('keeps the theme a deck asks for to the deck: the page is not told', () => {
    const staged = stagedDeck({
      deck: {
        title: 'T',
        template: 'brand',
        theme: 'matrix',
        colorMode: 'dark',
      },
      slides: [],
    });
    expect(staged.spec.deck).toEqual({ title: 'T', template: 'brand' });
    expect(staged.theme).toBe('matrix');
    expect(staged.colorMode).toBe('dark');
  });
});
