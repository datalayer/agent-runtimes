/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a builder reads beside an application's page (LOOP R-01b): its rules
 * and the approvals waiting for the person (`app-rules`, U-19), and what it
 * did (`app-activity`, R-15), as plugins of the workspace's sidebar — mounted
 * by the preset when the host asks (`sidebar`), and drawn in the sidebar
 * slot.
 *
 * The tool-approvals hooks (the ai-agents `/ws` path) are stood in for; the
 * record is read through a stubbed `fetch`.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';
import { coreStore } from '@datalayer/core/lib/state/substates/CoreState';
import { appPreset } from '../apps/AppRenderer';
import { coverOf, BEHAVIOUR_WORDS } from '../apps/rules';
import { entryOf, sessionSentence } from '../apps/records';
import { SAVE_TOOL, SAVE_WORDS, draftOfApproval } from '../apps/saved';
import { LoopSlots } from '../core';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seen = vi.hoisted(() => ({
  filters: [] as unknown[],
  approved: [] as string[],
  rejected: [] as string[],
  waiting: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../hooks/useToolApprovals', () => ({
  useToolApprovalsQuery: (filters: unknown) => {
    seen.filters.push(filters);
    return { data: { approvals: seen.waiting, total: seen.waiting.length } };
  },
  useApproveToolRequest: () => ({
    isPending: false,
    connectionState: 'connected',
    mutate: ({ id }: { id: string }) => seen.approved.push(id),
  }),
  useRejectToolRequest: () => ({
    isPending: false,
    connectionState: 'connected',
    mutate: ({ id }: { id: string }) => seen.rejected.push(id),
  }),
}));

import { AppRulesCard, APP_RULES_WORDS } from '../plugins/app-rules';
import { AppActivity, APP_ACTIVITY_WORDS } from '../plugins/app-activity';

const names = (plugins: unknown[]) =>
  plugins.map(ref => (ref as { name: string }).name);

const app = (): AppSpec => ({
  ...APP_CATALOGUE['web-research'],
  rules: [
    {
      action: 'Email a customer',
      appliesTo: ['send', 'gmail.send_message'],
      behaviour: 'ask_first',
    },
  ],
});

afterEach(() => {
  iamStore.setState({ token: undefined } as never);
  seen.filters.length = 0;
  seen.approved.length = 0;
  seen.rejected.length = 0;
  seen.waiting.length = 0;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** Drawn in a workspace with no chat: a turn that never starts. */
function InReactor({ children }: { children: React.ReactNode }) {
  const reactor = React.useMemo(() => buildReactorFromPlugins([]), []);
  useReactor(reactor);
  return <>{children}</>;
}

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<InReactor>{element}</InReactor>));
  for (let i = 0; i < 5; i += 1) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  }
  return { container, root };
}

describe('the preset, asked for the sidebar', () => {
  it('mounts the rules and approvals card and the activity feed, in the sidebar slot', async () => {
    const preset = appPreset(app(), { sidebar: true, appUid: 'app-1' });
    expect(names(preset.plugins)).toEqual(
      expect.arrayContaining([
        '@datalayer/loop-plugin-app-rules-web-research',
        '@datalayer/loop-plugin-app-activity-web-research',
      ]),
    );
    const reactor = buildReactorFromPlugins(preset.plugins);
    await reactor.start();
    const slots = [
      '@datalayer/loop-plugin-app-rules-web-research',
      '@datalayer/loop-plugin-app-activity-web-research',
    ]
      .flatMap(
        name =>
          reactor.getOutput<{
            components?: Array<{ id: string; slot: string }>;
          }>(name)?.components ?? [],
      )
      .filter(component => component.slot === LoopSlots.sidebar)
      .map(component => component.id);
    expect(slots).toEqual(['app-rules', 'app-activity']);
  });

  it('mounts neither unless asked', () => {
    expect(
      names(appPreset(app()).plugins).some(name =>
        /app-rules|app-activity/.test(name),
      ),
    ).toBe(false);
  });
});

