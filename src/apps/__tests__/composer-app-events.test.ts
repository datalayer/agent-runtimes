/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What happens when: the events an application
 * answers — a button pressed, a block's entry sent, a tick, a message
 * arriving, a moment — each with what it does, read from where the spec
 * keeps them and chosen among what the application handles; the Flow draws
 * an edge from each that does something.
 */

import { describe, expect, it } from 'vitest';
import { getApp } from '../../specs/apps';
import {
  appEventsOf,
  EVENT_WORDS,
  whenOf,
  type PageEvent,
} from '../composer/appEvents';
import { defaultInterface, kindInterface } from '../composer/appInterface';
import { writeAction } from '../composer/canvasModel';

const decision = kindInterface(null);
const surface = defaultInterface();

describe('on its page: each button and what it does, chosen among the actions its kind handles', () => {
  const events = appEventsOf(null, surface, decision).filter(
    (event): event is PageEvent => event.on === 'page',
  );
  const pressed = events.filter(event => event.kind === 'pressed');

  it('names each button by its label, and what it does in the actions’ own words', () => {
    expect(pressed.length).toBeGreaterThan(0);
    for (const event of pressed) {
      expect(event.when).toMatch(/^When .+ is pressed$/);
      const handled = decision.actions.find(
        action => action.name === event.does,
      );
      expect([event.id, event.doesWords]).toEqual([
        event.id,
        handled ? handled.words : EVENT_WORDS.nothing,
      ]);
      expect(event.unknown).toBe(false);
    }
  });

  it('says an action the application has no name for, and a button that does nothing', () => {
    const first = pressed[0];
    const unknown = appEventsOf(
      null,
      writeAction(surface, first.block, 'teleport', {
        ...decision,
        actions: [
          ...decision.actions,
          { name: 'teleport', meaning: '', words: '', context: [], asks: {} },
        ],
      }),
      decision,
    ).find(event => event.id === first.id) as PageEvent;
    expect(unknown).toMatchObject({
      does: 'teleport',
      doesWords: EVENT_WORDS.unknown,
      unknown: true,
    });
    const none = appEventsOf(
      null,
      writeAction(surface, first.block, '', decision),
      decision,
    ).find(event => event.id === first.id) as PageEvent;
    expect(none).toMatchObject({ does: '', doesWords: EVENT_WORDS.nothing });
  });
});

describe('on its own: what starts a worker, kept under its triggers', () => {
  it('says each in words: a tick, a message arriving, a moment', () => {
    const inbox = getApp('inbox-triage')!;
    const own = appEventsOf(inbox, null, kindInterface(inbox)).filter(
      event => event.on === 'own',
    );
    expect(own.map(event => event.kind)).toEqual(
      inbox.triggers.map(trigger =>
        trigger.type === 'event' || trigger.type === 'schedule'
          ? trigger.type
          : 'once',
      ),
    );
    expect(own[0].when).toBe(
      whenOf(inbox.triggers[0] as unknown as Record<string, unknown>),
    );
    expect(whenOf({ type: 'event', event: 'email_received' })).toBe(
      'When email received',
    );
  });
});
