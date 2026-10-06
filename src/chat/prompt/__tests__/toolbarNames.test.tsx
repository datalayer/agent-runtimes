/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The composer's toolbar, as a screen reader meets it (LOOP H-21): every
 * control named by what it is, none named for having nothing to offer — the
 * MCP and skills dots are not drawn when the agent has neither — and the
 * dots that pulse stand still under reduced motion.
 */

// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { computeAccessibleName } from 'dom-accessibility-api';
import { afterEach, describe, expect, it } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import { InputPrompt, type InputPromptProps } from '../InputPrompt';
import { defineAppComposerPlugin } from '../../../loop/apps/AppComposer';
import { parseAppspec } from '../../../loop/apps/appspec';
import type { McpToolsetsStatusResponse } from '../../../types/mcp';

afterEach(cleanup);

/** A composer as an application's conversation draws it: no session menus. */
const APP_COMPOSER: InputPromptProps = {
  input: '',
  setInput: () => undefined,
  isLoading: false,
  connectionConfirmed: true,
  autoFocus: false,
  padding: 2,
  onSend: () => undefined,
  onStop: () => undefined,
  showTokenUsage: false,
  showModelSelector: false,
  showToolsMenu: false,
  showSkillsMenu: false,
  codemodeEnabled: false,
  hasConfigData: true,
  hasSkillsData: true,
};

function draw(element: React.ReactElement) {
  return render(
    <ThemeProvider>
      <BaseStyles>{element}</BaseStyles>
    </ThemeProvider>,
  );
}

/** The name of every button, as assistive technology computes it. */
function buttonNames(): string[] {
  return screen
    .getAllByRole('button')
    .map(button => computeAccessibleName(button));
}

function expectEveryButtonNamed(): void {
  const names = buttonNames();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name.trim()).not.toBe('');
    expect(name).not.toMatch(/^No .* defined$/);
  }
}

/** The CSS styled-components wrote, where the media queries end up. */
function styles(): string {
  return [...document.querySelectorAll('style')]
    .map(style => style.textContent ?? '')
    .join('\n');
}

const STARTING: McpToolsetsStatusResponse = {
  initialized: false,
  ready_count: 0,
  failed_count: 0,
  ready_servers: [],
  failed_servers: {},
  servers: [{ id: 'github', status: 'starting' }],
};

describe('the composer’s toolbar, read by name', () => {
  it('names every control, and draws no MCP or skills dot for an agent with neither', () => {
    draw(<InputPrompt {...APP_COMPOSER} />);
    expectEveryButtonNamed();
    expect(buttonNames()).toEqual(['Send']);
    expect(screen.queryByRole('button', { name: /MCP/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Skills/ })).toBeNull();
  });

  it('names the send button once there are words, and the stop button while it works', () => {
    const { rerender } = draw(<InputPrompt {...APP_COMPOSER} input="hi" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    rerender(
      <ThemeProvider>
        <BaseStyles>
          <InputPrompt {...APP_COMPOSER} input="hi" isLoading />
        </BaseStyles>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expectEveryButtonNamed();
  });

  it('names the MCP and skills dots by their state when there is something to report', () => {
    draw(
      <InputPrompt
        {...APP_COMPOSER}
        mcpStatusData={STARTING}
        skills={[{ id: 'pdf', name: 'PDF' }] as never}
        enabledSkills={new Set(['pdf'])}
      />,
    );
    expectEveryButtonNamed();
    expect(
      screen.getByRole('button', { name: 'MCP servers starting…' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Skills active (1/1 enabled)' }),
    ).toBeInTheDocument();
  });

  it('names an agent chat’s menus by what they hold', () => {
    draw(
      <InputPrompt
        {...APP_COMPOSER}
        showModelSelector
        showToolsMenu
        showSkillsMenu
        suggestions={[{ title: 'Plan a trip', message: 'Plan a trip' }]}
        showSuggestionsMenu
      />,
    );
    expectEveryButtonNamed();
    for (const name of [/^Tools — /, /^Skills — /, /^Model — /]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'Suggestions — 1 to choose from' }),
    ).toBeInTheDocument();
  });

  it('names an application’s mode switch by its mode and the option it is on', () => {
    const app = parseAppspec({
      schema: 'loop.app/v1',
      id: 'desk',
      name: 'Desk',
      kind: 'chat',
      agent: 'cog-crawler:0.0.1',
      interface: {
        modes: [
          {
            id: 'depth',
            label: 'Depth',
            options: [
              { id: 'quick', label: 'Quick' },
              { id: 'thorough', label: 'Thorough' },
            ],
          },
        ],
      },
    }).app;
    const plugin = defineAppComposerPlugin(app);
    const built = (
      plugin.build as unknown as () => {
        components: Array<{ Component: React.ComponentType }>;
      }
    )();
    const [{ Component: ModeSwitches }] = built.components;
    draw(<InputPrompt {...APP_COMPOSER} footerExtras={<ModeSwitches />} />);
    expectEveryButtonNamed();
    expect(
      screen.getByRole('button', { name: 'Depth: Quick' }),
    ).toBeInTheDocument();
  });

  it('stands its pulsing dots still under reduced motion', () => {
    draw(
      <InputPrompt
        {...APP_COMPOSER}
        mcpStatusData={STARTING}
        skills={[{ id: 'pdf', name: 'PDF' }] as never}
        skillsLoading
      />,
    );
    const css = styles();
    expect(css).toMatch(/mcp-pulse/);
    expect(css).toMatch(/skills-pulse/);
    const reduced = css.match(
      /@media \(prefers-reduced-motion: ?reduce\)\{[^}]*\{animation:none;?\}/g,
    );
    expect(reduced?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
