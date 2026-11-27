/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The presentation plugin (`apps/plugins/agent-presentation`): an
 * application's `presentation`, one Markdown document of its spec, in the
 * workspace's left panel — a paragraph, a bullet list with a check mark
 * before each item, a note in emphasis, and its links as actions — under the
 * application's emoji and name; an address of the site the host's to open
 * first (`PresentationLinks.open`), else navigated to with core's
 * `useNavigate`; an address elsewhere in a new tab.
 */

import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('@datalayer/core/lib/hooks', () => ({ useNavigate: () => navigate }));
// Core's Fluent drawings load lazily: the emoji as text stands in.
vi.mock('@datalayer/core/lib/components/emoji', () => ({
  FluentEmoji: ({ emoji }: { emoji: string }) => (
    <span data-emoji="">{emoji}</span>
  ),
}));

import { buildReactorFromPlugins } from '@datalayer/reactor';
import { PlayIcon } from '@primer/octicons-react';
import { AgentSlots } from '../core';
import { AgentPresentation } from '../plugins/agent-presentation/AgentPresentation';
import {
  AGENT_PRESENTATION_COMPONENT,
  AGENT_PRESENTATION_PLUGIN_NAME,
  AgentPresentationPlugin,
  agentPresentationComponent,
  agentPresentationPlugin,
  presentationLabel,
  presentationOf,
} from '../plugins/agent-presentation';
import {
  actionsOf,
  isNote,
  isSiteLink,
  type MarkdownNode,
} from '../plugins/agent-presentation/presentationBlocks';
import { APP_CATALOGUE } from '../../specs/apps';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const text = (value: string): MarkdownNode => ({ type: 'text', value });
const element = (
  tagName: string,
  children: MarkdownNode[],
  properties: Record<string, unknown> = {},
): MarkdownNode => ({ type: 'element', tagName, properties, children });
const link = (label: string, href: string) =>
  element('a', [text(label)], { href });

const marketer = APP_CATALOGUE['marketer-tryout'];

beforeEach(() => navigate.mockClear());
afterEach(() => cleanup());

describe('a paragraph of a presentation', () => {
  it('is its actions when it holds only links, the one in bold the main one', () => {
    const paragraph = element('p', [
      element('strong', [link('Start building', '/signin')]),
      text('\n'),
      link('In slides', '/decks'),
    ]);
    expect(actionsOf(paragraph)).toEqual([
      { label: 'Start building', href: '/signin', primary: true },
      { label: 'In slides', href: '/decks', primary: false },
    ]);
    // Words beside a link, or bold words, are a paragraph.
    expect(
      actionsOf(element('p', [text('Read '), link('the guide', '/guide')])),
    ).toEqual([]);
    expect(
      actionsOf(element('p', [element('strong', [text('Bold')])])),
    ).toEqual([]);
    expect(actionsOf(undefined)).toEqual([]);
  });

  it('is a note when it is wholly in emphasis', () => {
    expect(isNote(element('p', [element('em', [text('Try it here.')])]))).toBe(
      true,
    );
    expect(
      isNote(
        element('p', [text('It '), element('em', [text('never')]), text('.')]),
      ),
    ).toBe(false);
  });

  it('tells an address of the site from one elsewhere', () => {
    expect([
      isSiteLink('/signin'),
      isSiteLink('https://datalayer.ai'),
      isSiteLink('//evil.example'),
    ]).toEqual([true, false, false]);
  });
});

