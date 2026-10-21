/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The thread's menu entries as contributions (MH-F08): the
 * `loop.session.action` point, the chat's four entries in the preset, and
 * the menu drawn from the registry — what applies to the session as it
 * stands, by each entry's `when`; no *Resume* on an open thread.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import {
  LoopSessionAction,
  sessionActionsFor,
  type SessionActionContribution,
  type SessionFacts,
} from '../core';
import { ChatPlugin } from '../plugins/chat';
import { SessionActionsMenu } from '../plugins/chat/SessionActionsMenu';
import { CHAT_SESSION_ACTIONS } from '../plugins/chat/sessionActions';

const SESSION: SessionFacts = {
  uid: 'e67a52b2',
  state: 'open',
  turn: 'idle',
  held: true,
  agent: 'shield-mvp-claude-code',
  harness: 'claude-code',
  turns: 4,
  title: 'The refactor',
  archived: false,
  lineage: { forked_from: null, imported_from: null },
  runs_on: { kind: 'runtime', uid: '01m5' },
};

const mounted: {
  root: ReturnType<typeof createRoot>;
  container: HTMLElement;
}[] = [];

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

describe('the loop.session.action point', () => {
  it('holds the chat plugin’s four entries, in their order', async () => {
    // The chat plugin alone: the preset pulls the notebook's JupyterLab in,
    // which this runner cannot load (the other preset specs fail the same
    // way on a clean tree); the preset includes the chat plugin unchanged.
    const reactor = buildReactorFromPlugins([ChatPlugin]);
    await reactor.start();
    expect(
      reactor.getContributions(LoopSessionAction).map(entry => entry.value.id),
    ).toEqual(['switch-agent', 'clone-from-here', 'export', 'resume']);
    expect(CHAT_SESSION_ACTIONS.map(entry => entry.label)).toEqual([
      'Switch agent…',
      'Clone from here',
      'Export',
      'Resume',
    ]);
  });

  it('hides what does not apply: no Resume on an open thread, no swap mid-turn', () => {
    const entries = CHAT_SESSION_ACTIONS.map(value => ({ value }));
    const ids = (session: SessionFacts | undefined) =>
      sessionActionsFor(entries, session).map(entry => entry.id);
    expect(ids(SESSION)).toEqual(['switch-agent', 'clone-from-here', 'export']);
    expect(ids({ ...SESSION, turn: 'running' })).toEqual([
      'clone-from-here',
      'export',
    ]);
    expect(ids({ ...SESSION, state: 'paused', held: false })).toEqual([
      'clone-from-here',
      'export',
      'resume',
    ]);
    expect(ids({ ...SESSION, turns: 0 })).toEqual(['switch-agent']);
    expect(ids({ ...SESSION, state: 'ended' })).toEqual([
      'clone-from-here',
      'export',
    ]);
    expect(ids(undefined)).toEqual([]);
  });

  it('draws contributed entries from the registry and a host’s beside them', async () => {
    const studio: SessionActionContribution = {
      id: 'open-in-studio',
      label: 'Open in the Studio',
      order: 90,
      when: session => session.held,
      run: () => undefined,
    };
    const HostPlugin = definePlugin({
      name: '@test/host-session-action',
      contributes: [
        contribution(LoopSessionAction, studio, { id: studio.id, order: 90 }),
      ],
    });
    const reactor = buildReactorFromPlugins([ChatPlugin, HostPlugin]);
    await reactor.start();
    const said: string[] = [];
    const describe = vi.fn(async () => ({
      ...SESSION,
      state: 'paused' as const,
    }));
    const client = {
      resume: vi.fn(async () => undefined),
    } as unknown as React.ComponentProps<
      typeof SessionActionsMenu
    >['context']['client'];
    function Harness() {
      useReactor(reactor);
      return (
        <ThemeProvider>
          <SessionActionsMenu
            uid={SESSION.uid}
            describe={describe}
            context={{ client, say: sentence => said.push(sentence) }}
          />
        </ThemeProvider>
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () => root.render(<Harness />));
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-actions"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    await act(async () => undefined);
    expect(describe).toHaveBeenCalledWith(SESSION.uid);
    const drawn = Array.from(
      document.querySelectorAll<HTMLElement>('[data-session-action]'),
    ).map(item => item.dataset.sessionAction);
    // A paused session: no Switch agent; Resume, and the host's entry.
    expect(drawn).toEqual([
      'clone-from-here',
      'export',
      'resume',
      'open-in-studio',
    ]);
    const resume = document.querySelector<HTMLElement>(
      '[data-session-action="resume"]',
    );
    await act(async () => resume!.click());
    await act(async () => undefined);
    expect(client.resume).toHaveBeenCalledWith(
      SESSION.uid,
      SESSION.agent,
      expect.anything(),
    );
    expect(said).toEqual(['Resumed e67a52b2.']);
  });

  it('draws nothing for a thread that is no session', async () => {
    const reactor = buildReactorFromPlugins([ChatPlugin]);
    await reactor.start();
    function Harness() {
      useReactor(reactor);
      return (
        <SessionActionsMenu
          uid={undefined}
          describe={async () => SESSION}
          context={{ client: {} as never, say: () => undefined }}
        />
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () => root.render(<Harness />));
    expect(
      container.querySelector('[data-testid="session-actions"]'),
    ).toBeNull();
  });
});
