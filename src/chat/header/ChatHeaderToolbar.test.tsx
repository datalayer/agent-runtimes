/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat header is a primer-addons `Toolbar` (the user, 15 November 2026:
 * "the chat header is actually a primer addons toolbar and elements are added
 * on that toolbar — make sure the ui plugins inject (add) elements on that
 * toolbar"): the chat's controls, each UI plugin's header chrome and the
 * host's actions are its items, and what does not fit moves into "…".
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/agentUiPlugins', () => ({
  AGENT_UI_PLUGINS: {
    'x-budget': {
      Chrome: () => <span data-testid="chip-x-budget">12 / 50 posts</span>,
    },
    'odoo-context': {
      Chrome: () => <span data-testid="chip-odoo">Datalayer SRL</span>,
    },
    // A chrome that has nothing to say draws nothing, and takes no room.
    'trip-summary': { Chrome: () => null },
  },
}));

import { ChatBaseHeader, HEADER_CONTENT_NARROW } from './ChatHeaderBase';
import { uiChromeHeaderItems } from './uiChromeItems';

/** Every item is 40px wide; the toolbar's room is `room`. */
let room = 1000;
const restore: Array<() => void> = [];

beforeEach(() => {
  room = 1000;
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const width =
        this.hasAttribute('data-toolbar-key') && this.childNodes.length > 0
          ? 40
          : 0;
      return {
        width,
        height: 32,
        top: 0,
        left: 0,
        right: width,
        bottom: 32,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  );
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'toolbar' ? room : 0;
    },
  });
  restore.push(() => rect.mockRestore());
  restore.push(() => {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', descriptor);
    }
  });
});

afterEach(() => {
  cleanup();
  restore.splice(0).forEach(undo => undo());
});

const header = (extra: Partial<React.ComponentProps<typeof ChatBaseHeader>>) =>
  render(
    <ThemeProvider>
      <ChatBaseHeader
        title="Marketer"
        padding={2}
        messageCount={2}
        onNewChat={() => undefined}
        onClear={() => undefined}
        headerButtons={{ showNewChat: true, showClear: true }}
        headerItems={uiChromeHeaderItems([
          'x-budget',
          'odoo-context',
          'trip-summary',
        ])}
        headerActions={
          <button type="button" aria-label="Close chat">
            x
          </button>
        }
        {...extra}
      />
    </ThemeProvider>,
  );

const onLine = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll('[role="toolbar"] [data-toolbar-key]'),
  ).map(node => node.getAttribute('data-toolbar-key'));

describe('the chat header toolbar', () => {
  it('is a toolbar whose items are the controls, the plugins and the host', () => {
    const { container, getByTestId } = header({});
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute('aria-label')).toBe('Chat actions');
    expect(onLine(container)).toEqual([
      'chat-header-lead',
      'chat-header-new',
      'chat-header-clear',
      'ui-x-budget',
      'ui-odoo-context',
      'ui-trip-summary',
      'chat-header-actions',
    ]);
    // Each plugin's chrome is its own item, on the bar.
    expect(
      getByTestId('chip-x-budget').closest('[data-toolbar-key]'),
    ).toHaveProperty('dataset.toolbarKey', 'ui-x-budget');
    expect(container.querySelector('[data-toolbar-overflow]')).toBeNull();
  });

  it('moves the plugins’ chips into “…” first when narrow; the host’s close stays', () => {
    // new, clear, close = 3 × 40 + gaps; the two chips do not fit.
    room = 180;
    const { container } = header({});
    const line = onLine(container);
    expect(line).not.toContain('ui-x-budget');
    expect(line).not.toContain('ui-odoo-context');
    expect(line).toContain('chat-header-new');
    expect(line).toContain('chat-header-actions');
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-toolbar-overflow]',
    );
    expect(trigger).not.toBeNull();
    act(() => {
      fireEvent.click(trigger!);
    });
    const menu = document.querySelector('[data-toolbar-overflow-menu]');
    expect(menu?.textContent).toContain('12 / 50 posts');
    expect(menu?.textContent).toContain('Datalayer SRL');
    expect(menu?.textContent).not.toContain('x');
  });

  it('keeps a host with no plugins working: its actions are a pinned item', () => {
    room = 60;
    const { container, getByLabelText } = header({
      headerItems: undefined,
      headerButtons: undefined,
    });
    expect(getByLabelText('Close chat')).toBeTruthy();
    expect(onLine(container)).toContain('chat-header-actions');
  });

  it('leads the title row with what the workspace gives it, before the name and outside the toolbar', () => {
    const { container, getByLabelText } = header({
      headerLeading: (
        <button type="button" aria-label="Marketer: what it does">
          i
        </button>
      ),
    });
    const leading = getByLabelText('Marketer: what it does');
    const name = container.querySelector('h3')!;
    // Before the agent's name in the document, so on its leading side.
    expect(
      leading.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Never an item of the toolbar: a narrow chat cannot move it into "…".
    expect(leading.closest('[role="toolbar"]')).toBeNull();
  });
  it('gives the name room in a narrow chat: its state gives way first, the actions move into “…”', () => {
    const { container } = header({
      title: 'Shopper',
      headerLeading: (
        <button type="button" aria-label="Shopper: what it does">
          i
        </button>
      ),
      headerContent: <span data-testid="state">Ready</span>,
    });
    const what = container.querySelector<HTMLElement>(
      '[data-chat-header-what]',
    )!;
    const title = container.querySelector<HTMLElement>(
      '[data-chat-header-title]',
    )!;
    const content = container.querySelector<HTMLElement>(
      '[data-chat-header-content]',
    )!;
    // Never less than a toggle, a face and a short name take, at most two thirds of a wide row.
    expect(getComputedStyle(what).maxWidth).toBe('min(100%, max(65%, 13rem))');
    // The state beside the name shrinks long before the name does.
    expect(getComputedStyle(title).flexShrink).toBe('1');
    expect(getComputedStyle(content).flexShrink).toBe('1000');
    expect(getComputedStyle(content).minWidth).toBe('0');
    expect(getComputedStyle(content).overflow).toBe('hidden');
    // Not drawn at all in a title row as narrow as a phone's (a container query on the row).
    const row = container.querySelector<HTMLElement>('[data-chat-header-row]')!;
    expect(getComputedStyle(row).getPropertyValue('container-type')).toBe(
      'inline-size',
    );
    expect(HEADER_CONTENT_NARROW).toBe(400);
    expect(content.textContent).toBe('Ready');
    expect(title.textContent).toBe('Shopper');
    // The actions are the toolbar's, which moves what does not fit into “…”.
    room = 40;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(title.closest('[role="toolbar"]')).toBeNull();
  });
});
