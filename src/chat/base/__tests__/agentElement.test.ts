/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An element of an application's code in a side panel or on a page: a display that says it shows in a panel or on a page, kept for whoever draws it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAgentElement,
  clearAgentElements,
  closeAgentElement,
  elementOfDisplay,
  onAgentElements,
  openAgentElements,
  withAgentElement,
  type AgentElement,
} from '../agentElement';

const panel: AgentElement = {
  id: 'runs',
  where: 'panel',
  title: 'Runs',
  shows: {
    type: 'application/vnd.datalayer.agent.answer+json',
    id: 'runs',
    text: 'Runs showed Table runs',
    data: { message_id: 'runs', title: 'Runs', where: 'panel' },
  },
};

afterEach(() => clearAgentElements());

describe('elements', () => {
  it('are the displays that say they show in a panel or on a page', () => {
    expect(elementOfDisplay(panel.shows)).toEqual(panel);
    const page = { ...panel.shows, id: 'report', data: { where: 'page' } };
    expect(elementOfDisplay(page)).toEqual({
      id: 'report',
      where: 'page',
      title: '',
      shows: page,
    });
    // Inline, or anywhere else, a display is not an element.
    for (const where of ['inline', 'dock', undefined]) {
      expect(
        elementOfDisplay({ ...panel.shows, data: { message_id: 'm', where } }),
      ).toBeNull();
    }
    expect(elementOfDisplay({ type: 't', id: 'x', text: 'x' })).toBeNull();
  });

  it('adds one opened, changes one in place, takes one closed away', () => {
    const page: AgentElement = { ...panel, id: 'report', where: 'page' };
    const two = withAgentElement(withAgentElement([], panel), page);
    expect(two.map(element => element.id)).toEqual(['runs', 'report']);
    const changed = withAgentElement(two, { ...panel, title: 'Last runs' });
    expect(changed.map(element => element.title)).toEqual([
      'Last runs',
      'Runs',
    ]);
    expect(withAgentElement(changed, { id: 'runs', closed: true })).toEqual([
      page,
    ]);
    expect(withAgentElement([], { id: 'nothing', closed: true })).toEqual([]);
  });

  it('tells whoever draws them, and the person closes one on their screen', () => {
    const told: string[][] = [];
    const stop = onAgentElements(open => told.push(open.map(e => e.id)));
    applyAgentElement(panel);
    expect(openAgentElements()).toEqual([panel]);
    closeAgentElement('runs');
    expect(openAgentElements()).toEqual([]);
    stop();
    applyAgentElement(panel);
    expect(told).toEqual([['runs'], []]);
  });
});