describe('the rules and approvals card', () => {
  it('says each rule in words, and what it does with no rule', async () => {
    const { container } = await render(<AppRulesCard app={app()} />);
    expect(container.textContent).toContain('Email a customer');
    expect(container.textContent).toContain(BEHAVIOUR_WORDS.ask_first.says);
    expect(container.textContent).toContain('Send, send_message (gmail)');
    expect(container.textContent).toContain(APP_RULES_WORDS.byDefault);
    // Signed out: the approvals are not read, and it says where they go.
    expect(container.textContent).toContain(APP_RULES_WORDS.signedOut);
    expect(seen.filters).toHaveLength(0);
  });

  it('lists the approvals its agent waits on, and answers them over the approvals path', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    seen.waiting.push(
      {
        id: 'appr-1',
        agent_id: 'web-research',
        tool_name: 'send_message',
        tool_args: { _rule: 'Email a customer: ask me first.' },
        status: 'pending',
      },
      // A Gate of its deployment's agent, marked as its own.
      {
        id: 'appr-2',
        agent_id: 'web-research-dep-1',
        tool_name: 'publish_page',
        tool_args: { _check: 'A review is asked.', _app: 'web-research' },
        status: 'pending',
      },
      // Another application's: not here.
      {
        id: 'appr-3',
        agent_id: 'desk',
        tool_name: 'delete_file',
        tool_args: { _rule: 'Delete: ask me first.', _app: 'desk' },
        status: 'pending',
      },
    );
    const { container } = await render(<AppRulesCard app={app()} />);
    expect(seen.filters.at(-1)).toEqual({ status: 'pending' });
    expect(container.textContent).toContain('send_message');
    expect(container.textContent).toContain('Email a customer: ask me first.');
    expect(container.textContent).toContain('A review is asked.');
    expect(container.textContent).not.toContain('delete_file');
    const button = (label: string) =>
      [...container.querySelectorAll('button')].find(
        each => each.textContent === label,
      )!;
    await act(async () => button(APP_RULES_WORDS.approve).click());
    await act(async () => button(APP_RULES_WORDS.reject).click());
    expect(seen.approved).toEqual(['appr-1']);
    expect(seen.rejected).toEqual(['appr-1']);
  });

  it('shows a result it wants to keep whole, with Approve and save and Decline (R-24)', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    seen.waiting.push({
      id: 'appr-9',
      agent_id: 'web-research',
      tool_name: SAVE_TOOL,
      tool_args: {
        title: 'Weekly digest',
        content: '## This week\n\n- Three releases',
        space: 'sp-notes',
        _rule: 'It wants to keep this as a page of your Space.',
      },
      status: 'pending',
    });
    const { container } = await render(<AppRulesCard app={app()} />);
    const draft = container.querySelector('[data-testid="app-draft"]')!;
    expect(draft.textContent).toContain(SAVE_WORDS.where('sp-notes'));
    expect(draft.textContent).toContain('Weekly digest');
    expect(draft.querySelector('pre')!.textContent).toBe(
      '## This week\n\n- Three releases',
    );
    const labels = [...container.querySelectorAll('button')].map(
      each => each.textContent,
    );
    expect(labels).toEqual([SAVE_WORDS.approve, SAVE_WORDS.decline]);
    expect(
      draftOfApproval({ tool_name: 'send_message', tool_args: {} }),
    ).toBeNull();
  });

  it('says when nothing waits', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const { container } = await render(<AppRulesCard app={app()} />);
    expect(container.textContent).toContain(APP_RULES_WORDS.nothingWaiting);
  });
});

describe('the activity feed', () => {
  it('reads the sessions of its record, newest first, each opened on what it did', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    coreStore.setState({
      configuration: {
        ...coreStore.getState().configuration,
        aiAgentsUrl: 'https://ai.example',
      },
    } as never);
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        const body = url.includes('/sessions?')
          ? {
              sessions: [
                {
                  uid: 'e1',
                  session_uid: 's1',
                  kind: 'session',
                  version: 3,
                  created_at: '2026-10-05T08:00:00Z',
                },
              ],
            }
          : {
              entries: [
                {
                  uid: 'e2',
                  session_uid: 's1',
                  kind: 'tool_call',
                  summary: 'Searched the web',
                },
                {
                  uid: 'e3',
                  session_uid: 's1',
                  kind: 'output',
                  summary: 'Three sources',
                },
                // A run's start is a mark, not a step (R-15).
                {
                  uid: 'e4',
                  session_uid: 's1',
                  kind: 'run',
                  summary: 'Web Research is working',
                },
              ],
            };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const { container } = await render(<AppActivity appUid="app-1" />);
    expect(calls[0][0]).toBe(
      // Real use: the sessions its tests ran are read apart (R-07).
      'https://ai.example/api/ai-agents/v1/apps/sessions?app_uid=app-1&limit=20&tests=false',
    );
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt',
    );
    expect(container.textContent).toContain('version 3');
    const details = container.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    for (let i = 0; i < 5; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    }
    expect(calls[1][0]).toBe(
      'https://ai.example/api/ai-agents/v1/apps/records?session_uid=s1&limit=500',
    );
    expect(container.textContent).toContain('Searched the web');
    expect(container.textContent).toContain('1 tool call, 1 answer.');
    expect(container.textContent).not.toContain('is working');
  });

  it('says it is recorded once saved, and is its owner’s to read', async () => {
    const one = await render(<AppActivity />);
    expect(one.container.textContent).toContain(APP_ACTIVITY_WORDS.unsaved);
    const two = await render(<AppActivity appUid="app-1" />);
    expect(two.container.textContent).toContain(APP_ACTIVITY_WORDS.signedOut);
  });
});

describe('in words', () => {
  it('says what a rule covers, a class or a tool by its name', () => {
    expect(coverOf('publish')).toBe('Share or publish');
    expect(coverOf('tavily.tavily_search')).toBe('tavily_search (tavily)');
  });

  it('says a session in a sentence', () => {
    const entries = [
      { uid: '1', kind: 'tool_call' },
      { uid: '2', kind: 'check' },
      { uid: '3', kind: 'output', summary: 'Stopped: by you' },
    ].map(entryOf);
    expect(sessionSentence(entries)).toBe(
      '1 tool call, 1 step a check did not let pass, stopped.',
    );
  });
});
