/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A widget's page written in its code (LOOP P-05): `interface.page` read,
 * written and checked; its inputs drawn as one form at `/inputs`, its
 * outputs at `/outputs/<name>`; as an input changes, the page runs it in a
 * session of its own through the session API's `page` action and shows what
 * its code answered, in place, sending nothing to the conversation.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import type { AppPageSpec, AppSpec } from '../../types/agentspecs';
import { LoopChatTurn, type LoopWorkspaceContext } from '../core';
import { dumpAppspec, emptyAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec, pageProblems } from '../apps/checks';
import { createTurnFeed } from '../plugins/chat/turnState';
import { AppPage, PAGE_RUN_DELAY_MS } from '../plugins/app-page/AppPage';
import {
  appKindPaths,
  appPageAction,
  appPageInitialData,
  defaultAppSurface,
  LOOP_PAGE,
  openPageSession,
  outputsData,
  PAGE_ACTION,
  pageInputsOf,
  pageTurnOf,
  runPageIn,
} from '../plugins/app-page';
import { CANVAS_BLOCK_PLUGINS } from '../plugins/canvas-blocks';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE: AppPageSpec = {
  function: 'quote',
  inputs: {
    type: 'object',
    properties: {
      seats: {
        type: 'integer',
        title: 'Seats',
        minimum: 1,
        maximum: 1000,
        default: 10,
      },
      plan: {
        type: 'string',
        title: 'Plan',
        enum: ['Team', 'Business'],
        default: 'Team',
      },
    },
  },
  outputs: [
    { name: 'total', title: 'Total', component: 'Text', props: {} },
    {
      name: 'lines',
      title: '',
      component: 'Table',
      props: { columns: ['item', 'amount'] },
    },
  ],
  live: true,
};

function widget(page: AppPageSpec = PAGE, kind: AppSpec['kind'] = 'widget') {
  const app = emptyAppspec(kind);
  return {
    ...app,
    id: 'quote',
    name: 'Quote',
    agent: 'jupyter-data-analyst:0.0.1',
    interface: { ...app.interface, layout: 'page' as const, page },
  } as AppSpec;
}

describe('interface.page in the Appspec', () => {
  it('is read and written as written', () => {
    const app = widget({
      ...PAGE,
      inputsUi: { seats: { 'ui:widget': 'range' } },
    });
    const written = dumpAppspec(app);
    const page = (written.interface as Record<string, unknown>).page as Record<
      string,
      unknown
    >;
    expect(page.function).toBe('quote');
    expect(page.inputs_ui).toEqual({ seats: { 'ui:widget': 'range' } });
    expect(page.outputs).toEqual([
      { name: 'total', title: 'Total' },
      {
        name: 'lines',
        component: 'Table',
        props: { columns: ['item', 'amount'] },
      },
    ]);
    expect('live' in page).toBe(false);
    expect(parseAppspec(written).app.interface.page).toEqual(
      app.interface.page,
    );
    const still = dumpAppspec(widget({ ...PAGE, live: false }));
    expect(
      ((still.interface as Record<string, unknown>).page as { live: boolean })
        .live,
    ).toBe(false);
  });

  it('is refused as agentspecs refuses it, in sentences', () => {
    expect(pageProblems(widget())).toEqual([]);
    const outputs = (...items: AppPageSpec['outputs']) =>
      widget({ ...PAGE, outputs: items });
    expect(pageProblems(widget(PAGE, 'chat'))).toEqual([
      "A page of inputs and outputs is a widget's: a chat application has none. Remove `interface.page`, or make it a widget.",
    ]);
    expect(pageProblems(outputs())).toContain(
      'Its page shows one output at least.',
    );
    expect(
      pageProblems(
        outputs(PAGE.outputs[0], { ...PAGE.outputs[0], title: 'Again' }),
      ),
    ).toContain('Two outputs of its page have the same name.');
    expect(
      pageProblems(
        outputs({
          name: 'clip',
          title: '',
          component: 'Video' as never,
          props: {},
        }),
      )[0],
    ).toMatch(/an output is one of Text, Image, Table, Chart/);
    expect(
      pageProblems(
        outputs({ name: 'lines', title: '', component: 'Table', props: {} }),
      ),
    ).toEqual([
      'The output “lines” is a Table without columns: say it in its `props`.',
    ]);
    expect(
      pageProblems(
        outputs({
          name: 'total',
          title: '',
          component: 'Text',
          props: { text: 'x' },
        }),
      ),
    ).toEqual([
      'The output “total” says text in its `props`: its id is its name, and what it shows is its value.',
    ]);
    expect(
      pageProblems(
        widget({ ...PAGE, inputs: { type: 'object', properties: {} } }),
      ),
    ).toEqual([
      'The form “page inputs” asks for no named field: its schema is an object with properties.',
    ]);
    const both = widget();
    both.interface.settings = {
      type: 'object',
      properties: { plan: { type: 'string' } },
    };
    expect(pageProblems(both)).toEqual([
      '“plan” is both a setting and an input of its page: name one otherwise.',
    ]);
    expect(checkAppspec(dumpAppspec(widget(PAGE, 'chat'))).problems).toContain(
      "A page of inputs and outputs is a widget's: a chat application has none. Remove `interface.page`, or make it a widget.",
    );
  });
});

