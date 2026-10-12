/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's code asks, drawn from its display (REACTOR_UI
 * RU-4): a choice as buttons — a rule's prompt is Allow and Refuse — the
 * words as a field, a file chosen and uploaded first (RU-6); each answer
 * pressed through the display's `act` as `reactor.answer`; answered, what answered it. The
 * `app-elements` plugin contributes the renderer for its type.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_ACTION, type Display } from '@datalayer/reactor/ui';
import {
  AppElementsPlugin,
  QUESTION_DISPLAY_TYPE,
  QuestionView,
  questionOf,
} from '../plugins/app-elements';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A question as the session shows it (`QuestionShown`). */
function question(data: Record<string, unknown>, offered = true): Display {
  return {
    type: QUESTION_DISPLAY_TYPE,
    version: 1,
    id: 'm1-ask',
    text: String(data.prompt),
    data: {
      message_id: 'm1',
      options: [],
      accept: [],
      max_bytes: null,
      form: {},
      answered: null,
      ...data,
    },
    actions: offered ? [{ name: ANSWER_ACTION, token: 't0k' }] : [],
  };
}

afterEach(() => document.body.replaceChildren());

async function drawn(
  display: Display,
  pressed = vi.fn(),
  upload?: (file: File) => Promise<never>,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <QuestionView display={display} act={pressed} upload={upload} />,
    ),
  );
  return { container, pressed };
}

describe('what the code asks', () => {
  it('is read from its display, and nothing else is', () => {
    expect(
      questionOf(
        question({
          kind: 'choice',
          prompt: 'Send?',
          options: ['Allow', 'Refuse'],
        }),
      ),
    ).toMatchObject({
      kind: 'choice',
      options: ['Allow', 'Refuse'],
      answered: null,
      answerable: true,
    });
    expect(() =>
      questionOf({ type: 'application/x+json', id: 'x', text: 'x' }),
    ).toThrow(/not a question/);
    expect(() =>
      questionOf(question({ kind: 'riddle', prompt: 'What?' })),
    ).toThrow(/not a question/);
  });

  it('draws a rule’s prompt as Allow and Refuse, a press the answer', async () => {
    const { container, pressed } = await drawn(
      question({
        kind: 'choice',
        prompt: 'Send the mail to Bob?',
        options: ['Allow', 'Refuse'],
      }),
    );
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map(button => button.textContent)).toEqual([
      'Allow',
      'Refuse',
    ]);
    await act(async () => buttons[1].click());
    expect(pressed).toHaveBeenCalledWith({
      action: ANSWER_ACTION,
      payload: { value: 'Refuse' },
    });
  });

  it('takes the words in a field', async () => {
    const { container, pressed } = await drawn(
      question({ kind: 'text', prompt: 'Your name?' }),
    );
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, 'Ada');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      (container.querySelector('form') as HTMLFormElement).requestSubmit(),
    );
    expect(pressed).toHaveBeenCalledWith({
      action: ANSWER_ACTION,
      payload: { value: 'Ada' },
    });
  });

  it('says what answered it, and offers nothing then', async () => {
    const { container, pressed } = await drawn(
      question(
        {
          kind: 'choice',
          prompt: 'Send?',
          options: ['Allow', 'Refuse'],
          answered: 'Allow',
        },
        false,
      ),
    );
    expect(container.textContent).toBe('Answered: Allow');
    expect(container.querySelector('button')).toBeNull();
    expect(pressed).not.toHaveBeenCalled();
  });

  it('uploads the file chosen, then presses its ref as the answer', async () => {
    const ref = {
      ref: 'r-1',
      name: 'orders.csv',
      media_type: 'text/csv',
      size: 4,
    };
    const upload = vi.fn(async () => ref as never);
    const { container, pressed } = await drawn(
      question({ kind: 'file', prompt: 'Which file?', accept: ['.csv'] }),
      vi.fn(),
      upload,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe('.csv');
    const chosen = new File(['a,b\n'], 'orders.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [chosen] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(upload).toHaveBeenCalledWith(chosen);
    // Its bytes never in the press: the ref its upload answered.
    expect(pressed).toHaveBeenCalledWith({
      action: ANSWER_ACTION,
      payload: { value: ref },
    });
    // Nothing offered, or nowhere to upload: nothing chosen.
    const { container: closed } = await drawn(
      question({ kind: 'file', prompt: 'Which file?' }, false),
      vi.fn(),
      upload,
    );
    expect(
      (closed.querySelector('input[type="file"]') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('is drawn by the renderer the app-elements plugin contributes', () => {
    const contributed = (
      AppElementsPlugin as unknown as {
        contributes?: { point: { id: string }; value: { type: string } }[];
      }
    ).contributes;
    expect(
      contributed?.some(one => one.value?.type === QUESTION_DISPLAY_TYPE),
    ).toBe(true);
  });
});
