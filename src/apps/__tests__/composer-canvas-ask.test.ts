/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Ask the assistant* on the Canvas: a request becomes a
 * whole layout, checked as every change on the Canvas is, said in sentences
 * before it is kept; a layout with a new problem is sent back once, then
 * refused; one that changes nothing is refused.
 */

import { describe, expect, it } from 'vitest';
import { getComponent, listComponents } from '../../specs/ui';
import { emptyAppspec } from '../apps/appspec';
import type { ChatMessage } from '../composer/canvasAskModel';
import { kindInterface, type AppInterface } from '../composer/appInterface';
import { insertBlock, startSurface } from '../composer/canvasModel';
import {
  NOTHING_CHANGED,
  layoutAskPrompt,
  layoutChanges,
  proposeLayout,
  type LayoutAskContext,
} from '../composer/canvasAskModel';

const CATALOG = listComponents().map(component => component.id);

const nameOf = (surface: AppInterface, id: string): string => {
  const node = surface.components.find(component => component.id === id);
  return id === 'root' ? 'the page' : `${node?.component ?? '?'} ${id}`;
};

const contextOf = (surface: AppInterface): LayoutAskContext => {
  const app = emptyAppspec('chat');
  return {
    surface,
    app,
    gives: kindInterface(app),
    palette: listComponents(),
    allowed: [],
    catalog: CATALOG,
    componentSpec: getComponent,
  };
};

const withText = insertBlock(
  startSurface(),
  'Text',
  { parent: 'root', index: 0 },
  getComponent('Text'),
).surface;

describe('Ask the assistant', () => {
  it('asks with the layout, the palette, what the page gives, and the request', () => {
    const [system, user] = layoutAskPrompt(
      'add the answer under a heading',
      contextOf(withText),
    );
    expect(system.content).toContain(
      'Answer with the whole layout after the change',
    );
    expect(system.content).toContain('- Table: ');
    expect(system.content).toContain('/answer');
    expect(user.content).toContain(
      JSON.stringify({ components: withText.components }),
    );
    expect(user.content).toContain(
      'The change asked: add the answer under a heading',
    );
  });

  it('says the change before it is kept: added, changed, moved, removed', () => {
    const after: AppInterface = {
      ...withText,
      components: [
        { id: 'root', component: 'Column', children: ['answer', 'text'] },
        { id: 'text', component: 'Text', text: 'Hello', variant: 'h2' },
        { id: 'answer', component: 'Text', text: { path: '/answer' } },
      ],
    };
    expect(layoutChanges(withText, after, nameOf)).toEqual([
      'Changes Text text: text, variant.',
      'Moves Text text to place 2 in the page.',
      'Adds Text answer to the page.',
    ]);
    expect(layoutChanges(after, withText, nameOf)).toContain(
      'Removes Text answer.',
    );
  });

  it('proposes the layout the model answers, once it passes the Canvas checks', async () => {
    const asked: ChatMessage[][] = [];
    const answer = {
      components: [
        {
          id: 'root',
          component: 'Column',
          children: [
            ...(withText.components[0].children as string[]),
            'answer',
          ],
        },
        ...withText.components.slice(1),
        { id: 'answer', component: 'Text', text: { path: '/answer' } },
      ],
    };
    const outcome = await proposeLayout(
      'add the answer',
      contextOf(withText),
      async messages => {
        asked.push(messages);
        return '```json\n' + JSON.stringify(answer) + '\n```';
      },
      nameOf,
    );
    expect(asked).toHaveLength(1);
    expect(outcome).toEqual({
      proposed: { ...withText, components: answer.components },
      changes: ['Adds Text answer to the page.'],
    });
  });

  it('sends a layout with a new problem back once, then refuses it with the problem', async () => {
    const broken = JSON.stringify({
      components: [{ id: 'root', component: 'Column', children: ['gone'] }],
    });
    const asked: ChatMessage[][] = [];
    const outcome = await proposeLayout(
      'remove everything',
      contextOf(withText),
      async messages => {
        asked.push([...messages]);
        return broken;
      },
      nameOf,
    );
    expect(asked).toHaveLength(2);
    expect(asked[1].at(-1)?.content).toContain(
      'root refers to gone, which is not in the interface.',
    );
    expect(outcome).toEqual({
      refused:
        'The layout that came back would not work: root refers to gone, which is not in the interface.',
    });
  });

  it('refuses a layout that changes nothing, and a request that says nothing', async () => {
    const same = await proposeLayout(
      'make it nicer',
      contextOf(withText),
      async () => JSON.stringify({ components: withText.components }),
      nameOf,
    );
    expect(same).toEqual({ refused: NOTHING_CHANGED });
    const empty = await proposeLayout(
      '  ',
      contextOf(withText),
      async () => {
        throw new Error('not asked');
      },
      nameOf,
    );
    expect(empty).toEqual({
      refused: 'Say what to change first: "add a chart of the last ten runs".',
    });
  });
});
