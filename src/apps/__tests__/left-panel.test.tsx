/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The left panel (`AgentSlots.leftPanel`): what a host says about the work on
 * the leading edge of the workspace — closed to start with, opened by a
 * toggle that says what it controls and is there only while it is closed,
 * closed by one Close control (its component's own, else the shell's) or by
 * Escape, the focus moved in on opening and back to the toggle on closing;
 * with nothing to show (`panel.when`) no toggle and no panel; and the
 * application the workspace draws, said to the host's plugins
 * (`AgentApplication`).
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  definePlugin,
  type PluginRef,
} from '@datalayer/reactor';
import {
  registerReactor,
  type ReactorReactOutput,
} from '@datalayer/reactor/react';
import { AgentApplication, AgentSlots } from '../core';
import {
  LeftPanel,
  LeftPanelToggle,
  leftPanelLabel,
  leftPanelShown,
  useLeftPanel,
  type AgentLeftPanelComponent,
  type AgentLeftPanelProps,
} from '../shell/LeftPanel';
import { appExtension, applicationPlugin } from '../apps/AppRenderer';
import { agentAppspec } from '../AIApplication';
import { emptyAppspec, parseAppspec, dumpAppspec } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  registerReactor(null);
});

const presented = (presentation = 'What it is.'): AppSpec => {
  const app = emptyAppspec('chat');
  app.id = 'demo-marketer';
  app.name = 'Marketer';
  app.presentation = presentation;
  return app;
};

/** A button's accessible name: its label, or the tooltip that labels it (Primer's IconButton). */
const nameOf = (button: HTMLElement): string | null | undefined =>
  button.getAttribute('aria-label') ??
  document.getElementById(button.getAttribute('aria-labelledby') ?? '')
    ?.textContent;

const mounted: string[] = [];
const about: AgentLeftPanelComponent = {
  id: 'about',
  slot: AgentSlots.leftPanel,
  Component: ({ application }: { application?: AppSpec }) => {
    React.useEffect(() => {
      mounted.push('about');
    }, []);
    return <p data-about="">{application?.presentation}</p>;
  },
  panel: {
    label: application => `About the ${application?.name ?? 'application'}`,
    when: application => Boolean(application?.presentation),
  },
};

const aboutPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: 'test-about',
  build: () => ({ components: [about] }),
}) as PluginRef;

/** The shell's part: the toggle, the panel and a view beside it. */
function Shell(): React.JSX.Element {
  const panel = useLeftPanel();
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <LeftPanelToggle panel={panel} />
      <div ref={rowRef}>
        <LeftPanel panel={panel} rowRef={rowRef} props={{}} />
        <main>the view</main>
      </div>
    </div>
  );
}

function render(plugins: PluginRef[]) {
  const reactor = buildReactorFromPlugins(plugins);
  registerReactor(reactor);
  act(() => {
    reactor.start();
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Shell />);
  });
  return host;
}

