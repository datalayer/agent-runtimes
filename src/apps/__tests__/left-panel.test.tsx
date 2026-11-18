/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The left panel (`LoopSlots.leftPanel`): what a host says about the work on
 * the leading edge of the workspace — closed to start with, opened and
 * closed by a toggle that says what it controls, with nothing to show
 * (`panel.when`) no toggle and no panel; and the application the workspace
 * draws, said to the host's plugins (`LoopApplication`).
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
import { LoopApplication, LoopSlots } from '../core';
import {
  LeftPanel,
  LeftPanelToggle,
  leftPanelLabel,
  leftPanelShown,
  useLeftPanel,
  type LoopLeftPanelComponent,
} from '../shell/LeftPanel';
import { appExtension, applicationPlugin } from '../apps/AppRenderer';
import { agentAppspec } from '../Application';
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
const about: LoopLeftPanelComponent = {
  id: 'about',
  slot: LoopSlots.leftPanel,
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
    const bare: LoopLeftPanelComponent = {
      id: 'bare',
      slot: LoopSlots.leftPanel,
      Component: () => null,
    };
    expect(leftPanelShown([about, bare], presented())).toEqual([about, bare]);
    expect(leftPanelShown([about, bare], presented(''))).toEqual([bare]);
    expect(leftPanelShown([about], undefined)).toEqual([]);
    expect(leftPanelLabel([about], presented())).toBe('About the Marketer');
    expect(leftPanelLabel([bare], presented())).toBe('Panel');
  });

  it('is closed to start with, and its toggle opens and closes it', () => {
    mounted.length = 0;
    const app = presented('Plans and drafts.');
    const page = render([applicationPlugin(app, app), aboutPlugin]);
    const toggle = page.querySelector<HTMLButtonElement>(
      '[data-loop-left-panel-toggle]',
    )!;
    const panel = page.querySelector<HTMLElement>('[data-loop-left-panel]')!;
    expect(nameOf(toggle)).toBe('About the Marketer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-label')).toBe('About the Marketer');
    expect(panel.hasAttribute('data-open')).toBe(false);
    // Nothing of it is mounted before the first opening.
    expect(mounted).toEqual([]);
    expect(page.querySelector('[data-about]')).toBeNull();

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hasAttribute('data-open')).toBe(true);
    expect(page.querySelector('[data-about]')?.textContent).toBe(
      'Plans and drafts.',
    );

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('data-open')).toBe(false);
    // Kept mounted once opened: opening it again mounts nothing anew.
    act(() => toggle.click());
    expect(mounted).toEqual(['about']);
  });

  it('closes on Escape from inside it, the focus back on its toggle', () => {
    const app = presented();
    const page = render([applicationPlugin(app, app), aboutPlugin]);
    const toggle = page.querySelector<HTMLButtonElement>(
      '[data-loop-left-panel-toggle]',
    )!;
    const panel = page.querySelector<HTMLElement>('[data-loop-left-panel]')!;
    act(() => toggle.click());
    act(() => {
      panel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(panel.hasAttribute('data-open')).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });

  it('has no toggle and no panel when nothing has anything to show', () => {
    // An application that presents nothing.
    const silent = presented('');
    let page = render([applicationPlugin(silent, silent), aboutPlugin]);
    expect(page.querySelector('[data-loop-left-panel-toggle]')).toBeNull();
    expect(page.querySelector('[data-loop-left-panel]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    // A workspace nothing contributes a left panel to.
    const app = presented();
    page = render([applicationPlugin(app, app)]);
    expect(page.querySelector('[data-loop-left-panel-toggle]')).toBeNull();
    expect(page.querySelector('[data-loop-left-panel]')).toBeNull();
  });
});

describe('the application, said to its host’s plugins', () => {
  it('is contributed by its extension, in the words the person reads', () => {
    const app = presented('Its own words.');
    const shown = { ...app, name: 'Marketeur' };
    const reactor = buildReactorFromPlugins([appExtension(app, shown, [])]);
    reactor.start();
    const said = reactor.getContributions(LoopApplication);
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
