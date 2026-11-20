/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an anonymous visitor's conversation draws (the user, 15 November
 * 2026): Sign in to use a refused tool. The
 * limited preview is an indicator beside the composer, no box on top (20
 * November 2026; `apps/plugins/limited-preview`). Its MCP servers and skills
 * are listed as the runtime says them, in the same overlays as anyone's
 * (equipment-menus.test).
 */

// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import {
  AnonymousChatProvider,
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
