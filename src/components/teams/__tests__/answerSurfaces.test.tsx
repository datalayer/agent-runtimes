/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Components in the answers (STUDIO H-02): a surface a peer shows
 * (`application/json+a2ui`) is kept by the team with the peer that gave it,
 * drawn with `InlineSurface` on Datalayer's catalog, and a button pressed
 * on it goes back to that peer with its action — what it does said, so that
 * the runtime refuses an approval to a visitor.
 */

// @vitest-environment jsdom
import * as React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  A2APeer,
  A2APeerArtifact,
  A2APeerEvent,
} from '../../../runtimes/browser/a2aPeer';
import { ACCOUNTING_APP_0_0_1, SALES_APP_0_0_1 } from '../../../specs/apps';

/** The tool the entry asks with, as the hook makes it: its events are what is checked. */
const told = vi.hoisted(() => ({
  onEvent: undefined as undefined | ((event: A2APeerEvent) => void),
  accept: undefined as undefined | readonly string[],
}));
vi.mock('../../../runtimes/browser/a2aPeer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../runtimes/browser/a2aPeer')>();
  return {
    ...actual,
    a2aPeerTool: (options: {
      onEvent?: (event: A2APeerEvent) => void;
      accept?: readonly string[];
    }) => {
      told.onEvent = options.onEvent;
      told.accept = options.accept;
      return { description: 'ask', inputSchema: {}, execute: async () => ({}) };
    },
  };
});
vi.mock('../../../runtimes/browser/model', () => ({
  createBrowserModel: () => ({ specificationVersion: 'v2' }),
}));

afterEach(() => cleanup());

/** What the runtime's `show_components` gives (`surface_of_components`): a table and a choice. */
const SURFACE_ID = 'answer-7f3a';
const SURFACE: A2APeerArtifact = {
  mediaType: 'application/json+a2ui',
  name: 'Payment reminders',
  data: {
    surfaceId: SURFACE_ID,
    catalogId:
      'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
    title: 'Payment reminders',
    messages: [
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: SURFACE_ID,
          catalogId:
            'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: SURFACE_ID,
          components: [
            {
              id: 'root',
              component: 'Column',
              children: ['table', 'choice-question', 'choice'],
            },
            {
              id: 'table',
              component: 'Table',
              columns: ['customer', 'days late'],
              rows: { path: '/rows' },
            },
            {
              id: 'choice-question',
              component: 'Text',
              text: 'Send a reminder to Ada?',
            },
            { id: 'option-0-label', component: 'Text', text: 'Send them' },
            {
              id: 'option-0',
              component: 'Button',
              child: 'option-0-label',
              variant: 'primary',
              action: {
                event: { name: 'Send them', context: { does: 'send' } },
              },
            },
            { id: 'option-1-label', component: 'Text', text: 'Not now' },
            {
              id: 'option-1',
              component: 'Button',
              child: 'option-1-label',
              variant: 'default',
              action: { event: { name: 'Not now', context: { does: 'read' } } },
            },
            {
              id: 'choice',
              component: 'Row',
              children: ['option-0', 'option-1'],
            },
          ],
        },
      },
      {
        version: 'v0.9',
        updateDataModel: {
          surfaceId: SURFACE_ID,
          path: '/',
          value: { rows: [{ customer: 'Ada', 'days late': 75 }] },
        },
      },
    ],
  },
};

describe('a surface a peer shows', () => {
  it('is kept by the team with the peer that gave it, once', async () => {
    const { useA2ATeam, COMPONENTS_NOTEBOOK_AND_WORDS, answeredLine } =
      await import('../useA2ATeam');
    const peer = { card: { name: 'Accounting' } } as unknown as A2APeer;
    const { result } = renderHook(() =>
      useA2ATeam({
        entry: SALES_APP_0_0_1,
        peerApp: ACCOUNTING_APP_0_0_1,
        peer,
        inference: {} as never,
        accept: COMPONENTS_NOTEBOOK_AND_WORDS,
      }),
    );
    expect(told.accept).toEqual([
      'application/json+a2ui',
      'application/x-ipynb+json',
      'text/markdown',
    ]);
    expect(result.current.surfaces).toEqual([]);
    const answered = (taskId: string, artifacts: A2APeerArtifact[]) =>
      act(() => {
        told.onEvent?.({
          phase: 'answered',
          taskId,
          answer: 'Ada is 75 days late.',
          artifacts,
        });
      });
    answered('t1', [SURFACE]);
    expect(result.current.surfaces).toEqual([
      { id: SURFACE_ID, giver: ACCOUNTING_APP_0_0_1.id, artifact: SURFACE },
    ]);
    // Words alone keep it; the same surface again is not drawn twice.
    answered('t2', []);
    answered('t3', [SURFACE]);
    expect(result.current.surfaces).toHaveLength(1);
    expect(answeredLine([SURFACE])).toBe(
      'the report and what it shows, Payment reminders',
    );
  });
});

describe('AnswerSurfaces', () => {
  it(
    'draws the catalog, and a button answers the peer with what it does',
    { timeout: 30000 },
    async () => {
      const { AnswerSurfaces, pressedOf } = await import('../AnswerSurfaces');
      expect(
        pressedOf({
          name: 'Send them',
          surfaceId: SURFACE_ID,
          context: { does: 'send' },
        }),
      ).toEqual({
        message: 'Send them',
        action: { name: 'Send them', payload: { does: 'send' } },
        does: 'send',
      });
      // A form's submission is not an answer's button.
      expect(pressedOf({ name: 'Send them', surfaceId: 'form-1' })).toBeNull();

      const onPress = vi.fn(
        async () =>
          'Without an account it only reads: `Send them` would do more than read, so it asked nobody and did nothing.',
      );
      const surface = {
        id: SURFACE_ID,
        giver: 'accounting',
        artifact: SURFACE,
      };
      render(
        <AnswerSurfaces
          surfaces={[surface]}
          names={{ accounting: 'Accounting' }}
          onPress={onPress}
        />,
      );
      // The table's row and the choice's question, drawn by the catalog.
      // The renderer is loaded lazily, A2UI with it: the first draw waits for it.
      expect(
        await screen.findByText('Ada', undefined, { timeout: 20000 }),
      ).toBeTruthy();
      expect(screen.getByText('Send a reminder to Ada?')).toBeTruthy();
      expect(
        screen.getByRole('region', { name: 'Accounting: Payment reminders' }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Send them' }));
      await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
      expect(onPress).toHaveBeenCalledWith(surface, {
        message: 'Send them',
        action: { name: 'Send them', payload: { does: 'send' } },
        does: 'send',
      });
      expect(
        await screen.findByText(/Without an account it only reads/),
      ).toBeTruthy();
      expect(screen.getByText('You chose: Send them')).toBeTruthy();
      // One choice per surface.
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );
});
