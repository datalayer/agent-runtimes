/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deck's outline in one call: `deck_add_slides` (the user, 19 November
 * 2026). A deck built one slide per call took a run per slide, and the
 * runtime ends a turn after ten runs of page tools; laid out in one or two
 * calls, ten slides take one or two. Each slide is checked as
 * `deck_add_slide` checks it, and one bad slide refuses the whole batch:
 * nothing is added.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DECK_ARENA_TOOL_NAMES,
  DECK_LIMITS,
  DECK_TOOL_NAMES,
  applyDeckCall,
  deckArenaTools,
  deckTools,
  emptyDeck,
} from '../pageTools/deck';

// The plugin's card draws with the decks library, which a test's document
// cannot size: only its words are read here.
vi.mock('../plugins/page-deck/DeckStage', () => ({ default: () => null }));

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

/** Ten slides, as a Marketer lays a deck out. */
const OUTLINE: Record<string, unknown>[] = [
  { type: 'title', title: 'Spring launch', subtitle: 'The plan' },
  { type: 'section', title: 'Where we are' },
  {
    type: 'metrics',
    title: 'Last quarter',
    metrics: [{ value: '4.2%', label: 'click rate' }],
  },
  { type: 'bullets', title: 'Who', items: ['Makers', 'Teams', 'Schools'] },
  { type: 'bullets', title: 'Channels', items: ['Mail', 'LinkedIn'] },
  { type: 'statement', statement: 'One message, everywhere.' },
  { type: 'section', title: 'The calendar' },
  { type: 'bullets', title: 'March', items: ['Teaser', 'Waitlist'] },
  { type: 'bullets', title: 'April', items: ['Launch', 'Webinar'] },
  { type: 'closing', title: 'Next', cta: 'Approve the budget', notes: 'Ask.' },
];

describe('deck_add_slides', () => {
  it('is a deck tool of the chat, never of a Battle', () => {
    const { tools } = bound();
    expect(DECK_TOOL_NAMES).toContain('deck_add_slides');
    const batch = tools.find(tool => tool.name === 'deck_add_slides')!;
    expect(batch.parameters).toMatchObject({
      type: 'object',
      required: ['slides'],
      properties: {
        slides: { type: 'array', minItems: 1, maxItems: DECK_LIMITS.slides },
      },
    });
    let state = emptyDeck();
    expect(
      deckArenaTools({
        read: () => state,
        change: next => (state = next(state)),
      }).map(tool => tool.name),
    ).toEqual([...DECK_ARENA_TOOL_NAMES]);
  });

  it('lays a ten-slide outline out in one call', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', { title: 'Spring launch' });
    const answered = await call(tools, 'deck_add_slides', { slides: OUTLINE });
    expect(answered).toMatchObject({ ok: true, slides: 10, added: 10 });
    expect(read().spec.slides.map(slide => slide.type)).toEqual([
      'title',
      'section',
      'metrics',
      'bullets',
      'bullets',
      'statement',
      'section',
      'bullets',
      'bullets',
      'closing',
    ]);
    // The first slide it added is the one shown.
    expect(read().shown).toBe(1);
    // Before the slide numbered `at`, as one slide is.
    await call(tools, 'deck_add_slides', {
      slides: [{ type: 'section', title: 'Budget' }],
      at: 10,
    });
    expect(read().spec.slides[9]).toMatchObject({ title: 'Budget' });
    expect(read().spec.slides).toHaveLength(11);
  });

  it('refuses the whole batch on one bad slide: nothing is added', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', { title: 'Spring launch' });
    const bad = [...OUTLINE];
    bad[3] = { type: 'bullets', title: 'Who' };
    await expect(
      call(tools, 'deck_add_slides', { slides: bad }),
    ).rejects.toThrow(
      'Slide 4 of the batch: A bullets slide takes items: one short line each. Nothing was added.',
    );
    expect(read().spec.slides).toHaveLength(0);
    await expect(
      call(tools, 'deck_add_slides', {
        slides: [{ type: 'section', title: 'Fine' }, { type: 'video' }],
      }),
    ).rejects.toThrow(/^Slide 2 of the batch: A slide is one of /);
    await expect(
      call(tools, 'deck_add_slides', { slides: [] }),
    ).rejects.toThrow(
      'The slides are an array of one slide at least, each as deck_add_slide takes one.',
    );
    await expect(
      call(tools, 'deck_add_slides', { slides: OUTLINE, title: 'x' }),
    ).rejects.toThrow('A batch of slides takes slides, at; not title.');
    expect(read().spec.slides).toHaveLength(0);
  });

  it('holds forty slides: a batch past them is refused whole', async () => {
    const { tools, read } = bound();
    await call(tools, 'deck_create', { title: 'Long' });
    await call(tools, 'deck_add_slides', {
      slides: Array.from({ length: 35 }, (_, i) => ({
        type: 'section',
        title: `Part ${i + 1}`,
      })),
    });
    await expect(
      call(tools, 'deck_add_slides', { slides: OUTLINE.slice(0, 6) }),
    ).rejects.toThrow(
      'A deck holds 40 slides at most: it has 35, and these are 6. Nothing was added.',
    );
    expect(read().spec.slides).toHaveLength(35);
  });

  it('is built again from its recorded call', () => {
    const replayed = applyDeckCall(
      applyDeckCall(emptyDeck(), 'deck_create', { title: 'Spring launch' }),
      'deck_add_slides',
      { slides: OUTLINE },
    );
    expect(replayed.spec.slides).toHaveLength(10);
  });

  it('is said in a line: how many slides it added', async () => {
    const { deckCallSays } = await import('../plugins/page-deck');
    expect(deckCallSays('deck_add_slides', { slides: OUTLINE })).toBe(
      'Added 10 slides',
    );
    expect(
      deckCallSays('deck_add_slides', { slides: OUTLINE.slice(0, 1) }),
    ).toBe('Added 1 slide');
  });
});
