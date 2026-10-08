/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's computer beside its page (LOOP R-23, R-01b): a plugin of
 * the workspace's sidebar, mounted by the preset with the rules card and the
 * activity feed. It says which of its parts are off, says that no browser
 * runs, lists what its agent ran on it from the conversation's tool calls,
 * shows its files read-only to download, and takes it over and hands it
 * back through the runtime's computer routes — read through a stubbed
 * `fetch`.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  signal,
} from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import { iamStore } from '@datalayer/core/lib/state/substates/IAMState';
import { appPreset, defineAppPlugin } from '../apps/AppRenderer';
import {
  COMPUTER_WORDS,
  computerParts,
  computerUrl,
  outputOf,
  parentOf,
  partOf,
  terminalEntries,
} from '../apps/computer';
import {
  LoopAgentBlueprint,
  LoopChatTurn,
  LoopSlots,
  type ChatTurnSnapshot,
  type ConversationEntry,
  type LoopWorkspaceContext,
} from '../core';
import { AppComputer } from '../plugins/app-computer';
import { ENGLISH_CHAT_WORDS } from '../../chat/words';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const app = (
  computer: Partial<AppSpec['permissions']['computer']>,
): AppSpec => {
  const base = APP_CATALOGUE['web-research'];
  return {
    ...base,
    permissions: {
      ...base.permissions,
      computer: { browse: false, files: false, shell: false, ...computer },
    },
  };
};

const CONVERSATION: ConversationEntry[] = [
  { role: 'user', text: 'Sum the column' },
  {
    role: 'tool',
    name: 'execute_code',
    args: { code: 'print(1 + 2)' },
    result: '3',
  },
  { role: 'tool', name: 'tavily_search', args: { query: 'x' }, result: 'y' },
  {
    role: 'tool',
    name: 'read_computer_file',
    args: { path: 'files/s1/a.csv' },
  },
  { role: 'assistant', text: 'It is 3.' },
  { role: 'tool', name: 'execute_code', args: {}, result: 'again' },
];

const workspace = {
  serverUrl: 'http://runtime.test',
  agentId: 'web-research',
  sandbox: { state: 'running' },
} as unknown as LoopWorkspaceContext;

const mounted: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }
  iamStore.setState({ token: undefined } as never);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function InReactor({
  children,
  conversation,
}: {
  children: React.ReactNode;
  conversation: ConversationEntry[];
}) {
  const reactor = React.useMemo(
    () =>
      buildReactorFromPlugins([
        definePlugin({
          name: 'test-chat-turn',
          contributes: [
            contribution(
              LoopChatTurn,
              {
                id: 'turn',
                turn: signal<ChatTurnSnapshot>({ id: 1, status: 'done' }),
                conversation: signal(conversation),
              },
              { id: 'turn' },
            ),
          ],
        }),
      ]),
    [conversation],
  );
  useReactor(reactor);
  return <>{children}</>;
}

async function render(
  element: React.ReactElement,
  conversation: ConversationEntry[] = [],
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  await act(async () =>
    root.render(<InReactor conversation={conversation}>{element}</InReactor>),
  );
  for (let i = 0; i < 6; i += 1) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  }
  return { container, root };
}

type Route = (url: string, init?: RequestInit) => unknown;

function runtime(routes: Record<string, Route>) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const tail = url.replace(
        'http://runtime.test/api/v1/apps/agents/web-research/computer',
        '',
      );
      const key = `${init?.method ?? 'GET'} ${tail.split('?')[0]}`;
      const route = routes[key];
      if (!route) {
        return new Response(JSON.stringify({ detail: `No ${key}` }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify(route(url, init)), { status: 200 });
    }),
  );
  return calls;
}

const state = (held: unknown = null, yours = false) => ({
  agent: 'web-research',
  app: 'web-research',
  parts: { browse: false, files: true, shell: true },
  browser: false,
  started: true,
  held,
  yours,
});