describe('what its page publishes, takes and does', () => {
  it('takes its inputs, publishes its outputs and runs it', () => {
    const paths = appKindPaths(widget());
    expect(paths.accepts.map(path => path.path)).toEqual(
      expect.arrayContaining(['/inputs/seats', '/inputs/plan']),
    );
    expect(
      paths.publishes.filter(path => path.path.startsWith('/outputs/')),
    ).toEqual([
      expect.objectContaining({ path: '/outputs/total', words: 'Total' }),
      expect.objectContaining({ path: '/outputs/lines', list: true }),
    ]);
    expect(paths.actions.map(action => action.name)).toContain(PAGE_ACTION);
    expect(appPageInitialData(widget())).toMatchObject({
      inputs: { seats: 10, plan: 'Team' },
      outputs: {},
    });
  });

  it('draws its inputs as one form, then each output from its path', () => {
    const app = widget();
    app.interface.settings = {
      type: 'object',
      properties: { tone: { type: 'string', title: 'Tone' } },
    };
    const nodes = defaultAppSurface(app);
    const form = nodes.find(node => node.id === 'inputs')!;
    expect(form).toMatchObject({
      component: 'Form',
      values: { path: '/inputs' },
    });
    expect(
      Object.keys((form.schema as { properties: object }).properties),
    ).toEqual(['tone', 'seats', 'plan']);
    expect(nodes.find(node => node.id === 'output-total')).toEqual({
      id: 'output-total',
      component: 'Text',
      text: { path: '/outputs/total' },
    });
    expect(nodes.find(node => node.id === 'output-lines')).toEqual({
      id: 'output-lines',
      component: 'Table',
      columns: ['item', 'amount'],
      rows: { path: '/outputs/lines' },
    });
    expect(nodes.some(node => node.id === 'run')).toBe(false);
    expect(nodes.some(node => node.id === 'run-page')).toBe(false);
    const run = defaultAppSurface(widget({ ...PAGE, live: false })).find(
      node => node.id === 'run-page',
    );
    expect(run?.action).toEqual({ event: { name: PAGE_ACTION } });
    expect(outputsData({ total: '1 €' })).toEqual({ '/outputs/total': '1 €' });
  });

  it('runs on its inputs, typed as its form says, when Run is pressed', () => {
    const app = widget({ ...PAGE, live: false });
    const held: Record<string, unknown> = {
      '/inputs': { seats: '3', plan: ['Business'], tone: 'x' },
    };
    expect(
      appPageAction(app, { name: PAGE_ACTION }, path => held[path]),
    ).toEqual({ runPage: { seats: 3, plan: 'Business' } });
    expect(pageInputsOf(app, { seats: '' })).toEqual({});
  });
});

const sse = (...events: unknown[]) =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');

