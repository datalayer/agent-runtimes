/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { buildLoopReactor, LoopWorkspace } from '../shell/LoopWorkspace';
import { PluginsPanelPlugin } from '../plugins/plugins-panel';
import {
  LoopCommand,
  LoopViewType,
  createPromptChannel,
  type LoopViewProps,
  type LoopWorkspaceContext,
} from '../core';

let root: Root | null = null;
let container: HTMLDivElement;

afterEach(() => {
  const mounted = root;
  if (mounted) {
    act(() => mounted.unmount());
    root = null;
  }
  container?.remove();
});

const workspace: LoopWorkspaceContext = {
  serverUrl: 'http://server',
  agentId: 'loop-base',
  sandbox: { state: 'idle' },
  activeViewType: 'chat',
  setActiveViewType: () => {},
  prompts: createPromptChannel(),
  viewControls: {},
  setViewControls: () => {},
};

describe('a plugin contributing to the workspace', () => {
  it('offers its view and its command through the reactor', () => {
    const Plugin = definePlugin({
      name: '@tests/loop-plugin',
      contributes: [
        contribution(
          LoopViewType,
          {
            viewType: 'notebook',
            title: 'Notebook',
            order: 5,
            canOpen: ctx => ctx.sandbox.state === 'running',
            load: async () => ({ default: () => null }),
          },
          { id: 'notebook', order: 5 },
        ),
        contribution(
          LoopCommand,
          {
            name: 'notebook',
            description: 'Open the notebook',
            run: async () => {},
          },
          { id: 'notebook' },
        ),
      ],
    });

    const reactor = buildLoopReactor([Plugin]);
    reactor.start();

    const views = reactor.getContributions(LoopViewType);
    expect(views.map(v => v.id)).toEqual(['notebook']);
    // The gate is the plugin's, evaluated against the live workspace.
    expect(views[0].value.canOpen?.(workspace)).toBe(false);
    expect(reactor.getContributions(LoopCommand)[0].value.name).toBe(
      'notebook',
    );
  });

  it('takes its view away with it when disabled', () => {
    const Plugin = definePlugin({
      name: '@tests/removable',
      contributes: [
        contribution(
          LoopViewType,
          {
            viewType: 'sandbox',
            title: 'Sandbox',
            load: async () => ({ default: () => null }),
          },
          { id: 'sandbox' },
        ),
      ],
    });

    const reactor = buildLoopReactor([Plugin]);
    reactor.start();
    expect(reactor.getContributions(LoopViewType)).toHaveLength(1);

    reactor.disable('@tests/removable');

    // The shell tracks nothing: the switcher is built from what is there.
    expect(reactor.getContributions(LoopViewType)).toHaveLength(0);
  });

  it('orders views by their declared order', () => {
    const make = (id: string, order: number) =>
      definePlugin({
        name: `@tests/${id}`,
        contributes: [
          contribution(
            LoopViewType,
            {
              viewType: id,
              title: id,
              order,
              load: async () => ({ default: () => null }),
            },
            { id, order },
          ),
        ],
      });

    const reactor = buildLoopReactor([make('later', 10), make('first', 0)]);
    reactor.start();

    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'first',
      'later',
    ]);
  });
});

