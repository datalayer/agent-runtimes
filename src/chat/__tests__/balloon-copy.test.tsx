/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The balloon's copy icon (asked 6 November 2026): under the words, the
 * words whole to the clipboard, a check for a moment; none under an
 * approval or a tool line.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { COPIED_MS, SpeechBalloon } from '../assistant/SpeechBalloon';
import type { SpeechBalloonProps } from '../assistant/SpeechBalloon';

const mounted: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render(props: Partial<SpeechBalloonProps>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <SpeechBalloon
          text="Here is the full picture…"
          onOpen={() => {}}
          above={40}
          align="left"
          {...props}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
  return container;
}

const copyButton = (container: HTMLElement) =>
  container.querySelector('[data-balloon-copy]') as HTMLButtonElement | null;

describe('the balloon’s copy icon', () => {
  it('copies the words whole and shows a check for a moment', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const container = await render({
      display: 'current',
      fullText: 'Here is the full picture of open customer invoices.',
    });
    const button = copyButton(container);
    expect(button).not.toBeNull();
    // Primer's IconButton names itself through its tooltip (`aria-labelledby`) or an `aria-label`.
    const labelledBy = button!.getAttribute('aria-labelledby');
    const name = labelledBy
      ? document.getElementById(labelledBy)?.textContent
      : button!.getAttribute('aria-label');
    expect(name).toBe('Copy the words');
    expect(button!.getAttribute('data-balloon-copy')).toBe('');
    await act(async () => {
      button!.click();
    });
    expect(writeText).toHaveBeenCalledWith(
      'Here is the full picture of open customer invoices.',
    );
    expect(copyButton(container)!.getAttribute('data-balloon-copy')).toBe(
      'copied',
    );
    await act(async () => {
      vi.advanceTimersByTime(COPIED_MS + 1);
    });
    expect(copyButton(container)!.getAttribute('data-balloon-copy')).toBe('');
  });

  it('copies a peek as well, and draws none under an approval', async () => {
    const peek = await render({});
    expect(copyButton(peek)).not.toBeNull();
    document.body.innerHTML = '';
    const approval = await render({
      approval: {
        id: 'a1',
        asks: 'Send the invoice?',
        others: 0,
        onApprove: () => {},
        onDeny: () => {},
      },
    });
    expect(copyButton(approval)).toBeNull();
  });
});
