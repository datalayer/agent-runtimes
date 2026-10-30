/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PROTOCOL_DECKS, PROTOCOL_DECK_IDS, protocolDeck } from './index';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const CASES = [
  ['ucp-a-purchase-approved', 'A Purchase, Approved', 'UCP'],
  [
    'pact-a-personal-agent-at-a-business',
    'A Personal Agent at a Business',
    'PACT',
  ],
] as const;

/** The slide types of `@datalayer/decks` these decks may use. */
const SLIDE_TYPES = new Set([
  'title',
  'statement',
  'bullets',
  'columns',
  'two-columns',
  'three-columns',
  'comparison',
  'flow',
  'mermaid',
  'closing',
]);

const REQUIRED: Record<string, string[]> = {
  title: ['title'],
  statement: ['statement'],
  bullets: ['items'],
  comparison: ['columns', 'rows'],
  flow: ['items'],
  mermaid: ['diagram'],
  closing: ['title'],
};

describe('the other protocols’ decks', () => {
  it('holds one deck per case, in their order', () => {
    expect([...PROTOCOL_DECK_IDS]).toEqual(CASES.map(([id]) => id));
    expect(PROTOCOL_DECKS.map(deck => deck.id)).toEqual(
      CASES.map(([id]) => id),
    );
  });

  it('refuses a case it has no deck for', () => {
    expect(() => protocolDeck('pap-approve-once')).toThrow(/no deck/);
  });

  it.each(CASES)(
    '%s is in the deck format, and names its case',
    (id, name, protocol) => {
      const deck = protocolDeck(id);
      expect(parse(deck.yaml)).toEqual(deck.spec);
      expect(deck.title).toBe(name);
      expect(deck.spec.deck.title).toBe(name);
      expect(deck.spec.deck.template).toBe('datalayer');
      expect(deck.protocol).toBe(protocol);
      expect(deck.spec.slides[0].type).toBe('title');
      expect(deck.spec.slides[0].id).toBe(id);
      expect(deck.spec.slides[0].meta).toMatch(new RegExp(`^${protocol} `));
      expect(deck.spec.slides.at(-1)?.type).toBe('closing');
      expect(deck.spec.slides.length).toBeGreaterThanOrEqual(6);
      expect(deck.spec.slides.length).toBeLessThanOrEqual(10);
      for (const slide of deck.spec.slides) {
        expect(SLIDE_TYPES.has(slide.type)).toBe(true);
        for (const key of REQUIRED[slide.type] ?? []) {
          expect(
            (slide[key] as unknown[] | string | undefined)?.length,
          ).toBeGreaterThan(0);
        }
        expect(slide.notes?.trim().length).toBeGreaterThan(40);
      }
    },
  );

  it.each(CASES)('%s has a page in the docs, from this module', (id, name) => {
    const path = `docs/docs/protocols/${id}.mdx`;
    expect(existsSync(resolve(ROOT, path))).toBe(true);
    const page = read(path);
    expect(page).toMatch(new RegExp(`^title: ${name}$`, 'm'));
    expect(page).toContain(`<ProtocolDeck id="${id}" />`);
  });
});
