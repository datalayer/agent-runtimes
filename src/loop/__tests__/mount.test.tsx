/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace mounts with its plugins on.
 *
 * Written because it did not: Primer's `Tooltip` requires its child to *be*
 * the interactive element, and two plugins wrapped something else — a status
 * `Text`, and a `SegmentedControl.Button` that renders a list item around its
 * button. Both threw during render, which a contribution-shape test cannot
 * see. This one renders.
 */

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  buildReactorFromPlugins,
  configurePlugin,
  contribution,
  definePlugin,
  onView,
} from '@datalayer/reactor';
import { LoopViewType } from '../core';
import { LoopWorkspace } from '../shell/LoopWorkspace';
import { CodeSandboxPlugin } from '../plugins/code-sandbox';
import { NotebookPlugin } from '../plugins/notebook';
import { DocumentPlugin } from '../plugins/document';
import { PluginsPanelPlugin } from '../plugins/plugins-panel';
import { ModelsPlugin } from '../plugins/models';
import { AgentsPlugin } from '../plugins/agents';
import { ChatPlugin } from '../plugins/chat';

async function mount(
  extensions: Parameters<typeof buildReactorFromPlugins>[0],
) {
  const reactor = buildReactorFromPlugins(extensions);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const errors: unknown[] = [];

  await act(async () => {
    root.render(
      <ErrorBoundary onError={error => errors.push(error)}>
        <LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />
      </ErrorBoundary>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { container, root, errors };
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

describe('mounting the workspace', () => {
  it('renders with the sandbox header control on', async () => {
    // The sandbox contributes a status readout to the header slot.
    const { container, root, errors } = await mount([
      configurePlugin(CodeSandboxPlugin, {
        serverUrl: '',
        target: 'browser',
      }),
    ]);

    expect(errors).toEqual([]);
    const selector = container.querySelector<HTMLElement>(
      '[aria-label="Where code runs"]',
    );
    expect(selector).not.toBeNull();
    expect(selector?.textContent).toBe('BrowserLocalJupyterDatalayer');
    // Kept inline because the examples page applies typography list styles
    // after Primer's stylesheet.
    expect(selector?.style.listStyle).toBe('none');

    const indicator = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Kernel "]',
    );
    expect(indicator).not.toBeNull();
    expect(document.querySelector('[aria-label="Browser Kernel"]')).toBeNull();
    act(() => {
      indicator?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(
      document.querySelector('[aria-label="Browser Kernel"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders with the editors and the plugin panel on', async () => {
    // The editors put a picker in the chat; the panel puts a list in the
    // sidebar. Both render for real here.
    const { container, root, errors } = await mount([
      configurePlugin(CodeSandboxPlugin, {
        serverUrl: '',
        target: 'browser',
      }),
      NotebookPlugin,
      DocumentPlugin,
      PluginsPanelPlugin,
    ]);

    expect(errors).toEqual([]);
    expect(container.querySelector('aside')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe('the plugins panel', () => {
  it('renders its list without Primer complaining', async () => {
    // Primer warns rather than throws when a prop is on the wrong element, so
    // a render test that only watches for errors would miss it. The panel
    // locks itself, which is the row that exercises the disabled path.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container, root, errors } = await mount([PluginsPanelPlugin]);

    expect(errors).toEqual([]);
    // Primer warns as `console.warn('Warning:', message)`, so the message is
    // the *second* argument — reading only the first finds 'Warning:' and
    // misses everything that matters.
    const complaints = [...warn.mock.calls, ...error.mock.calls]
      .map(call => call.map(part => String(part ?? '')).join(' '))
      .filter(message => message.includes('disabled'));
    expect(complaints).toEqual([]);

    // And the locked row really is disabled, which is the behaviour the prop
    // was there for.
    const boxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect([...boxes].some(box => box.disabled)).toBe(true);

    warn.mockRestore();
    error.mockRestore();
    await act(async () => root.unmount());
    container.remove();
  });
});

describe('the header plugins', () => {
  it('render with no models to choose from', async () => {
    // `ActionMenu` reads its two children directly and throws on a null
    // second one, so a conditionally-rendered `Overlay` takes the whole
    // workspace down. Nothing fetches a catalogue here, which is exactly the
    // empty case that used to crash.
    const { container, root, errors } = await mount([
      ModelsPlugin,
      AgentsPlugin,
    ]);

    expect(errors).toEqual([]);
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the whole workspace with every plugin on', async () => {
    const { container, root, errors } = await mount([
      configurePlugin(CodeSandboxPlugin, {
        serverUrl: '',
        target: 'browser',
      }),
      ChatPlugin,
      NotebookPlugin,
      DocumentPlugin,
      ModelsPlugin,
      AgentsPlugin,
      PluginsPanelPlugin,
    ]);

    expect(errors).toEqual([]);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe('the open view', () => {
  it('is announced as an event, so plugins can wait for it and stand down', async () => {
    // A plugin that only matters inside one view: it waits for that view and
    // retires when another opens. Nothing names it, and it names no view
    // besides its own.
    const NotebookOnly = definePlugin({
      name: '@test/notebook-only',
      activationEvents: [onView('notebook')],
      deactivationEvents: [onView('chat')],
    });
    // The view it waits for has to exist for the shell to open it.
    const Views = definePlugin({
      name: '@test/views',
      contributes: [
        contribution(
          LoopViewType,
          {
            viewType: 'notebook',
            title: 'Notebook',
            order: 0,
            load: async () => ({ default: () => null }),
          },
          { id: 'notebook', order: 0 },
        ),
      ],
    });

    const reactor = buildReactorFromPlugins([Views, NotebookOnly]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <LoopWorkspace
          serverUrl=""
          agentId="a"
          reactor={reactor}
          initialViewType="notebook"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The shell fired `onView:notebook` for the view it opened.
    expect(reactor.getManifest('@test/notebook-only')?.activated).toBe(true);

    await act(async () => {
      reactor.getContributions(LoopViewType);
      await reactor.fire(onView('chat'));
    });

    // And the same channel stands it down again.
    expect(reactor.getManifest('@test/notebook-only')?.activated).toBe(false);

    root.unmount();
    container.remove();
  });
});