describe('the computer, as words', () => {
  it('reads its parts from the Appspec, each off unless turned on', () => {
    expect(computerParts(app({ files: true }))).toEqual({
      browse: false,
      files: true,
      shell: false,
    });
    expect(partOf('execute_code')).toBe('shell');
    expect(partOf('write_computer_file')).toBe('files');
    expect(partOf('tavily_search')).toBeUndefined();
    expect(parentOf('files/s1')).toBe('files');
    expect(parentOf('files')).toBe('.');
    expect(
      computerUrl({ serverUrl: 'http://r/', agentId: 'a b' }, '/files'),
    ).toBe('http://r/api/v1/apps/agents/a%20b/computer/files');
  });

  it('shows what code printed, and its error, not the envelope it came in', () => {
    const ran = {
      success: true,
      stdout: '1\n4\n',
      output: '1\n4\n',
      stderr: '',
      error: null,
      execution_ok: true,
    };
    expect(outputOf(ran)).toBe('1\n4\n');
    expect(outputOf(JSON.stringify(ran))).toBe('1\n4\n');
    expect(outputOf({ stdout: '', stderr: '', error: 'NameError: x' })).toBe(
      'NameError: x',
    );
    expect(outputOf({ stdout: '' })).toBe('');
    expect(outputOf('Written: a.txt (5 bytes).')).toBe(
      'Written: a.txt (5 bytes).',
    );
    expect(outputOf({ path: 'a' })).toBe('{\n  "path": "a"\n}');
    expect(outputOf('x'.repeat(5000))).toContain('1,000 characters more');
  });

  it('lists what its agent ran on it, from the tool calls of its computer only', () => {
    expect(terminalEntries(CONVERSATION)).toEqual([
      {
        tool: 'execute_code',
        part: 'shell',
        command: 'print(1 + 2)',
        output: '3',
      },
      {
        tool: 'read_computer_file',
        part: 'files',
        command: 'files/s1/a.csv',
        output: undefined,
      },
      { tool: 'execute_code', part: 'shell', command: '', output: 'again' },
    ]);
  });
});

describe('its agent, created on a runtime', () => {
  it('runs code through Codemode only when its shell is on', () => {
    const codemode = (spec: AppSpec) =>
      (
        (defineAppPlugin(spec).contributes ?? []).find(
          (item: { point?: unknown }) => item.point === LoopAgentBlueprint,
        ) as { value: { createPayload: Record<string, unknown> } }
      ).value.createPayload.enable_codemode;
    expect(codemode(app({ files: true }))).toBe(false);
    expect(codemode(app({ shell: true }))).toBe(true);
  });
});

describe('the preset, asked for the sidebar', () => {
  it('mounts the computer in the sidebar slot, and not unless asked', async () => {
    const name = '@datalayer/loop-plugin-app-computer-web-research';
    const preset = appPreset(app({ shell: true }), { sidebar: true });
    expect(preset.plugins.map(plugin => plugin.name)).toContain(name);
    const reactor = buildReactorFromPlugins(preset.plugins);
    await reactor.start();
    const components =
      reactor.getOutput<{
        components?: Array<{ id: string; slot: string }>;
      }>(name)?.components ?? [];
    expect(components.map(each => [each.id, each.slot])).toEqual([
      ['app-computer', LoopSlots.sidebar],
    ]);
    expect(
      appPreset(app({ shell: true })).plugins.some(plugin =>
        plugin.name.includes('app-computer'),
      ),
    ).toBe(false);
  });
});