describe('the Marketer’s presentation, from its spec', () => {
  it('draws the heading, the paragraph, five checked lines, the note and the actions', async () => {
    render(
      <AgentPresentation
        emoji={marketer.emoji}
        name={marketer.name}
        presentation={marketer.presentation ?? ''}
      />,
    );
    expect((await screen.findByRole('heading', { level: 3 })).textContent).toBe(
      'Marketer',
    );
    expect(document.querySelector('[data-emoji]')?.textContent).toBe('📣');
    const list = document.querySelector(
      '[data-agent-presentation-list]',
    ) as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    }
    expect(
      document.querySelector('[data-agent-presentation-note]')?.textContent,
    ).toMatch(/^Try it here/);
    const actions = document.querySelector(
      '[data-agent-presentation-actions]',
    ) as HTMLElement;
    expect(
      within(actions).getByRole('button', { name: /Start building/ }),
    ).toBeTruthy();
    const slides = within(actions).getByRole('link', {
      name: 'Poppy agents, in slides',
    });
    // No icon before a link unless the host says one.
    expect(slides.querySelector('svg')).toBeNull();
    expect(
      document.querySelector('[data-agent-presentation]')?.textContent,
    ).not.toMatch(/\*|\]\(|^- /m);
  });

  it('navigates through core’s useNavigate, from the button and from the link', async () => {
    render(
      <AgentPresentation
        emoji={marketer.emoji}
        name={marketer.name}
        presentation={marketer.presentation ?? ''}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Start building/ }),
    );
    expect(navigate).toHaveBeenLastCalledWith('/signin');
    fireEvent.click(
      screen.getByRole('link', { name: 'Poppy agents, in slides' }),
    );
    expect(navigate).toHaveBeenLastCalledWith(
      '/visitors/decks/agents/poppy-agents',
    );
  });

  it('lets the host open an address its own way first, and put an icon before a link', async () => {
    const open = vi.fn((href: string) => href.startsWith('/visitors/'));
    render(
      <AgentPresentation
        emoji={marketer.emoji}
        name={marketer.name}
        presentation={marketer.presentation ?? ''}
        links={{ open, visual: () => PlayIcon }}
      />,
    );
    const slides = await screen.findByRole('link', {
      name: 'Poppy agents, in slides',
    });
    expect(slides.querySelector('svg')).not.toBeNull();
    fireEvent.click(slides);
    expect(open).toHaveBeenLastCalledWith(
      '/visitors/decks/agents/poppy-agents',
    );
    expect(navigate).not.toHaveBeenCalled();
    // Not the host's: navigated to.
    fireEvent.click(screen.getByRole('button', { name: /Start building/ }));
    expect(navigate).toHaveBeenLastCalledWith('/signin');
  });
});

describe('what a spec may write', () => {
  it('opens an address elsewhere in a new tab, and is drawn without markup', async () => {
    render(
      <AgentPresentation
        emoji="🧪"
        name="Test"
        presentation={
          'Reads [the site](https://example.com/a).\n\n**[Elsewhere](https://example.com/b)**'
        }
      />,
    );
    const inline = await screen.findByRole('link', { name: 'the site' });
    expect(inline.getAttribute('target')).toBe('_blank');
    expect(inline.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(inline);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Elsewhere/ })).toBeTruthy();
    // The chat's own plugins, which show markup written in the Markdown as the text it is.
    expect(
      readFileSync(
        join(
          __dirname,
          '..',
          'plugins',
          'agent-presentation',
          'AgentPresentation.tsx',
        ),
        'utf8',
      ),
    ).toContain('rehypePlugins={REHYPE_PLUGINS_WITHOUT_HTML}');
  });
});

describe('the plugin', () => {
  it('fills the left panel, named by the application, only when its spec presents it', () => {
    const reactor = buildReactorFromPlugins([AgentPresentationPlugin as never]);
    expect(reactor.listPlugins()).toContain(AGENT_PRESENTATION_PLUGIN_NAME);
    expect(
      buildReactorFromPlugins([
        agentPresentationPlugin({ open: () => false }) as never,
      ]).listPlugins(),
    ).toContain(AGENT_PRESENTATION_PLUGIN_NAME);
    expect(AGENT_PRESENTATION_COMPONENT.slot).toBe(AgentSlots.leftPanel);
    expect(presentationLabel(marketer)).toBe('Marketer: what it does');
    expect(AGENT_PRESENTATION_COMPONENT.panel?.when?.(marketer)).toBe(true);
    expect(
      AGENT_PRESENTATION_COMPONENT.panel?.when?.({
        name: 'Marketer',
        presentation: '  ',
      } as never),
    ).toBe(false);
    expect(AGENT_PRESENTATION_COMPONENT.panel?.when?.(undefined)).toBe(false);
    expect(presentationOf(undefined)).toBe('');
  });

  it('draws its own Close cross, which closes the panel through the shell', async () => {
    const Panel = agentPresentationComponent().Component as React.ComponentType<
      Record<string, unknown>
    >;
    const close = vi.fn();
    await act(async () => {
      render(
        <Panel
          application={marketer}
          close={close}
          open
          panelId="agent-left-panel-x"
          toggle={() => undefined}
        />,
      );
    });
    const cross = screen.getByRole('button', { name: 'Close' });
    expect(cross.hasAttribute('data-agent-left-panel-close')).toBe(true);
    fireEvent.click(cross);
    expect(close).toHaveBeenCalledTimes(1);
    expect(AGENT_PRESENTATION_COMPONENT.panel?.closes).toBe(true);
    expect((await screen.findByRole('heading', { level: 3 })).textContent).toBe(
      'Marketer',
    );
  });

  it('draws nothing for an application that presents nothing', () => {
    const Panel = AGENT_PRESENTATION_COMPONENT.Component as React.ComponentType<
      Record<string, unknown>
    >;
    const { container } = render(
      <Panel application={{ name: 'Marketer', emoji: '📣' }} />,
    );
    expect(container.textContent).toBe('');
  });
});
