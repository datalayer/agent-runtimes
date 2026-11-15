/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an anonymous visitor's conversation draws (the user, 15 November
 * 2026): the box on top, its skeleton while the key is checked, the key's
 * clock where there is no header, Sign in to use a refused tool, and the MCP
 * servers and skills listed disabled.
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
import { McpStatusIndicator } from '../../indicators/McpStatusIndicator';
import { SkillsStatusIndicator } from '../../indicators/SkillsStatusIndicator';

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
    disabledMcpServers: [],
    disabledSkills: [],
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

describe('the MCP and skills indicators, anonymous', () => {
  it('list each server and skill as disabled, in the warning colour', () => {
    const { container } = themed(
      <>
        <McpStatusIndicator disabled={['X', 'Bluesky']} />
        <SkillsStatusIndicator
          skillsCount={0}
          enabledCount={0}
          disabled={['crawl']}
        />
      </>,
    );
    const mcp = container.querySelector('[data-disabled-indicator="mcp"]');
    expect(mcp?.getAttribute('aria-label')).toBe(
      'MCP servers are disabled without an account',
    );
    fireEvent.click(mcp as Element);
    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('Bluesky')).toBeTruthy();
    expect(screen.getAllByText('Disabled')).toHaveLength(2);
    expect(
      container.querySelector('[data-disabled-indicator="skills"]'),
    ).toBeTruthy();
  });

  it('draws nothing when the agent has none', () => {
    const { container } = themed(<McpStatusIndicator disabled={[]} />);
    expect(container.querySelector('button')).toBeNull();
  });
});