describe('the computer view', () => {
  it('says there is no computer when every part is off, and asks nothing', async () => {
    const calls = runtime({});
    const { container } = await render(
      <AppComputer app={app({})} workspace={workspace} />,
    );
    expect(container.textContent).toContain(COMPUTER_WORDS.none);
    expect(calls).toHaveLength(0);
  });

  it('shows its parts, no browser, what ran, and its files to download', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    const calls = runtime({
      'GET ': () => state(),
      'GET /files': url =>
        url.includes('path=files')
          ? {
              entries: [
                {
                  name: 'a.csv',
                  path: 'files/a.csv',
                  type: 'file',
                  size: 1234,
                  modified: 0,
                },
              ],
            }
          : {
              entries: [
                {
                  name: 'files',
                  path: 'files',
                  type: 'directory',
                  size: 0,
                  modified: 0,
                },
              ],
            },
      'GET /file': () => 'a,b',
    });
    const created: string[] = [];
    URL.createObjectURL = vi.fn(() => {
      created.push('blob:1');
      return 'blob:1';
    });
    URL.revokeObjectURL = vi.fn();
    const saved = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { container } = await render(
      <AppComputer
        app={app({ files: true, shell: true })}
        workspace={workspace}
      />,
      CONVERSATION,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Browse: off');
    expect(text).toContain('Shell: on');
    expect(text).toContain(COMPUTER_WORDS.offSaid(['browse']));
    expect(text).toContain(COMPUTER_WORDS.noBrowser);
    expect(text).toContain('$ execute_code: print(1 + 2)');
    expect(text).not.toContain('tavily_search');
    expect(text).toContain(COMPUTER_WORDS.agentHas);
    // Its person's token goes with every call.
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt',
    );
    const button = (label: string) =>
      [...container.querySelectorAll('button')].find(
        each => each.textContent === label,
      )!;
    await act(async () => button('files/').click());
    for (let i = 0; i < 4; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    }
    expect(container.textContent).toContain('a.csv');
    expect(container.textContent).toContain('1,234 bytes');
    await act(async () => button(COMPUTER_WORDS.download).click());
    for (let i = 0; i < 4; i += 1) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    }
    expect(calls.map(([url]) => url)).toContain(
      'http://runtime.test/api/v1/apps/agents/web-research/computer/file?path=files%2Fa.csv',
    );
    expect(created).toEqual(['blob:1']);
    expect(saved).toHaveBeenCalledTimes(1);
    saved.mockRestore();
  });

  it('takes it over, runs the person’s code, and hands it back', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    let held: unknown = null;
    const calls = runtime({
      'GET ': () => state(held, held !== null),
      'GET /files': () => ({ entries: [] }),
      'POST /take-over': () => {
        held = { kind: 'person', uid: 'ada', since: 1 };
        return { held, interrupted: true };
      },
      'POST /run': () => ({ stdout: '42\n', stderr: '', error: '' }),
      'POST /hand-back': () => {
        held = null;
        return { held: null };
      },
    });
    const { container } = await render(
      <AppComputer app={app({ shell: true })} workspace={workspace} />,
    );
    const button = (label: string) =>
      [...container.querySelectorAll('button')].find(
        each => each.textContent === label,
      )!;
    const settle = async () => {
      for (let i = 0; i < 4; i += 1) {
        await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
      }
    };
    await act(async () => button(COMPUTER_WORDS.takeOver).click());
    await settle();
    expect(container.textContent).toContain(COMPUTER_WORDS.youHave);
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!;
      setter.call(textarea, 'print(6 * 7)');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(COMPUTER_WORDS.run).click());
    await settle();
    expect(container.textContent).toContain('>>> print(6 * 7)');
    expect(container.textContent).toContain('42');
    const run = calls.find(([url]) => url.endsWith('/run'));
    expect(JSON.parse(String(run?.[1]?.body))).toEqual({
      code: 'print(6 * 7)',
    });
    await act(async () => button(COMPUTER_WORDS.handBack).click());
    await settle();
    expect(container.textContent).toContain(COMPUTER_WORDS.agentHas);
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('says somebody else has it, and offers nothing to do', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    runtime({
      'GET ': () => state({ kind: 'person', uid: 'bob', since: 1 }, false),
      'GET /files': () => ({ entries: [] }),
    });
    const { container } = await render(
      <AppComputer app={app({ files: true })} workspace={workspace} />,
    );
    expect(container.textContent).toContain(COMPUTER_WORDS.someoneHas);
    const labels = [...container.querySelectorAll('button')].map(
      each => each.textContent,
    );
    expect(labels).not.toContain(COMPUTER_WORDS.takeOver);
    expect(labels).not.toContain(COMPUTER_WORDS.handBack);
  });

  it('says the runtime’s refusal in its sentence', async () => {
    iamStore.setState({ token: 'jwt' } as never);
    runtime({});
    const { container } = await render(
      <AppComputer app={app({ shell: true })} workspace={workspace} />,
    );
    expect(container.textContent).toContain('No GET ');
  });

  it('asks nothing and says why while no runtime is assigned (P-24)', async () => {
    const calls = runtime({});
    const reason = 'No runtime available. At capacity.';
    const { container } = await render(
      <AppComputer
        app={app({ shell: true })}
        workspace={
          {
            ...workspace,
            serverUrl: 'http://localhost:3063',
            sandbox: {
              state: 'error',
              target: 'datalayer',
              errorReason: reason,
            },
          } as LoopWorkspaceContext
        }
      />,
    );
    expect(container.textContent).toContain(
      ENGLISH_CHAT_WORDS.noRuntime(reason),
    );
    expect(calls).toHaveLength(0);
  });
});