describe('the left panel', () => {
  it('shows what has something to show for the application, named by the first', () => {
    const bare: AgentLeftPanelComponent = {
      id: 'bare',
      slot: AgentSlots.leftPanel,
      Component: () => null,
    };
    expect(leftPanelShown([about, bare], presented())).toEqual([about, bare]);
    expect(leftPanelShown([about, bare], presented(''))).toEqual([bare]);
    expect(leftPanelShown([about], undefined)).toEqual([]);
    expect(leftPanelLabel([about], presented())).toBe('About the Marketer');
    expect(leftPanelLabel([bare], presented())).toBe('Panel');
  });

  it('is closed to start with, its toggle opens it, and the toggle is gone while it is open', () => {
    mounted.length = 0;
    const app = presented('Plans and drafts.');
    const page = render([applicationPlugin(app, app), aboutPlugin]);
    const toggle = page.querySelector<HTMLButtonElement>(
      '[data-agent-left-panel-toggle]',
    )!;
    const panel = page.querySelector<HTMLElement>('[data-agent-left-panel]')!;
    expect(nameOf(toggle)).toBe('About the Marketer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-label')).toBe('About the Marketer');
    expect(panel.hasAttribute('data-open')).toBe(false);
    // Nothing of it is mounted before the first opening.
    expect(mounted).toEqual([]);
    expect(page.querySelector('[data-about]')).toBeNull();

    act(() => toggle.click());
    expect(panel.hasAttribute('data-open')).toBe(true);
    expect(page.querySelector('[data-about]')?.textContent).toBe(
      'Plans and drafts.',
    );
    // Open, the toggle is gone: the panel's Close control closes it, and
    // the focus has moved onto that control.
    expect(page.querySelector('[data-agent-left-panel-toggle]')).toBeNull();
    const close = page.querySelector<HTMLButtonElement>(
      '[data-agent-left-panel-close]',
    )!;
    expect(nameOf(close)).toBe('Close: About the Marketer');
    expect(document.activeElement).toBe(close);

    act(() => close.click());
    expect(panel.hasAttribute('data-open')).toBe(false);
    // The toggle shows back, the focus on it.
    const back = page.querySelector<HTMLButtonElement>(
      '[data-agent-left-panel-toggle]',
    )!;
    expect(back.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(back);
    // Kept mounted once opened: opening it again mounts nothing anew.
    act(() => back.click());
    expect(mounted).toEqual(['about']);
  });

  it('closes on Escape from inside it, the focus back on its toggle', () => {
    const app = presented();
    const page = render([applicationPlugin(app, app), aboutPlugin]);
    const panel = page.querySelector<HTMLElement>('[data-agent-left-panel]')!;
    act(() =>
      page
        .querySelector<HTMLButtonElement>('[data-agent-left-panel-toggle]')!
        .click(),
    );
    // The toggle is gone: the focus is inside the panel, where Escape is heard.
    expect(page.querySelector('[data-agent-left-panel-toggle]')).toBeNull();
    expect(panel.contains(document.activeElement)).toBe(true);
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(panel.hasAttribute('data-open')).toBe(false);
    expect(document.activeElement).toBe(
      page.querySelector('[data-agent-left-panel-toggle]'),
    );
  });

  it('hands its component the panel’s state; a component that closes it draws the one Close control', () => {
    const handed: Array<Pick<AgentLeftPanelProps, 'open' | 'panelId'>> = [];
    const closing: AgentLeftPanelComponent = {
      id: 'closing',
      slot: AgentSlots.leftPanel,
      Component: (props: Record<string, unknown>) => {
        const { open, close, toggle, panelId, application } =
          props as AgentLeftPanelProps;
        handed.push({ open, panelId });
        return (
          <div>
            <h2>{application?.name}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              data-agent-left-panel-close=""
              data-own-close=""
            />
            <button type="button" onClick={toggle} data-own-toggle="" />
          </div>
        );
      },
      panel: { label: 'About', closes: true },
    };
    const plugin = definePlugin<
      Record<string, never>,
      unknown,
      ReactorReactOutput
    >({
      name: 'test-closing',
      build: () => ({ components: [closing] }),
    }) as PluginRef;
    const app = presented();
    const page = render([applicationPlugin(app, app), plugin]);
    const panel = page.querySelector<HTMLElement>('[data-agent-left-panel]')!;
    act(() =>
      page
        .querySelector<HTMLButtonElement>('[data-agent-left-panel-toggle]')!
        .click(),
    );
    expect(handed.at(-1)).toEqual({ open: true, panelId: panel.id });
    // Its Close control is the only one, and the focus is on it.
    const own = page.querySelector<HTMLButtonElement>('[data-own-close]')!;
    expect(page.querySelectorAll('[data-agent-left-panel-close]')).toHaveLength(
      1,
    );
    expect(document.activeElement).toBe(own);

    act(() => own.click());
    expect(panel.hasAttribute('data-open')).toBe(false);
    expect(handed.at(-1)?.open).toBe(false);
    const toggle = page.querySelector<HTMLButtonElement>(
      '[data-agent-left-panel-toggle]',
    )!;
    expect(document.activeElement).toBe(toggle);

    // `toggle` opens it again, and closes it.
    act(() => toggle.click());
    act(() =>
      page.querySelector<HTMLButtonElement>('[data-own-toggle]')!.click(),
    );
    expect(panel.hasAttribute('data-open')).toBe(false);
  });

  it('has no toggle and no panel when nothing has anything to show', () => {
    // An application that presents nothing.
    const silent = presented('');
    let page = render([applicationPlugin(silent, silent), aboutPlugin]);
    expect(page.querySelector('[data-agent-left-panel-toggle]')).toBeNull();
    expect(page.querySelector('[data-agent-left-panel]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    // A workspace nothing contributes a left panel to.
    const app = presented();
    page = render([applicationPlugin(app, app)]);
    expect(page.querySelector('[data-agent-left-panel-toggle]')).toBeNull();
    expect(page.querySelector('[data-agent-left-panel]')).toBeNull();
  });
});

describe('the application, said to its host’s plugins', () => {
  it('is contributed by its extension, in the words the person reads', () => {
    const app = presented('Its own words.');
    const shown = { ...app, name: 'Marketeur' };
    const reactor = buildReactorFromPlugins([appExtension(app, shown, [])]);
    reactor.start();
    const said = reactor.getContributions(AgentApplication);
    expect(said).toHaveLength(1);
    expect(said[0].value.app).toBe(shown);
  });

  it('keeps its presentation through the Appspec’s reader and writer', () => {
    const app = presented('What it is.\n\n- Does this');
    const data = dumpAppspec(app);
    expect(data.presentation).toBe('What it is.\n\n- Does this');
    expect(parseAppspec(data).app.presentation).toBe(
      'What it is.\n\n- Does this',
    );
    // Unsaid, it is not written and not read.
    const silent = emptyAppspec('chat');
    expect('presentation' in dumpAppspec(silent)).toBe(false);
    expect(parseAppspec(dumpAppspec(silent)).app.presentation).toBeUndefined();
  });

  it('is its agent’s, for a person’s own agent', () => {
    const app = agentAppspec({
      id: 'worker-marketer',
      name: 'Marketer',
      description: 'Plans.',
      presentation: 'Plans.\n\n- Drafts',
    });
    expect(app.presentation).toBe('Plans.\n\n- Drafts');
    expect(
      agentAppspec({ id: 'x', name: 'X', description: 'Y' }).presentation,
    ).toBeUndefined();
  });
});
