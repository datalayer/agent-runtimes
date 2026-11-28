/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Who answers, in the chat's title bar (the user, 28 November 2026: the
 * landing's row above the demo baked into the agent's header): the identity
 * plugin draws the agent's emoji, name and what it does, from its
 * presentation, in `AgentSlots.chatHeaderTitle`, which the header draws in
 * place of its own face and name — the status (*Ready*) and the (i) kept.
 * The agent is the workspace's application's, else the workspace's own; one
 * with no presentation is refused.
 */

// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Core's Fluent drawings load lazily: the emoji as text stands in.
vi.mock('@datalayer/core/lib/components/emoji', () => ({
  FluentEmoji: ({ emoji }: { emoji: string }) => (
    <span data-emoji="">{emoji}</span>
  ),
}));

import { ThemeProvider, BaseStyles } from '@primer/react';
import { buildReactorFromPlugins, type PluginRef } from '@datalayer/reactor';
import { ReactorSlot, registerReactor } from '@datalayer/reactor/react';
import { AgentSlots, type AgentWorkspaceContext } from '../core';
import { defineAgentCapacityPlugin } from '../plugins/agent-capacity';
import {
  AGENT_IDENTITY_PLUGIN_NAME,
  AgentIdentityPlugin,
  bareAgentId,
  presentationOrFail,
} from '../plugins/agent-identity';
import { IDENTITY_WIDE } from '../plugins/agent-identity/AgentIdentity';
import { ChatBaseHeader } from '../../chat/header/ChatHeaderBase';
import { getAgentPresentation } from '../../specs/agentPresentations';

afterEach(() => {
  cleanup();
  registerReactor(null);
});

const source = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8');

function withPlatform(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  return reactor;
}

/** An application's agent, as `AppRenderer` contributes it: versioned. */
const applicationOf = (specId: string) =>
  defineAgentCapacityPlugin({
    key: 'app-test',
    displayName: 'Test application',
    description: 'An application, for its agent.',
    specId,
  }) as PluginRef;

const workspaceOf = (agentId: string) =>
  ({ agentId }) as unknown as AgentWorkspaceContext;

const header = (workspace: AgentWorkspaceContext) =>
  render(
    <ThemeProvider>
      <BaseStyles>
        <ChatBaseHeader
          title="Name the chat would draw"
          brandIcon={<span data-chat-face="" />}
          headerTitle={
            <ReactorSlot
              slot={AgentSlots.chatHeaderTitle}
              props={{ workspace }}
            />
          }
          headerContent={<span data-presence-line="">Ready</span>}
          showInformation
          padding={2}
          messageCount={0}
          onNewChat={() => undefined}
          onClear={() => undefined}
        />
      </BaseStyles>
    </ThemeProvider>,
  );

describe('the identity plugin', () => {
  it('puts its component in the title slot of the chat’s header', () => {
    const reactor = withPlatform([AgentIdentityPlugin as PluginRef]);
    expect(reactor.listPlugins()).toContain(AGENT_IDENTITY_PLUGIN_NAME);
    const components =
      reactor.getOutput<{ components: { slot: string; id: string }[] }>(
        AGENT_IDENTITY_PLUGIN_NAME,
      )?.components ?? [];
    expect(components.map(entry => [entry.slot, entry.id])).toEqual([
      [AgentSlots.chatHeaderTitle, 'agent-identity'],
    ]);
    expect(AgentSlots.chatHeaderTitle).toBe('agent.chatHeader.title');
  });

  it('names the application’s agent: its emoji, its name, its description and its tagline, the whole description on hover', async () => {
    withPlatform([
      applicationOf('worker-shopper:0.0.1'),
      AgentIdentityPlugin as PluginRef,
    ]);
    header(workspaceOf('shopper-tryout-instance'));
    const shopper = getAgentPresentation('worker-shopper')!;
    const name = await screen.findByText(shopper.name);
    expect(name.hasAttribute('data-agent-identity-name')).toBe(true);
    expect(name.tagName).toBe('H3');
    const identity = document.querySelector(
      '[data-agent-identity]',
    ) as HTMLElement;
    expect(identity.getAttribute('data-agent-identity')).toBe('worker-shopper');
    expect(identity.querySelector('[data-emoji]')?.textContent).toBe(
      shopper.emoji,
    );
    expect(
      identity.querySelector('[data-agent-identity-description]')?.textContent,
    ).toBe(shopper.description);
    expect(
      identity.querySelector('[data-agent-identity-tagline]')?.textContent,
    ).toBe(shopper.tagline);
    expect(
      identity.querySelector(`[title="${shopper.description}"]`),
    ).not.toBeNull();
    // In place of the chat's own face and name; the status and the (i) kept.
    expect(screen.queryByText('Name the chat would draw')).toBeNull();
    expect(document.querySelector('[data-chat-face]')).toBeNull();
    expect(document.querySelector('[data-presence-line]')?.textContent).toBe(
      'Ready',
    );
    expect(screen.getByRole('button', { name: 'Information' })).toBeTruthy();
  });

  it('names the workspace’s own agent when no application says one', async () => {
    withPlatform([AgentIdentityPlugin as PluginRef]);
    header(workspaceOf('worker-marketer:0.0.1'));
    expect(
      (await screen.findByText('Marketer')).hasAttribute(
        'data-agent-identity-name',
      ),
    ).toBe(true);
  });

  it('refuses an agent that says no presentation', () => {
    expect(() => presentationOrFail('worker-nobody')).toThrow(
      /worker-nobody says no presentation/,
    );
    expect(() => presentationOrFail(undefined)).toThrow(/no presentation/);
    expect(presentationOrFail('worker-traveller:0.0.1').id).toBe(
      'worker-traveller',
    );
    expect(bareAgentId('worker-shopper:0.0.1')).toBe('worker-shopper');
  });

  it('draws the description where the title row is wide and the tagline where it is narrow, on one line each', () => {
    const view = source('plugins/agent-identity/AgentIdentity.tsx');
    expect(IDENTITY_WIDE).toBe(720);
    expect(view).toContain(
      '[`@container (max-width: ${IDENTITY_WIDE - 1}px)`]',
    );
    expect(view).toContain('[`@container (min-width: ${IDENTITY_WIDE}px)`]');
    expect(view).toContain("whiteSpace: 'nowrap'");
    expect(view).toContain("textOverflow: 'ellipsis'");
    expect(view).toContain("maxWidth: 'min(72ch, 40cqi)'");
    expect(view).toContain("import { Box } from '@datalayer/primer-addons';");
    expect(view).not.toMatch(/from '@primer\/react'[^\n]*\bBox\b/);
  });

  it('is what the chat hands its header when a plugin fills the title slot', () => {
    const chat = source('plugins/chat/ChatView.tsx');
    expect(chat).toContain(
      'const chatHeaderTitleItems = useSlotComponents(AgentSlots.chatHeaderTitle);',
    );
    expect(chat).toMatch(
      /chatHeaderTitleItems\.length > 0\s*\? \{\s*headerTitle: \(\s*<ReactorSlot\s*slot=\{AgentSlots\.chatHeaderTitle\}/,
    );
  });
});
