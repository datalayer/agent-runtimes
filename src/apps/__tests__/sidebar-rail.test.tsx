/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The rail (LOOP T-07) and a pane opening at the theme's pace (T-10): the
 * sidebar's panels as line icons, one shown at a time, every one kept
 * mounted; an application's rules, activity and computer naming themselves
 * on it; the pane's motion read from the theme's tokens, and none when
 * motion is reduced.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { ShieldCheckIcon } from '@primer/octicons-react';
import { LoopSlots } from '../core';
import {
  railChoiceAfter,
  railItemsOf,
  SidebarRail,
  type LoopSidebarComponent,
} from '../shell/SidebarRail';
import { paneOpenAnimation, paneOpening } from '../shell/paneMotion';
import { defineAppRulesPlugin } from '../plugins/app-rules';
import { defineAppActivityPlugin } from '../plugins/app-activity';
import { defineAppComputerPlugin } from '../plugins/app-computer';
import { APP_CATALOGUE } from '../../specs/apps';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

const mounted: string[] = [];
const panel = (id: string): LoopSidebarComponent => ({
  id,
  slot: LoopSlots.sidebar,
  Component: () => {
    React.useEffect(() => {
      mounted.push(id);
    }, []);
    return <p data-panel={id}>{id} panel</p>;
  },
  rail: { label: id[0].toUpperCase() + id.slice(1), icon: ShieldCheckIcon },
});

function render(components: LoopSidebarComponent[]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<SidebarRail components={components} props={{}} width={300} />);
  });
  return host;
}

describe('the rail', () => {
  it('names each panel by its rail, or by its id under a generic icon', () => {
    const items = railItemsOf([
      panel('rules'),
      { id: 'bare', slot: LoopSlots.sidebar, Component: () => null },
    ]);
    expect(items.map(item => item.label)).toEqual(['Rules', 'bare']);
    expect(items[0].icon).toBe(ShieldCheckIcon);
    expect(items[1].icon).toBeTruthy();
  });

  it('shows the clicked panel, and closes the column on the chosen one', () => {
    expect(railChoiceAfter('rules', 'activity')).toBe('activity');
    expect(railChoiceAfter('rules', 'rules')).toBeNull();
    expect(railChoiceAfter(null, 'rules')).toBe('rules');
  });

  it('opens on the first panel, keeps every panel mounted, one shown', () => {
    mounted.length = 0;
    const el = render([panel('rules'), panel('activity')]);
    const buttons = Array.from(
      el.querySelectorAll<HTMLButtonElement>('[data-loop-rail-item]'),
    );
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
      'Rules',
      'Activity',
    ]);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(mounted.sort()).toEqual(['activity', 'rules']);
    const region = (id: string) =>
      el.querySelector<HTMLElement>(`#loop-rail-panel-${id}`)!;
    expect(region('rules').hidden).toBe(false);
    expect(region('activity').hidden).toBe(true);

    act(() => buttons[1].click());
    expect(region('rules').hidden).toBe(true);
    expect(region('activity').hidden).toBe(false);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    // Switching mounted nothing again.
    expect(mounted).toHaveLength(2);

    // The chosen one again: the column closes, the rail stays.
    act(() => buttons[1].click());
    expect(el.querySelector('[data-loop-rail-panel]')).toBeNull();
    expect(el.querySelectorAll('[data-loop-rail-item]')).toHaveLength(2);
    expect(buttons.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(
      true,
    );
  });

  it("holds an application's rules, activity and computer, each with its line icon", () => {
    const app = APP_CATALOGUE['web-research'];
    const plugins = [
      defineAppRulesPlugin(app),
      defineAppActivityPlugin(app),
      defineAppComputerPlugin(app),
    ];
    const reactor = buildReactorFromPlugins(plugins);
    reactor.start();
    const rails = plugins.map(plugin => {
      const output = reactor.getOutput<{
        components?: LoopSidebarComponent[];
      }>((plugin as unknown as { name: string }).name);
      return output?.components?.find(c => c.slot === LoopSlots.sidebar)?.rail
        ?.label;
    });
    reactor.stop();
    expect(rails).toEqual(['Rules', 'Activity', 'Computer']);
  });
});

describe('a pane opening (T-10)', () => {
  it("moves by the theme's pane duration and easing, none when motion is reduced", () => {
    expect(paneOpenAnimation('right')).toBe(
      'loopPaneOpenRight var(--theme-motion-pane, 0ms) var(--theme-motion-easing, ease) both',
    );
    const styles = paneOpening('left');
    expect(styles.animation).toBe(paneOpenAnimation('left'));
    expect(styles['@keyframes loopPaneOpenLeft']).toEqual({
      from: { opacity: 0, transform: 'translateX(-12px)' },
      to: { opacity: 1, transform: 'none' },
    });
    expect(styles['@media (prefers-reduced-motion: reduce)']).toEqual({
      animation: 'none',
    });
  });
});
