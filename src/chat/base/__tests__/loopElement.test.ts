/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An element of an application's code in a side panel or on a page (LOOP
 * P-18): the session API's `loop.element` event, kept for whoever draws it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLoopElement,
  clearLoopElements,
  closeLoopElement,
  loopElementChange,
  onLoopElements,
  openLoopElements,
  withLoopElement,
  type LoopElement,
} from '../loopElement';

const event = (data: Record<string, unknown>) => ({
  type: 'loop.element',
  data,
});

const panel: LoopElement = {
  id: 'runs',
  where: 'panel',
  title: 'Runs',
  shows: { surfaceId: 'answer-runs', messages: [] },
};

afterEach(() => clearLoopElements());

describe('loop.element', () => {
  it('reads an element opened or closed, and nothing else', () => {
    expect(
      loopElementChange({ type: 'loop.step', data: { id: 'a' } }),
    ).toBeNull();
    expect(loopElementChange(event({ where: 'panel' }))).toBeNull();
    expect(loopElementChange(event({ id: 'a', where: 'dock' }))).toBeNull();
    expect(loopElementChange(undefined)).toBeNull();
    expect(
      loopElementChange(
        event({
          id: 'runs',
          where: 'panel',
          title: 'Runs',
          shows: panel.shows,
        }),
      ),
    ).toEqual(panel);
    expect(loopElementChange(event({ id: 'runs', closed: true }))).toEqual({
      id: 'runs',
      closed: true,
    });
    expect(loopElementChange(event({ id: 'p', where: 'page' }))).toEqual({
      id: 'p',
      where: 'page',
      title: '',
      shows: null,
    });
  });

  it('adds one opened, changes one in place, takes one closed away', () => {
    const page: LoopElement = { ...panel, id: 'report', where: 'page' };
    const two = withLoopElement(withLoopElement([], panel), page);
    expect(two.map(element => element.id)).toEqual(['runs', 'report']);
    const changed = withLoopElement(two, { ...panel, title: 'Last runs' });
    expect(changed.map(element => element.title)).toEqual([
      'Last runs',
      'Runs',
    ]);
    expect(withLoopElement(changed, { id: 'runs', closed: true })).toEqual([
      page,
    ]);
    expect(withLoopElement([], { id: 'nothing', closed: true })).toEqual([]);
  });

  it('tells whoever draws them, and the person closes one on their screen', () => {
    const told: string[][] = [];
    const stop = onLoopElements(open => told.push(open.map(e => e.id)));
    applyLoopElement(panel);
    expect(openLoopElements()).toEqual([panel]);
    closeLoopElement('runs');
    expect(openLoopElements()).toEqual([]);
    stop();
    applyLoopElement(panel);
    expect(told).toEqual([['runs'], []]);
  });
});