describe('the view switcher', () => {
  it('renders one tab per view and disables what cannot open', async () => {
    const { ViewSwitcher } = await import('../shell/ViewSwitcher');
    const views = [
      {
        extension: '@tests/a',
        id: 'chat',
        order: 0,
        value: {
          viewType: 'chat',
          title: 'Chat',
          load: async () => ({ default: () => null }),
        },
      },
      {
        extension: '@tests/b',
        id: 'notebook',
        order: 1,
        value: {
          viewType: 'notebook',
          title: 'Notebook',
          canOpen: () => false,
          unavailableReason: () => 'Needs a running sandbox',
          load: async () => ({ default: () => null }),
        },
      },
    ];

    const switched: string[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const mounted = root;
    act(() => {
      mounted.render(
        <ViewSwitcher
          views={views as never}
          workspace={{ ...workspace, setActiveViewType: v => switched.push(v) }}
        />,
      );
    });

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    // Marked unavailable, but still focusable so the reason can be heard.
    expect(tabs[1].getAttribute('aria-disabled')).toBe('true');
    expect((tabs[1] as HTMLButtonElement).disabled).toBe(false);

    // Clicking it does nothing.
    act(() => {
      (tabs[1] as HTMLButtonElement).click();
    });
    expect(switched).toEqual([]);
  });

  it('renders nothing when there is only one view', async () => {
    const { ViewSwitcher } = await import('../shell/ViewSwitcher');
    const views = [
      {
        extension: '@tests/a',
        id: 'chat',
        order: 0,
        value: {
          viewType: 'chat',
          title: 'Chat',
          load: async () => ({ default: () => null }),
        },
      },
    ];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const mounted = root;
    act(() => {
      mounted.render(
        <ViewSwitcher views={views as never} workspace={workspace} />,
      );
    });

    // One choice is not a choice.
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });
});

describe('slash dispatch', () => {
  it('runs the command whose name or alias matches', async () => {
    const ran = vi.fn();
    const Plugin = definePlugin({
      name: '@tests/commands',
      contributes: [
        contribution(
          LoopCommand,
          {
            name: 'models',
            aliases: ['model'],
            description: 'Models',
            run: async ctx => {
              ran(ctx.argv);
            },
          },
          { id: 'models' },
        ),
      ],
    });

    const reactor = buildLoopReactor([Plugin]);
    reactor.start();

    const commands = reactor.getContributions(LoopCommand);
    const match = commands.find(
      c =>
        c.value.name === 'model' || (c.value.aliases ?? []).includes('model'),
    );
    await match?.value.run({ workspace, argv: 'ollama:llama3.1:8b' });

    expect(ran).toHaveBeenCalledWith('ollama:llama3.1:8b');
  });
});

describe('view controls', () => {
  it('carry busy and stop from the view to the shell', () => {
    // The prompt lives in the shell and the work happens in a view, so the
    // spinner and the stop button would otherwise be in the wrong place.
    let published: import('../core').ViewControls | null = null;
    const stop = vi.fn();

    const setViewControls = (
      controls: import('../core').ViewControls | null,
    ) => {
      published = controls;
    };

    // What a view does on mount, when it starts working, and on unmount.
    setViewControls({ stop });
    expect(published).toEqual({ stop });

    setViewControls({ busy: true, stop });
    expect(published?.busy).toBe(true);
    published?.stop?.();
    expect(stop).toHaveBeenCalled();

    setViewControls(null);
    expect(published).toBeNull();
  });
});

describe('plugin toggles', () => {
  it('reflect the reactor rather than a copy of it', () => {
    const make = (id: string) =>
      definePlugin({
        name: `@datalayer/loop-plugin-${id}`,
        contributes: [
          contribution(
            LoopViewType,
            {
              viewType: id,
              title: id,
              load: async () => ({ default: () => null }),
            },
            { id },
          ),
        ],
      });

    const reactor = buildLoopReactor([make('one'), make('two')]);
    reactor.start();

    expect(reactor.listPlugins()).toHaveLength(2);
    expect(reactor.isEnabled('@datalayer/loop-plugin-one')).toBe(true);

    reactor.disable('@datalayer/loop-plugin-one');

    // What the checkbox reads, and what the switcher reads, are the same facts.
    expect(reactor.isEnabled('@datalayer/loop-plugin-one')).toBe(false);
    expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual([
      'two',
    ]);

    reactor.enable('@datalayer/loop-plugin-one');
    expect(
      reactor
        .getContributions(LoopViewType)
        .map(v => v.id)
        .sort(),
    ).toEqual(['one', 'two']);
  });

  it('notifies subscribers on every toggle, so a checkbox list re-renders', () => {
    const Plugin = definePlugin({ name: '@datalayer/loop-plugin-x' });
    const reactor = buildLoopReactor([Plugin]);
    reactor.start();

    let notifications = 0;
    reactor.subscribe(() => {
      notifications += 1;
    });

    reactor.disable('@datalayer/loop-plugin-x');
    reactor.enable('@datalayer/loop-plugin-x');

    expect(notifications).toBe(2);
  });
});

describe('the blank base', () => {
  it('renders no prompt of its own', async () => {
    // The prompt is the chat's. A workspace mounted without a chat plugin
    // should have nothing to type into — an input box wired to nothing is
    // worse than no input box.
    const reactor = buildReactorFromPlugins([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
    });

    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('input')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('draws no sidebar when no plugin fills it', async () => {
    const reactor = buildReactorFromPlugins([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
    });

    // Chrome around nothing is still chrome.
    expect(container.querySelector('aside')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('draws one when a plugin does', async () => {
    const reactor = buildReactorFromPlugins([PluginsPanelPlugin]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
    });

    expect(container.querySelector('aside')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe('dispatch', () => {
  it('stays with the workspace, so a plugin prompt can run any command', async () => {
    // No single plugin can see the others' commands, which is why `submit`
    // is the workspace's and not the chat's.
    let submit: LoopWorkspaceContext['submit'] | undefined;
    const ran: string[] = [];

    const probe = definePlugin({
      name: 'probe',
      contributes: [
        contribution(
          LoopCommand,
          {
            name: 'ping',
            description: 'ping',
            run: async () => {
              ran.push('ping');
            },
          },
          { id: 'ping' },
        ),
        contribution(
          LoopViewType,
          {
            viewType: 'probe',
            title: 'Probe',
            load: async () => ({
              default: ({ workspace }: LoopViewProps) => {
                submit = workspace.submit;
                return <div />;
              },
            }),
          },
          { id: 'probe' },
        ),
      ],
    });

    const reactor = buildReactorFromPlugins([probe]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const outcome = await submit!('/ping');
    expect(ran).toEqual(['ping']);
    expect(outcome.handled).toBe(true);
    expect(outcome.command).toBe('ping');

    // And an unknown one comes back with something to show the person.
    const unknown = await submit!('/nope');
    expect(unknown.handled).toBe(false);
    expect(unknown.reason).toMatch(/unknown command/i);

    await act(async () => root.unmount());
    container.remove();
  });
});
