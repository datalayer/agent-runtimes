/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The thread's menu entries as contributions (MH-F08): the
 * `loop.session.action` point, the chat's five entries in the preset, and
 * the menu drawn from the registry — what applies to the session as it
 * stands, by each entry's `when`; no *Resume* on an open thread. On a
 * turn's row, *Clone from here* names the turn (MH-10); the header says the
 * state words and where the session comes from, the picker shows the
 * sentence before a swap is sent, `?session=` opens a session (MH-27).
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
import {
  SessionActionsMenu,
  SessionStateLine,
  TurnActions,
} from '../plugins/chat/SessionActionsMenu';
import {
  agentChoices,
  CHAT_SESSION_ACTIONS,
  IMPORT,
  redactionsOf,
  SESSION_ACTION_WORDS,
  swapSentence,
} from '../plugins/chat/sessionActions';
import { SessionChooseDialog } from '../plugins/chat/SessionChooseDialog';
import {
  SESSION_RULES,
  SESSION_RULES_ACTION_WORDS,
} from '../plugins/app-rules/sessionRulesAction';
import { SessionRules } from '../plugins/app-rules/AppRulesCard';
import { sessionOfSearch } from '../apps/threads';
import { sessionRowOf } from '../../portable/activity';

/** The session as the runtime describes it, read through the one reader every client uses. */
const SESSION: SessionFacts = sessionRowOf({
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
});

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
  it('holds the chat plugin’s six entries, in their order', async () => {
    // The chat plugin alone: the preset pulls the notebook's JupyterLab in,
    // which this runner cannot load (the other preset specs fail the same
    // way on a clean tree); the preset includes the chat plugin unchanged.
    const reactor = buildReactorFromPlugins([ChatPlugin]);
    await reactor.start();
    expect(
      reactor.getContributions(LoopSessionAction).map(entry => entry.value.id),
    ).toEqual([
      'switch-agent',
      'clone-from-here',
      'session-rules',
      'export',
      'import',
      'resume',
    ]);
    expect(CHAT_SESSION_ACTIONS.map(entry => entry.label)).toEqual([
      'Switch agent…',
      'Clone from here',
      'Rules for this session…',
      'Export',
      'Import…',
      'Resume',
    ]);
  });

  it('shows the session’s Rules card over the thread, on any open session (SH-54)', () => {
    const shown: { title: string; render: () => unknown }[] = [];
    const said: string[] = [];
    const client = {
      serverUrl: 'https://r1.example/agent-runtimes/pool/01m5',
      accessToken: () => 'a-token',
    } as never;
    expect(SESSION_RULES.when(SESSION)).toBe(true);
    expect(SESSION_RULES.when({ ...SESSION, state: 'paused' })).toBe(false);
    SESSION_RULES.run(SESSION, {
      client,
      say: sentence => said.push(sentence),
      show: panel => shown.push(panel),
    });
    expect(said).toEqual([]);
    expect(shown.map(panel => panel.title)).toEqual(['Rules for this session']);
    const drawn = shown[0].render() as React.ReactElement<{
      agentServerUrl: string;
      token: string;
      sessionUid: string;
    }>;
    expect(drawn.type).toBe(SessionRules);
    expect(drawn.props).toEqual({
      agentServerUrl: 'https://r1.example/agent-runtimes/pool/01m5',
      token: 'a-token',
      sessionUid: SESSION.uid,
    });
    // No panel on the page, or no token: said, nothing shown.
    SESSION_RULES.run(SESSION, {
      client,
      say: sentence => said.push(sentence),
    });
    SESSION_RULES.run(SESSION, {
      client: { serverUrl: 'x', accessToken: () => undefined } as never,
      say: sentence => said.push(sentence),
      show: panel => shown.push(panel),
    });
    expect(said).toEqual([
      SESSION_RULES_ACTION_WORDS.noPanel,
      SESSION_RULES_ACTION_WORDS.signedOut,
    ]);
    expect(shown).toHaveLength(1);
  });

  it('hides what does not apply: no Resume on an open thread, no swap mid-turn', () => {
    const entries = CHAT_SESSION_ACTIONS.map(value => ({ value }));
    const ids = (session: SessionFacts | undefined) =>
      sessionActionsFor(entries, session).map(entry => entry.id);
    expect(ids(SESSION)).toEqual([
      'switch-agent',
      'clone-from-here',
      'session-rules',
      'export',
      'import',
    ]);
    // A rule is added while a turn runs too: that is when it matters (SH-54).
    expect(ids({ ...SESSION, turn: 'running' })).toEqual([
      'clone-from-here',
      'session-rules',
      'export',
      'import',
    ]);
    expect(ids({ ...SESSION, state: 'paused', held: false })).toEqual([
      'clone-from-here',
      'export',
      'import',
      'resume',
    ]);
    expect(ids({ ...SESSION, turns: 0 })).toEqual([
      'switch-agent',
      'session-rules',
      'import',
    ]);
    expect(ids({ ...SESSION, state: 'ended' })).toEqual([
      'clone-from-here',
      'export',
      'import',
    ]);
    expect(ids(undefined)).toEqual([]);
    // On a turn's row, Clone from here alone (MH-10).
    expect(
      sessionActionsFor(entries, SESSION, 'turn').map(entry => entry.id),
    ).toEqual(['clone-from-here']);
    expect(
      sessionActionsFor(entries, { ...SESSION, turns: 0 }, 'turn'),
    ).toEqual([]);
  });

  it('offers the catalogue’s harness agents to switch to, and shows the sentence before it is sent', () => {
    const choices = agentChoices(SESSION);
    expect(choices.length).toBeGreaterThan(1);
    // The session's own agent is not offered; each choice names its harness.
    expect(choices.some(choice => choice.id === SESSION.agent)).toBe(false);
    expect(choices.every(choice => /\(.+\)$/.test(choice.label))).toBe(true);
    const codex = choices.find(choice => /Codex/.test(choice.label));
    expect(codex).toBeDefined();
    expect(swapSentence(SESSION, codex!)).toMatch(
      /^This conversation was with Claude Code until turn 4; from here it is with .+\. What was said stays\.$/,
    );
    // A model agent on no harness is named by its id.
    expect(
      swapSentence({ agent: 'desk', harness: '', turns: 1 }, codex!),
    ).toMatch(/^This conversation was with desk until turn 1;/);
  });

  it('counts a file’s redactions from its session line, and names the deep link’s session', () => {
    expect(
      redactionsOf(
        '{"record_type":"session","format":"datalayer-session/1","redactions":2}\n{"record_type":"entry"}',
      ),
    ).toBe(2);
    expect(redactionsOf('not json')).toBe(0);
    expect(sessionOfSearch('?session=e67a52b2&x=1')).toBe('e67a52b2');
    expect(sessionOfSearch('?x=1')).toBe('');
    expect(() => sessionOfSearch('?session=no')).toThrow(/names no session/);
  });

  it('imports a file through the page’s picker and opens the new session, or says the page has none', async () => {
    const said: string[] = [];
    const opened: string[] = [];
    const client = {
      importFile: vi.fn(async () => ({
        uid: '7d2c4b10',
        turns: 4,
        redactions: 2,
      })),
    } as unknown as React.ComponentProps<
      typeof SessionActionsMenu
    >['context']['client'];
    await IMPORT.run(SESSION, {
      client,
      say: sentence => said.push(sentence),
      openThread: uid => opened.push(uid),
      pickFile: async () => '{"record_type":"session"}\n',
    });
    expect(client.importFile).toHaveBeenCalledWith(
      '{"record_type":"session"}\n',
    );
    expect(said).toEqual([SESSION_ACTION_WORDS.imported('7d2c4b10', 4, 2)]);
    expect(opened).toEqual(['7d2c4b10']);
    await IMPORT.run(SESSION, { client, say: sentence => said.push(sentence) });
    expect(said[1]).toBe(SESSION_ACTION_WORDS.noFilePicker);
  });

  it('says the state words and where the session comes from, and clones from a turn’s row', async () => {
    const reactor = buildReactorFromPlugins([ChatPlugin]);
    await reactor.start();
    const cloned = sessionRowOf({
      uid: 'c1a9f0e3',
      state: 'paused',
      turn: 'idle',
      held: false,
      agent: 'shield-mvp-claude-code',
      harness: 'claude-code',
      turns: 2,
      lineage: {
        forked_from: { uid: 'e67a52b2', at_turn: 2 },
        imported_from: null,
      },
      runs_on: null,
    });
    const said: string[] = [];
    const opened: string[] = [];
    const client = {
      clone: vi.fn(async () => ({
        uid: 'c1a9f0e3',
        state: 'paused',
        turns: 2,
      })),
    } as unknown as React.ComponentProps<
      typeof SessionActionsMenu
    >['context']['client'];
    function Harness() {
      useReactor(reactor);
      return (
        <ThemeProvider>
          <SessionStateLine facts={cloned} />
          <SessionStateLine facts={{ ...SESSION, turn: 'running' }} />
          <TurnActions
            facts={SESSION}
            turn={2}
            context={{
              client,
              say: sentence => said.push(sentence),
              openThread: uid => opened.push(uid),
            }}
          />
          <TurnActions
            facts={SESSION}
            turn={0}
            context={{ client, say: () => undefined }}
          />
        </ThemeProvider>
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () => root.render(<Harness />));
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>('[data-session-state]'),
    );
    expect(lines.map(line => line.textContent)).toEqual([
      'PausedCloned from e67a52b2 at turn 2',
      'Open · answering',
    ]);
    // One row of actions: the turn's; none for a row that is no turn.
    const rows = container.querySelectorAll('[data-turn-actions]');
    expect(rows).toHaveLength(1);
    const clone = container.querySelector<HTMLElement>(
      '[data-turn-action="clone-from-here"]',
    );
    await act(async () => clone!.click());
    await act(async () => undefined);
    expect(client.clone).toHaveBeenCalledWith(SESSION.uid, { upToTurn: 2 });
    expect(said).toEqual([SESSION_ACTION_WORDS.cloned(2, 'c1a9f0e3')]);
    expect(opened).toEqual(['c1a9f0e3']);
  });

  it('draws the picker with the sentence of the pick, and answers the pick or the decline', async () => {
    // Primer's Dialog measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const picks: Array<string | undefined> = [];
    const question = {
      title: 'Switch shield-mvp-claude-code to',
      options: [
        { id: 'a', label: 'A (Codex)' },
        { id: 'b', label: 'B (Goose)' },
      ],
      says: async (id: string) => `From here it is with ${id}.`,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () =>
      root.render(
        <ThemeProvider>
          <SessionChooseDialog
            question={question}
            onPick={pick => picks.push(pick)}
          />
        </ThemeProvider>,
      ),
    );
    await act(async () => undefined);
    expect(
      document.querySelector('[data-session-choose-says]')?.textContent,
    ).toBe('From here it is with a.');
    const select = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      select!.value = 'b';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => undefined);
    expect(
      document.querySelector('[data-session-choose-says]')?.textContent,
    ).toBe('From here it is with b.');
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button'),
    );
    const confirm = buttons.find(button => button.textContent === 'Switch');
    await act(async () => confirm!.click());
    expect(picks).toEqual(['b']);
  });

  it('shows an entry’s panel in a dialog of its own when the host gives none (SH-54)', async () => {
    const panelled: SessionActionContribution = {
      id: 'a-panel',
      label: 'A panel',
      order: 95,
      when: () => true,
      run: (_session, context) =>
        context.show?.({
          title: 'The panel',
          render: () => <p data-panel-body="">drawn</p>,
        }),
    };
    const HostPlugin = definePlugin({
      name: '@test/host-panel',
      contributes: [
        contribution(LoopSessionAction, panelled, {
          id: panelled.id,
          order: 95,
        }),
      ],
    });
    const reactor = buildReactorFromPlugins([ChatPlugin, HostPlugin]);
    await reactor.start();
    function Harness() {
      useReactor(reactor);
      return (
        <ThemeProvider>
          <SessionActionsMenu
            uid={SESSION.uid}
            describe={async () => SESSION}
            context={{ client: {} as never, say: () => undefined }}
          />
        </ThemeProvider>
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () => root.render(<Harness />));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="session-actions"]')!
        .click(),
    );
    await act(async () => undefined);
    const entry = document.querySelector<HTMLElement>(
      '[data-session-action="a-panel"]',
    );
    expect(entry).not.toBeNull();
    await act(async () => entry!.click());
    await act(async () => undefined);
    expect(
      document.querySelector('[data-session-panel] [data-panel-body]')
        ?.textContent,
    ).toBe('drawn');
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
    // A paused session: no Switch agent; Import, Resume, and the host's entry.
    expect(drawn).toEqual([
      'clone-from-here',
      'export',
      'import',
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
    // Drawn again from the runtime, which holds it now.
    expect(client.resume).toHaveBeenCalledTimes(1);
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