describe('over the session API', () => {
  it('reads its outputs, or why there are none, from the stream', () => {
    expect(
      pageTurnOf(
        sse(
          { type: 'CUSTOM', name: 'loop.session', value: { uid: 's' } },
          { type: 'RUN_STARTED' },
          {
            type: 'CUSTOM',
            name: LOOP_PAGE,
            value: { inputs: { seats: 1 }, outputs: { total: '12 €' } },
          },
          { type: 'RUN_FINISHED' },
        ),
      ),
    ).toEqual({ inputs: { seats: 1 }, outputs: { total: '12 €' } });
    expect(
      pageTurnOf(sse({ type: 'RUN_ERROR', message: 'The turn failed: boom' })),
    ).toEqual({ refused: 'The turn failed: boom' });
    expect(pageTurnOf(sse({ type: 'RUN_FINISHED' }))).toEqual({
      refused: 'Its page showed nothing: its code answered no outputs.',
    });
  });

  it('opens a session, then sends its inputs as the page action', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (url.endsWith('/api/v1/apps/sessions')) {
        expect(body).toEqual({ agent: 'quote' });
        return new Response(
          sse({ type: 'CUSTOM', name: 'loop.session', value: { uid: 's-1' } }),
        );
      }
      expect(url).toBe('http://runtime/api/v1/apps/sessions/s-1/actions');
      if (body.payload.inputs.seats === 0) {
        return new Response(
          JSON.stringify({
            detail:
              "“Its page's inputs” was sent what its fields refuse: seats: 0 is less than the minimum of 1.",
          }),
          { status: 422 },
        );
      }
      expect(body).toEqual({ name: 'page', payload: { inputs: { seats: 2 } } });
      return new Response(
        sse({
          type: 'CUSTOM',
          name: LOOP_PAGE,
          value: { outputs: { total: '24 €' } },
        }),
      );
    });
    const context = {
      serverUrl: 'http://runtime/',
      agentId: 'quote',
      token: 't',
      fetcher: fetcher as unknown as typeof fetch,
    };
    const uid = await openPageSession(context);
    expect(uid).toBe('s-1');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer t',
    });
    expect(await runPageIn(context, uid, { seats: 2 })).toEqual({
      outputs: { total: '24 €' },
      inputs: {},
    });
    expect(await runPageIn(context, uid, { seats: 0 })).toEqual({
      refused:
        "“Its page's inputs” was sent what its fields refuse: seats: 0 is less than the minimum of 1.",
    });
  });
});

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the page drawn', () => {
  it('runs as its inputs change and shows its outputs in place, sending no message', async () => {
    vi.useFakeTimers();
    const ran: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/v1/apps/sessions')) {
          return new Response(
            sse({ type: 'CUSTOM', name: 'loop.session', value: { uid: 'p' } }),
          );
        }
        const inputs = JSON.parse(String(init?.body)).payload.inputs;
        ran.push(inputs);
        return new Response(
          sse({
            type: 'CUSTOM',
            name: LOOP_PAGE,
            value: {
              outputs: {
                total: `${Number(inputs.seats) * 12} €`,
                lines: [
                  { item: inputs.plan, amount: Number(inputs.seats) * 12 },
                ],
              },
            },
          }),
        );
      }),
    );
    const feed = createTurnFeed();
    const send = vi.fn();
    const plugin = definePlugin({
      name: 'test-chat-turn',
      contributes: [
        contribution(
          LoopChatTurn,
          { id: 'turn', turn: feed.turn, conversation: feed.conversation },
          { id: 'turn' },
        ),
      ],
    });
    const workspace = {
      serverUrl: 'http://runtime',
      agentId: 'quote',
      viewControls: { send },
      prompts: { submit: vi.fn() },
    } as unknown as LoopWorkspaceContext;
    const app = widget();
    function Harness() {
      const reactor = React.useMemo(
        () => buildReactorFromPlugins([plugin, ...CANVAS_BLOCK_PLUGINS]),
        [],
      );
      useReactor(reactor);
      return (
        <ThemeProvider>
          <AppPage app={app} workspace={workspace} />
        </ThemeProvider>
      );
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    await act(async () => root.render(<Harness />));
    await act(async () => undefined);
    // From the start: its inputs' defaults.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAGE_RUN_DELAY_MS + 10);
    });
    expect(ran).toEqual([{ seats: 10, plan: 'Team' }]);
    expect(container.textContent).toContain('120 €');
    // An input changed on the page: it runs again, the outputs change in place.
    const number = container.querySelector(
      'input[type="number"], input[id*="seats"]',
    ) as HTMLInputElement | null;
    expect(number).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      setter.call(number, '3');
      number!.dispatchEvent(new Event('input', { bubbles: true }));
      number!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAGE_RUN_DELAY_MS + 10);
    });
    expect(ran.at(-1)).toEqual({ seats: 3, plan: 'Team' });
    expect(container.textContent).toContain('36 €');
    expect(container.textContent).not.toContain('120 €');
    expect(send).not.toHaveBeenCalled();
  });
});
