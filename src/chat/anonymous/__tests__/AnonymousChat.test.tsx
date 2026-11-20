/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an anonymous visitor's conversation draws (the user, 15 November
 * 2026): the box on top, its skeleton while the key is checked, the key's
 * clock where there is no header, and Sign in to use a refused tool. Its MCP
 * servers and skills are listed as the runtime says them, in the same
 * overlays as anyone's (equipment-menus.test).
 */

// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import {
  AnonymousChatProvider,
  AnonymousFooterLabel,
  AnonymousPreviewBox,
  AnonymousToolSignIn,
  type AnonymousChatState,
} from '../AnonymousChat';

afterEach(cleanup);

function state(over: Partial<AnonymousChatState> = {}): AnonymousChatState {
  return {
    taken: 0,
    startedAt: null,
    refused: '',
    take: () => undefined,
    config: { maxTurns: 10 },
    name: 'Marketer',
    validating: false,
    headerShown: true,
    minutes: 15,
    signIn: vi.fn(),
    ...over,
  };
}

const themed = (node: React.ReactNode) =>
  render(
    <ThemeProvider>
      <BaseStyles>{node}</BaseStyles>
    </ThemeProvider>,
  );

describe('the box on top', () => {
  it('says the limited preview, the turns left and what is disabled', () => {
    const signIn = vi.fn();
    themed(<AnonymousPreviewBox state={state({ taken: 3, signIn })} />);
    expect(
      screen.getByText('Limited preview: sign in to save your work.'),
    ).toBeTruthy();
    expect(
      screen.getByText('7 of 10 turns left today. Some features are disabled.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('says the host’s call to action in place of Sign in, for a viewer who need not sign in', () => {
    const signIn = vi.fn();
    const onAction = vi.fn();
    themed(
      <AnonymousPreviewBox
        state={state({
          taken: 3,
          signIn,
          config: {
            maxTurns: 10,
            callToAction: {
              says: 'Make it yours: open your own Shopper.',
              label: 'Open your own Shopper',
              onAction,
            },
          },
        })}
      />,
    );
    expect(
      screen.getByText('Make it yours: open your own Shopper.'),
    ).toBeTruthy();
    // The turns are still counted: the demo runs on the visitors' runtime.
    expect(
      screen.getByText('7 of 10 turns left today. Some features are disabled.'),
    ).toBeTruthy();
    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open your own Shopper' }),
    );
    expect(onAction).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('counts no turns when the host gives no maxTurns', () => {
    themed(<AnonymousPreviewBox state={state({ config: {} })} />);
    expect(screen.getByText('Some features are disabled.')).toBeTruthy();
    expect(screen.queryByText(/turns left/)).toBeNull();
  });

  it('is a skeleton while the key is checked', () => {
    const { container } = themed(
      <AnonymousPreviewBox state={state({ validating: true })} />,
    );
    expect(
      container.querySelector('[data-anonymous-preview="validating"]'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Getting a visitor’s key…')).toBeTruthy();
    expect(screen.queryByText(/Limited preview/)).toBeNull();
  });

  it('says why once no turn is left', () => {
    themed(
      <AnonymousPreviewBox state={state({ refused: 'No turn is left.' })} />,
    );
    expect(screen.getByRole('alert').textContent).toBe('No turn is left.');
  });

  it('holds the key’s clock when the chat draws no header', () => {
    const { container, rerender } = themed(
      <AnonymousPreviewBox state={state({ headerShown: true })} />,
    );
    expect(container.querySelector('[data-anonymous-key-clock]')).toBeNull();
    rerender(
      <ThemeProvider>
        <BaseStyles>
          <AnonymousPreviewBox state={state({ headerShown: false })} />
        </BaseStyles>
      </ThemeProvider>,
    );
    expect(
      container.querySelector('[data-anonymous-key-clock="waiting"]'),
    ).toBeTruthy();
  });

  it('says Anonymous in the footer', () => {
    themed(<AnonymousFooterLabel />);
    expect(screen.getByText('Anonymous')).toBeTruthy();
  });
});

describe('a tool refused for want of an account', () => {
  const refused = {
    toolName: 'post_to_x',
    status: 'error',
    error: 'HTTP 401 Unauthorized',
  };

  it('offers Sign in to use it, in an anonymous conversation', () => {
    const signIn = vi.fn();
    themed(
      <AnonymousChatProvider value={state({ signIn })}>
        <AnonymousToolSignIn call={refused} />
      </AnonymousChatProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in to use post_to_x' }),
    );
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('offers nothing signed in, nor for another failure', () => {
    themed(<AnonymousToolSignIn call={refused} />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    themed(
      <AnonymousChatProvider value={state()}>
        <AnonymousToolSignIn
          call={{ toolName: 'search', status: 'error', error: 'Timed out' }}
        />
      </AnonymousChatProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
