/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What happens when: the events an application
 * answers, and what each does — read from where the spec keeps them, so
 * that the designer's *Events*, the Canvas and the Flow say the same.
 *
 * - **On its page**: a button pressed does one of the actions its kind
 *   handles (`kindInterface(...).actions`), or nothing; a block
 *   that sends — a form, an input, a table's selection — sends what a person
 *   entered to one of the places its kind takes (`accepts`), or nowhere.
 * - **On its own**: what starts a worker — a schedule (a tick), an event (a
 *   message arriving), a moment — kept under `triggers`.
 *
 * What each does is chosen among what the application handles, never typed:
 * an action the runtime has no name for is said as such and offered only to
 * be replaced. *A run finishing* is not an event an application answers: no
 * key of the Appspec, and no handler of the runtime, names it.
 *
 * Pure: no React, no network.
 *
 * @module apps/composer/appEvents
 */

import type { AppSpec } from '../../types/agentspecs';
import { getComponent } from '../../specs/ui';
import { actionDecidedBy, whereWords, type AppCode } from './appCode';
import type { AppInterface, KindInterface } from './appInterface';
import {
  actionOf,
  boundPath,
  labelOf,
  labelPlace,
  sendsProperty,
} from './canvasModel';

/** An event of the application's page: a button pressed, or a block's entry sent. */
export type PageEvent = {
  id: string;
  on: 'page';
  kind: 'pressed' | 'sent';
  /** The block it is of, on the surface. */
  block: string;
  /** When it happens, in words: *When “Approve” is pressed*. */
  when: string;
  /** What it does now: an action's name, or the path it sends to; '' for nothing. */
  does: string;
  /** What it does, in words. */
  doesWords: string;
  /** The property a sending block sends through. */
  property?: string;
  /** When its code decides it: where, and it is not changed here. */
  decidedBy?: string;
  /** Whether what it does is one its application has no name for. */
  unknown: boolean;
};

/** An event the application answers on its own: one of its `triggers`. */
export type OwnEvent = {
  id: string;
  on: 'own';
  kind: 'schedule' | 'event' | 'once';
  index: number;
  when: string;
  doesWords: string;
};

export type AppEvent = PageEvent | OwnEvent;

/** What the Events panel and the Flow call each side. */
export const EVENT_WORDS = {
  page: 'On its page',
  own: 'On its own',
  nothing: 'Nothing',
  nowhere: 'Nowhere',
  unknown: 'Something it does not handle',
  noPage:
    'Its page has no button and nothing that sends yet: add them on the Layout.',
  noOwn: 'Nothing starts it on its own: choose an event to add.',
  decidedBy: (where: string): string => `Decided by its code, ${where}`,
} as const;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** When a trigger fires, in words: its schedule, its event's name, or its moment. */
export function whenOf(trigger: Record<string, unknown>): string {
  if (trigger.type === 'schedule') {
    return (
      text(trigger.description) ||
      `On a schedule, ${text(trigger.cron) || 'not set'}`
    );
  }
  if (trigger.type === 'event') {
    return `When ${text(trigger.event).replace(/_/g, ' ') || 'an event happens'}`;
  }
  return `Once, at ${text(trigger.at) || 'a moment not set'}`;
}

const firstLine = (value: unknown): string => text(value).split('\n')[0].trim();

/** A block's name on its page: its label, or its component's name. */
function nameOf(surface: AppInterface, id: string, component: string): string {
  const words = labelOf(
    surface,
    labelPlace(surface, id, getComponent(component)),
  );
  return words ? `“${words}”` : (getComponent(component)?.name ?? component);
}

/**
 * Every event the application answers, its page's first: each button and
 * each block that sends, in the order they are on the surface, then its
 * triggers.
 */
export function appEventsOf(
  spec: Pick<AppSpec, 'triggers'> | null,
  surface: AppInterface | null,
  gives: KindInterface,
  code: AppCode | null = null,
): AppEvent[] {
  const events: AppEvent[] = [];
  for (const node of surface?.components ?? []) {
    if (node.component === 'Button') {
      const action = actionOf(node);
      const handled = action
        ? gives.actions.find(choice => choice.name === action.name)
        : undefined;
      const decided = action ? actionDecidedBy(code, action.name) : undefined;
      events.push({
        id: `pressed:${node.id}`,
        on: 'page',
        kind: 'pressed',
        block: node.id,
        when: `When ${nameOf(surface!, node.id, node.component)} is pressed`,
        does: action?.name ?? '',
        doesWords: !action
          ? EVENT_WORDS.nothing
          : (handled?.words ?? EVENT_WORDS.unknown),
        ...(decided
          ? { decidedBy: EVENT_WORDS.decidedBy(whereWords(decided)) }
          : {}),
        unknown: Boolean(action && !handled),
      });
      continue;
    }
    const property = sendsProperty(node, getComponent(node.component));
    if (property) {
      const to = boundPath(node, property);
      const taken = gives.accepts.find(path => path.path === to);
      events.push({
        id: `sent:${node.id}`,
        on: 'page',
        kind: 'sent',
        block: node.id,
        when: `When ${nameOf(surface!, node.id, node.component)} is sent`,
        does: to,
        doesWords: !to
          ? EVENT_WORDS.nowhere
          : (taken?.words ?? taken?.meaning ?? EVENT_WORDS.unknown),
        property,
        // Bound to a path the application publishes but does not take: shown, never sent anywhere it reads.
        unknown: Boolean(
          to && !taken && !gives.publishes.some(path => path.path === to),
        ),
      });
    }
  }
  (spec?.triggers ?? []).forEach((trigger, index) => {
    const t = (trigger ?? {}) as unknown as Record<string, unknown>;
    const kind = t.type === 'schedule' || t.type === 'event' ? t.type : 'once';
    events.push({
      id: `own:${index}`,
      on: 'own',
      kind,
      index,
      when: whenOf(t),
      doesWords: firstLine(t.prompt) || 'Does nothing yet: say what it does.',
    });
  });
  return events;
}
