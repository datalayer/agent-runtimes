/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugins manager from a button (the user, 21 November 2026: "reactor has
 * a plugin plugin-manager to list, enable, disable the plugins ... when user
 * will click on that icon in the footer the overlay will be shown"): its
 * plugin is an agent UI a visitor has, in the footer by default and only in
 * an Agent workspace; its button draws nothing where no platform runs, opens a
 * labelled dialog holding Reactor's list of the page's plugins, whose
 * switches call the platform, its own and the manager's fixed on; Escape
 * closes it, the focus back on the button.
 */

// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, BaseStyles } from '@primer/react';
import {
  buildReactorFromPlugins,
  definePlugin,
  type PluginRef,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import {
  AGENT_UI_PLUGINS,
  agentUiChromeOf,
  agentUiPluginsFor,
} from '../agentUiPlugins';
import { AgentSlots } from '../core';
import {
  PLUGIN_MANAGER_PLUGIN_NAME,
  PLUGIN_MANAGER_PROTECTED,
  PLUGIN_MANAGER_WORDS,
  PluginManagerButton,
  PluginManagerPlugin,
  pluginManagerPlugin,
} from '../plugins/plugin-manager';
import { AssistantStage } from '../../chat/assistant/AssistantStage';
import { ASSISTANT_CLEARANCE_VAR } from '../../chat/assistant/clearance';
import { PromptStacks } from '../../chat/prompt/stack';
import {
  PLUGIN_MANAGER_DEFAULT_WIDTH,
  pluginManagerDialogWidth,
} from '../plugins/plugin-manager/PluginManagerDialog';

// jsdom has no ResizeObserver, which Primer's dialog sizes its body with.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

afterEach(() => {
  cleanup();
  registerReactor(null);
});

const themed = (node: React.ReactNode) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

const DemoPlugin = definePlugin({
  name: '@example/demo-weather',
  displayName: 'Weather',
  description: 'Tells the weather.',
}) as PluginRef;

function withPlatform(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  return reactor;
}

describe('the plugins manager’s plugin', () => {
  it('is an agent UI a visitor has, in an Agent workspace’s footer by default', () => {
    const entry = AGENT_UI_PLUGINS['plugin-manager'];
    expect(entry.needsConnection).toBe(false);
    // No `Chat` chrome: outside a workspace there is no platform of the page's.
    expect(entry.Chrome).toBeUndefined();
    const [plugin] = agentUiPluginsFor(['plugin-manager'], { anonymous: true });
    expect((plugin as { name: string }).name).toBe(PLUGIN_MANAGER_PLUGIN_NAME);
    expect(agentUiChromeOf(['plugin-manager']).footer).toEqual([]);
  });

  it('fills the chat’s footer row under the prompt, or the title bar', async () => {
    const footer = buildReactorFromPlugins([PluginManagerPlugin]);
    await footer.start();
    // In the row under the prompt, beside its controls, usable while the
    // prompt is closed — not a row of its own below it (22 November 2026).
    expect(footer.getManifest(PLUGIN_MANAGER_PLUGIN_NAME)?.slots).toEqual([
      AgentSlots.promptStatus,
    ]);
    const drawn = footer.getOutput(PLUGIN_MANAGER_PLUGIN_NAME) as {
      components: { slot: string }[];
    };
    expect(drawn.components.map(component => component.slot)).toEqual([
      AgentSlots.promptStatus,
    ]);
    // The manifest says the spec's default; the header placement's component
    // goes in the title bar.
    const header = buildReactorFromPlugins([pluginManagerPlugin('header')]);
    await header.start();
    const output = header.getOutput(PLUGIN_MANAGER_PLUGIN_NAME) as {
      components: { slot: string }[];
    };
    expect(output.components.map(component => component.slot)).toEqual([
      AgentSlots.chatHeader,
    ]);
  });

  it('protects itself, the Agent’s panel and Reactor’s manager', () => {
    expect(PLUGIN_MANAGER_PROTECTED).toEqual([
      PLUGIN_MANAGER_PLUGIN_NAME,
      '@datalayer/agent-plugin-plugins-panel',
      '@datalayer/reactor-manager',
    ]);
  });
});

describe('the plugins manager’s button', () => {
  it('draws nothing where no platform runs', () => {
    const { container } = render(
      themed(<PluginManagerButton placement="footer" />),
    );
    expect(container.querySelector('[data-plugin-manager-open]')).toBeNull();
  });

  it('opens the page’s plugins in a dialog, toggles one off and on; Escape and its close button close it', async () => {
    const reactor = withPlatform([PluginManagerPlugin, DemoPlugin]);
    const disable = vi.spyOn(reactor, 'disable');
    const enable = vi.spyOn(reactor, 'enable');
    render(themed(<PluginManagerButton placement="footer" />));
    const button = screen.getByRole('button', {
      name: PLUGIN_MANAGER_WORDS.open,
    });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => button.click());
    const dialog = await screen.findByRole('dialog');
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby')!)
        ?.textContent,
    ).toBe(PLUGIN_MANAGER_WORDS.title);
    // Escape closes it, the focus back on the button.
    await within(dialog).findByRole('button', { name: 'Weather' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));

    act(() => button.click());
    const reopened = await screen.findByRole('dialog');
    // Reactor’s list: a row per plugin, a switch each.
    const weather = await within(reopened).findByRole('button', {
      name: 'Weather',
    });
    expect(weather.getAttribute('aria-pressed')).toBe('true');
    // Its own switch is fixed on.
    const own = within(reopened).getByRole('button', { name: 'Plugins' });
    expect(
      own.hasAttribute('disabled') ||
        own.getAttribute('aria-disabled') === 'true',
    ).toBe(true);

    act(() => weather.click());
    expect(disable).toHaveBeenCalledWith('@example/demo-weather');
    await waitFor(() =>
      expect(
        within(reopened)
          .getByRole('button', { name: 'Weather' })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    act(() =>
      within(reopened).getByRole('button', { name: 'Weather' }).click(),
    );
    expect(enable).toHaveBeenCalledWith('@example/demo-weather');
    await waitFor(() =>
      expect(
        within(reopened)
          .getByRole('button', { name: 'Weather' })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );

    // Its close button closes it too.
    act(() => within(reopened).getByRole('button', { name: 'Close' }).click());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});

describe('the plugins manager’s button beside the floating assistant (a click on datalayer.ai opened nothing, 22 November 2026)', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(ASSISTANT_CLEARANCE_VAR);
  });

  it('keeps its place under a press beside the assistant, and the click opens the dialog', async () => {
    withPlatform([PluginManagerPlugin, DemoPlugin]);
    const root = document.documentElement;
    const stageRef = React.createRef<HTMLDivElement>();
    render(
      themed(
        <>
          {/* The line under the prompt: the button at its live end, its
              right padding the assistant's clearance. */}
          <PromptStacks
            stacks={[
              {
                id: 'session-controls',
                clearsAssistant: true,
                content: <span>Model</span>,
                live: <PluginManagerButton placement="footer" />,
              },
            ]}
          />
          <AssistantStage
            character="paperclip"
            state="idle"
            place={{ right: '24px', bottom: '24px' }}
            size={88}
            stageRef={stageRef}
            onDragStart={() => {}}
            open={false}
            onToggle={() => {}}
            onDismiss={() => {}}
          />
        </>,
      ),
    );
    const stage = document.querySelector(
      '[data-assistant-state]',
    ) as HTMLElement;
    stage.getBoundingClientRect = () =>
      ({
        left: 1000,
        top: 600,
        right: 1088,
        bottom: 688,
        width: 88,
        height: 88,
        x: 1000,
        y: 600,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(root.style.getPropertyValue(ASSISTANT_CLEARANCE_VAR)).toBe('112px');
    const button = screen.getByRole('button', {
      name: PLUGIN_MANAGER_WORDS.open,
    });
    // The press, just beside the assistant: it steps aside, and the line's
    // padding, hence the button's place, stays as it was until the button
    // goes up. Dropped, the button moved from under the pointer and the
    // click went to the line.
    act(() => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 990,
          clientY: 620,
          buttons: 1,
        }),
      );
    });
    expect(stage.getAttribute('data-assistant-aside')).toBe('pointer');
    expect(root.style.getPropertyValue(ASSISTANT_CLEARANCE_VAR)).toBe('112px');
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('the plugins manager’s width (the user, 22 November 2026: "should show up larger - make sure width is configurable via props")', () => {
  async function openedWith(width?: string | number): Promise<HTMLElement> {
    withPlatform([PluginManagerPlugin, DemoPlugin]);
    render(
      themed(
        <PluginManagerButton
          placement="footer"
          {...(width === undefined ? {} : { width })}
        />,
      ),
    );
    act(() =>
      screen.getByRole('button', { name: PLUGIN_MANAGER_WORDS.open }).click(),
    );
    return screen.findByRole('dialog');
  }

  it('is Primer’s widest, xlarge (960px), unless said', async () => {
    expect(PLUGIN_MANAGER_DEFAULT_WIDTH).toBe('xlarge');
    const dialog = await openedWith();
    expect(dialog.getAttribute('data-width')).toBe('xlarge');
  });

  it('takes a named width', async () => {
    expect(pluginManagerDialogWidth('medium')).toEqual({ width: 'medium' });
    const dialog = await openedWith('large');
    expect(dialog.getAttribute('data-width')).toBe('large');
  });

  it('takes a CSS length, never wider than the window less 32px', () => {
    expect(pluginManagerDialogWidth('80vw')).toEqual({
      width: 'xlarge',
      sx: { width: '80vw', maxWidth: 'calc(100vw - 32px)' },
    });
    expect(pluginManagerDialogWidth(1100)).toEqual({
      width: 'xlarge',
      sx: { width: '1100px', maxWidth: 'calc(100vw - 32px)' },
    });
  });
});
