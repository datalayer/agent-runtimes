/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application keeps, said before the first message (LOOP R-31): its
 * `record.include` and `record.keep_for` in a person's words, under its
 * prompt at its address and embedded — never in its builder's Preview — and,
 * to a visitor not signed in, that nothing is kept.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE } from '../../specs/apps';
import { LoopPromptPanel } from '../core';
import { emptyAppspec } from '../apps/appspec';
import { appPreset } from '../apps/AppRenderer';
import { defineAppKeptPlugin } from '../apps/AppKept';
import {
  beforeFirstMessage,
  keptBeforeFirstMessage,
  keptForWords,
} from '../apps/kept';
import { createTurnFeed } from '../plugins/chat/turnState';

const names = (plugins: unknown[]) =>
  plugins.map(
    ref =>
      (ref as { name?: string; plugin?: { name: string } }).name ??
      (ref as { plugin: { name: string } }).plugin.name,
  );

describe('what an application keeps, before the first message', () => {
  it('says how long, in words', () => {
    expect(keptForWords('30_days')).toBe('30 days');
    expect(keptForWords('1_years')).toBe('a year');
    expect(keptForWords('18_months')).toBe('18 months');
    expect(keptForWords('7_years')).toBe('7 years');
    expect(() => keptForWords('forever')).toThrow(
      'Cannot read the retention `forever`',
    );
  });

  it('says what its record keeps and for how long', () => {
    const app = {
      ...emptyAppspec('chat'),
      name: 'Support Desk',
      record: {
        keepFor: '90_days',
        retentionDays: 90,
        include: ['conversations', 'actions', 'approvals'],
        suggestTests: false,
      },
    };
    expect(keptBeforeFirstMessage(app)).toBe(
      'Support Desk keeps this conversation, what it does and what is approved for 90 days, then deletes it.',
    );
    expect(
      keptBeforeFirstMessage({
        ...app,
        record: { ...app.record, include: ['conversations'] },
      }),
    ).toBe(
      'Support Desk keeps this conversation for 90 days, then deletes it.',
    );
  });

  it('says only that the conversation took place when its record keeps nothing else', () => {
    const app = {
      ...emptyAppspec('chat'),
      name: 'Quiet',
      record: {
        keepFor: '1_years',
        retentionDays: 365,
        include: [],
        suggestTests: false,
      },
    };
    expect(keptBeforeFirstMessage(app)).toBe(
      'Quiet keeps only that this conversation took place, for a year.',
    );
  });

  it('tells a visitor not signed in that nothing is kept', () => {
    expect(
      keptBeforeFirstMessage(APP_CATALOGUE['web-research'], { visitor: true }),
    ).toBe('Nothing of this conversation is kept: you are not signed in.');
  });

  it('is said under the prompt at its address and embedded, not in the Preview', () => {
    const app = APP_CATALOGUE['web-research'];
    expect(names(appPreset(app).plugins)).not.toContain(
      '@datalayer/loop-plugin-app-kept-web-research',
    );
    expect(
      names(appPreset(app, { kept: { visitor: false } }).plugins),
    ).toContain('@datalayer/loop-plugin-app-kept-web-research');
    const plugin = defineAppKeptPlugin(app, 'Kept for a year.');
    const panels = (plugin.contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopPromptPanel,
    ) as Array<{ value: Record<string, unknown> }>;
    expect(panels).toHaveLength(1);
    expect(panels[0].value).toMatchObject({
      id: 'app-kept',
      placement: 'below',
    });
  });

  it('refuses, in the preset’s sentence, a retention it cannot read', () => {
    const app = {
      ...emptyAppspec('chat'),
      id: 'odd',
      name: 'Odd',
      agent: 'cog-crawler:0.0.1',
      record: {
        keepFor: 'forever',
        retentionDays: 0,
        include: [],
        suggestTests: false,
      },
    };
    expect(() => appPreset(app, { kept: { visitor: false } })).toThrow(
      'Cannot read the retention `forever`',
    );
  });

  it('is said before the first message only', () => {
    const feed = createTurnFeed();
    expect(beforeFirstMessage(feed.turn.value)).toBe(true);
    feed.begin('hello', 'thread-1');
    expect(beforeFirstMessage(feed.turn.value)).toBe(false);
  });
});
