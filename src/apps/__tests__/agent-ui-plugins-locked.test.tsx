/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The locked chips a visitor sees in the title bar (the user, 15 November
 * 2026: "the marketer is not showing the login button"): each with its
 * words, each signing the visitor in as the host said, none calling a route.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnonymousChatProvider,
  type AnonymousChatState,
} from '../../chat/anonymous/AnonymousChat';
import { ANONYMOUS_WORDS } from '../../chat/anonymous/anonymousMode';
import { agentUiChoicesOf, lockedUiOf } from '../agentUiPlugins';
import { LockedUiChips } from '../plugins/locked-ui';

afterEach(cleanup);

describe('the locked chips', () => {
  it('say what signing in opens, and sign the visitor in', () => {
    const signIn = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const state = { signIn } as unknown as AnonymousChatState;
    const labels = lockedUiOf(agentUiChoicesOf('worker-marketer'));
    const { container, getByText } = render(
      <AnonymousChatProvider value={state}>
        <LockedUiChips labels={labels} />
      </AnonymousChatProvider>,
    );
    const chips = container.querySelectorAll('[data-locked-ui-chip]');
    expect(chips).toHaveLength(3);
    const linkedin = getByText(ANONYMOUS_WORDS.locked.linkedin);
    expect(linkedin.closest('button')?.getAttribute('title')).toBe(
      ANONYMOUS_WORDS.lockedWhy,
    );
    fireEvent.click(linkedin);
    fireEvent.click(getByText(ANONYMOUS_WORDS.locked.x));
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('draws nothing when nothing is locked', () => {
    const { container } = render(<LockedUiChips labels={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
