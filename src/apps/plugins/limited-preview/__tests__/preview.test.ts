/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The limited preview's state and its two page tools (the user, 20 November
 * 2026): what the indicator says of a visitor's turns, and what the agent
 * reads and sets through `preview_status` and `preview_indicator_update` —
 * never the count, which the visitors' runtime keeps.
 */

import { describe, expect, it } from 'vitest';
import {
  LIMITED_PREVIEW_WORDS,
  PREVIEW_INDICATOR_UPDATE,
  PREVIEW_NOTE_MAX,
  PREVIEW_STATUS,
  PreviewBoard,
  limitedPreviewTools,
  previewStatusOf,
} from '../preview';

const visitor = (over = {}) => ({
  taken: 3,
  refused: '',
  validating: false,
  config: { maxTurns: 10 },
  ...over,
});

const toolsOf = (board: PreviewBoard) => {
  const [status, update] = limitedPreviewTools(board);
  return {
    status: (args: Record<string, unknown> = {}) =>
      status.handler!(args) as Promise<Record<string, unknown>>,
    update: (args: Record<string, unknown>) =>
      update.handler!(args) as Promise<Record<string, unknown>>,
  };
};

describe('the preview’s state', () => {
  it('counts the turns left of the day’s', () => {
    expect(previewStatusOf(visitor(), ['X budget'])).toEqual({
      limited: true,
      validating: false,
      turnsLeft: 7,
      turnsPerDay: 10,
      disabled: ['X budget'],
      refused: '',
    });
  });

  it('never counts below none', () => {
    expect(previewStatusOf(visitor({ taken: 12 }), []).turnsLeft).toBe(0);
  });

  it('counts nothing when the host counts no turns', () => {
    const status = previewStatusOf(visitor({ config: {} }), []);
    expect(status.turnsLeft).toBeNull();
    expect(status.turnsPerDay).toBeNull();
  });

  it('says the turns in a few words', () => {
    expect(LIMITED_PREVIEW_WORDS.label).toBe('Limited preview');
    expect(LIMITED_PREVIEW_WORDS.turns(10, 10)).toBe('10/10 turns today');
    expect(LIMITED_PREVIEW_WORDS.turnsLeft(7, 10)).toBe(
      '7 of 10 turns left today.',
    );
    expect(LIMITED_PREVIEW_WORDS.saveWork).toBe('Sign in to save your work.');
  });
});

describe('the board', () => {
  it('tells its readers only when what it holds changes', () => {
    const board = new PreviewBoard();
    let told = 0;
    board.subscribe(() => (told += 1));
    board.publish(previewStatusOf(visitor(), []));
    board.publish(previewStatusOf(visitor(), []));
    expect(told).toBe(1);
    board.publish(previewStatusOf(visitor({ taken: 4 }), []));
    expect(told).toBe(2);
    board.publish(null);
    expect(board.status).toBeNull();
    expect(told).toBe(3);
  });

  it('keeps a note and a flash, and clears them', () => {
    const board = new PreviewBoard();
    board.update({ note: 'Two left', flash: true });
    expect(board.mark).toEqual({ note: 'Two left', flash: 1 });
    board.update({ flash: true });
    expect(board.mark).toEqual({ note: 'Two left', flash: 2 });
    board.clearMark();
    expect(board.mark).toEqual({ note: '', flash: 2 });
  });
});

describe('preview_status', () => {
  it('reads the limited preview: turns left, per day, what is disabled', async () => {
    const board = new PreviewBoard();
    board.publish(previewStatusOf(visitor(), ['X budget', 'LinkedIn link']));
    board.update({ note: 'Seven left' });
    expect(await toolsOf(board).status()).toEqual({
      limited: true,
      turnsLeft: 7,
      turnsPerDay: 10,
      disabled: ['X budget', 'LinkedIn link'],
      note: 'Seven left',
    });
  });

  it('says why no turn is left, once none is', async () => {
    const board = new PreviewBoard();
    board.publish(
      previewStatusOf(visitor({ taken: 10, refused: 'No turn is left.' }), []),
    );
    const read = await toolsOf(board).status();
    expect(read.turnsLeft).toBe(0);
    expect(read.refused).toBe('No turn is left.');
  });

  it('says limited false where there is no limited preview', async () => {
    expect(await toolsOf(new PreviewBoard()).status()).toEqual({
      limited: false,
    });
  });

  it('is read-only: it takes no argument', () => {
    const [status] = limitedPreviewTools(new PreviewBoard());
    expect(status.name).toBe(PREVIEW_STATUS);
    expect(status.parameters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });
});

describe('preview_indicator_update', () => {
  const limited = () => {
    const board = new PreviewBoard();
    board.publish(previewStatusOf(visitor(), []));
    return board;
  };

  it('sets a note on the indicator and flashes it', async () => {
    const board = limited();
    expect(
      await toolsOf(board).update({ note: '  7 turns left  ', flash: true }),
    ).toEqual({ note: '7 turns left', flashed: true, turnsLeft: 7 });
    expect(board.mark).toEqual({ note: '7 turns left', flash: 1 });
  });

  it('clears the note', async () => {
    const board = limited();
    board.update({ note: 'Old' });
    expect(await toolsOf(board).update({ clear: true })).toEqual({
      note: '',
      flashed: false,
      turnsLeft: 7,
    });
    expect(board.mark.note).toBe('');
  });

  it('cannot change the count: the visitors’ runtime keeps it', async () => {
    const board = limited();
    for (const key of ['turnsLeft', 'turnsPerDay', 'taken', 'maxTurns']) {
      await expect(toolsOf(board).update({ [key]: 99 })).rejects.toThrow(
        LIMITED_PREVIEW_WORDS.noCount,
      );
    }
    expect(board.status?.turnsLeft).toBe(7);
  });

  it('refuses what it does not know, a long note, and nothing to do', async () => {
    const tools = toolsOf(limited());
    await expect(tools.update({ colour: 'red' })).rejects.toThrow(
      LIMITED_PREVIEW_WORDS.unknown('colour'),
    );
    await expect(
      tools.update({ note: 'x'.repeat(PREVIEW_NOTE_MAX + 1) }),
    ).rejects.toThrow(LIMITED_PREVIEW_WORDS.noteTooLong);
    await expect(tools.update({ note: 3 })).rejects.toThrow(
      LIMITED_PREVIEW_WORDS.noteTooLong,
    );
    await expect(tools.update({})).rejects.toThrow(
      LIMITED_PREVIEW_WORDS.nothing,
    );
  });

  it('is refused where there is no limited preview', async () => {
    const board = new PreviewBoard();
    await expect(toolsOf(board).update({ note: 'Hi' })).rejects.toThrow(
      LIMITED_PREVIEW_WORDS.notLimited,
    );
    expect(board.mark.note).toBe('');
  });

  it('is named as the page offers it', () => {
    const [, update] = limitedPreviewTools(new PreviewBoard());
    expect(update.name).toBe(PREVIEW_INDICATOR_UPDATE);
    expect(update.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        note: { type: 'string', maxLength: PREVIEW_NOTE_MAX },
        flash: { type: 'boolean' },
        clear: { type: 'boolean' },
      },
    });
  });
});
