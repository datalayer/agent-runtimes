/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The limited-preview indicator beside the composer (the user, 20 November
 * 2026), in place of the box that sat on top of a visitor's chat: shown only
 * to an anonymous visitor, with the turns left today, its overlay saying the
 * rest (sign in to save your work, what is disabled, Sign in — or the host's
 * call to action), the agent's note and flash, and what it publishes for the
 * page tools.
 */

// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import {
  AnonymousChatProvider,
  type AnonymousChatState,
} from '../../../../chat/anonymous/AnonymousChat';
import { LimitedPreviewIndicator } from '../LimitedPreviewIndicator';
import { PreviewBoard } from '../preview';

afterEach(cleanup);

function state(over: Partial<AnonymousChatState> = {}): AnonymousChatState {
  return {
    taken: 3,
    startedAt: null,
    refused: '',
    take: () => undefined,
    config: { maxTurns: 10 },
    name: 'Shopper',
    validating: false,
    headerShown: true,
    minutes: 15,
    signIn: vi.fn(),
    ...over,
  };
}

const themed = (node: React.ReactNode) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

const draw = (
  value: AnonymousChatState | null,
  board = new PreviewBoard(),
  disabled: string[] = [],
) => {
  const view = render(
    themed(
      <AnonymousChatProvider value={value}>
        <LimitedPreviewIndicator disabled={disabled} board={board} />
      </AnonymousChatProvider>,
    ),
  );
  return { ...view, board };
};

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: /Limited preview/ }));

describe('the limited-preview indicator', () => {
  it('is never drawn for a signed-in person, and publishes nothing', () => {
    const { container, board } = draw(null);
    expect(container.querySelector('[data-limited-preview]')).toBeNull();
    expect(board.status).toBeNull();
  });

  it('says the limited preview and the turns left today', () => {
    const { container, board } = draw(state());
    expect(screen.getByText('Limited preview')).toBeTruthy();
    expect(screen.getByText('7/10 turns today')).toBeTruthy();
    expect(
      container.querySelector('[data-limited-preview="open"]'),
    ).toBeTruthy();
    expect(board.status?.turnsLeft).toBe(7);
  });

  it('follows each turn taken', () => {
    const board = new PreviewBoard();
    const { rerender } = draw(state(), board);
    rerender(
      themed(
        <AnonymousChatProvider value={state({ taken: 4 })}>
          <LimitedPreviewIndicator disabled={[]} board={board} />
        </AnonymousChatProvider>,
      ),
    );
    expect(screen.getByText('6/10 turns today')).toBeTruthy();
    expect(board.status?.turnsLeft).toBe(6);
  });

  it('counts no turns when the host counts none', () => {
    draw(state({ config: {} }));
    expect(screen.getByText('Limited preview')).toBeTruthy();
    expect(screen.queryByText(/turns today/)).toBeNull();
  });

  it('opens onto the rest: save your work, what is disabled, Sign in', () => {
    const signIn = vi.fn();
    draw(state({ signIn }), new PreviewBoard(), ['X budget', 'LinkedIn link']);
    open();
    expect(screen.getByText('Sign in to save your work.')).toBeTruthy();
    expect(screen.getByText('7 of 10 turns left today.')).toBeTruthy();
    expect(
      screen.getByText('Disabled without an account: X budget, LinkedIn link.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('says some features are disabled when none is named', () => {
    draw(state());
    open();
    expect(screen.getByText('Some features are disabled.')).toBeTruthy();
  });

  it('offers the host’s call to action in place of Sign in', () => {
    const signIn = vi.fn();
    const onAction = vi.fn();
    draw(
      state({
        signIn,
        config: {
          maxTurns: 10,
          callToAction: {
            says: 'Make it yours: open your own Shopper.',
            label: 'Open your own Shopper',
            onAction,
          },
        },
      }),
    );
    open();
    expect(
      screen.getByText('Make it yours: open your own Shopper.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open your own Shopper' }),
    );
    expect(onAction).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('says why once no turn is left', () => {
    const { container } = draw(
      state({ taken: 10, refused: 'No turn is left.' }),
    );
    expect(screen.getByText('0/10 turns today')).toBeTruthy();
    expect(
      container.querySelector('[data-limited-preview="reached"]'),
    ).toBeTruthy();
    open();
    expect(screen.getByRole('alert').textContent).toBe('No turn is left.');
  });

  it('counts nothing yet while the key is checked', () => {
    const { container } = draw(state({ validating: true }));
    expect(
      container.querySelector('[data-limited-preview="validating"]'),
    ).toBeTruthy();
    expect(screen.queryByText(/turns today/)).toBeNull();
  });

  it('holds the key’s clock when the chat draws no header', () => {
    const { container } = draw(state({ headerShown: false }));
    expect(
      container.querySelector('[data-anonymous-key-clock="waiting"]'),
    ).toBeTruthy();
    cleanup();
    const shown = draw(state({ headerShown: true }));
    expect(
      shown.container.querySelector('[data-anonymous-key-clock]'),
    ).toBeNull();
  });

  it('shows the agent’s note and flashes when asked', () => {
    const board = new PreviewBoard();
    const { container } = draw(state(), board);
    act(() => board.update({ note: 'Seven left', flash: true }));
    expect(screen.getByText('Seven left')).toBeTruthy();
    expect(
      container.querySelector('[data-limited-preview-flash="on"]'),
    ).toBeTruthy();
  });

  it('withdraws what it published when it goes', () => {
    const board = new PreviewBoard();
    const { unmount } = draw(state(), board);
    expect(board.status?.limited).toBe(true);
    unmount();
    expect(board.status).toBeNull();
  });
});
