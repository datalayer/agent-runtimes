/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's page (LOOP R-01, R-01b): a chat, a widget or a worker
 * draws its A2UI surface beside its conversation, publishes what the
 * conversation says to it by path, and answers its buttons through the chat.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { basicCatalog } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { APP_CATALOGUE } from '../../specs/apps';
import type { AppSpec } from '../../types/agentspecs';
import { LoopEditorView } from '../core';
import { emptyAppspec } from '../apps/appspec';
import { loopPlugins } from '../presets';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import {
  APP_KIND_PATHS,
  APP_PAGE_SURFACE,
  appKindPaths,
  appPageAction,
  appPageData,
  appPageInitialData,
  appPageMessages,
  defaultAppSurface,
  defineAppPagePlugin,
  givenFiles,
  hasAppPage,
  inputsInWords,
  MAX_FILE_BYTES,
  settingsOf,
} from '../plugins/app-page';
import {
  InlineSurface,
  type InlineSurfaceModel,
} from '../plugins/a2ui-surface/InlineSurface';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** An application of a kind, with an agent and the settings given. */
function appOf(
  kind: AppSpec['kind'],
  overrides: Partial<AppSpec['interface']> = {},
): AppSpec {
  const app = emptyAppspec(kind);
  return {
    ...app,
    id: `a-${kind}`,
    name: `A ${kind}`,
    agent: 'example-simple:0.0.1',
    goal: kind === 'worker' ? 'Keep the inbox sorted.' : '',
    interface: { ...app.interface, ...overrides },
  };
}

const SETTINGS: AppSpec['interface']['settings'] = [
  {
    id: 'product',
    type: 'select',
    label: 'Product',
    options: ['Cloud', 'Desktop'],
    default: 'Cloud',
  },
  { id: 'short', type: 'toggle', label: 'Short answers', options: [] },
];

/** Every path a value-bound or text-bound component reads, in a tree. */
const boundPaths = (components: Array<Record<string, unknown>>) =>
  components.flatMap(component =>
    ['text', 'value']
      .map(key => component[key])
      .filter(
        (bound): bound is { path: string } =>
          typeof bound === 'object' && bound !== null && 'path' in bound,
      )
      .map(bound => bound.path),
  );

describe('what each kind gives its page', () => {
  it('lists, per kind, what it publishes, takes and does, in words', () => {
    for (const [kind, paths] of Object.entries(APP_KIND_PATHS)) {
      expect(paths.publishes.length, kind).toBeGreaterThan(0);
      expect(paths.actions.length, kind).toBeGreaterThan(0);
      for (const entry of [...paths.publishes, ...paths.accepts]) {
        expect(entry.path, kind).toMatch(/^\//);
        expect(entry.words, entry.path).not.toBe('');
      }
      for (const action of paths.actions) {
        expect(action.words, action.name).not.toBe('');
        for (const key of action.context) {
          expect(action.asks[key], `${action.name}.${key}`).toBeTruthy();
        }
      }
    }
    expect(APP_KIND_PATHS.chat.publishes.map(entry => entry.path)).toEqual([
      '/app',
      '/question',
      '/answer',
      '/status',
      '/messages',
    ]);
    expect(APP_KIND_PATHS.widget.actions.map(action => action.name)).toEqual([
      'run',
      'upload',
      'stop',
    ]);
    expect(APP_KIND_PATHS.widget.accepts.map(entry => entry.path)).toEqual([
      '/files',
    ]);
  });

  it('adds each setting at /inputs/<id> for a chat and a widget, not a worker', () => {
    const chat = appKindPaths(appOf('chat', { settings: SETTINGS }));
    expect(chat.accepts.map(entry => entry.path)).toEqual([
      '/draft',
      '/inputs/product',
      '/inputs/short',
    ]);
    expect(chat.publishes.at(-1)?.words).toBe('Short answers');
    const worker = appKindPaths(appOf('worker', { settings: SETTINGS }));
    expect(worker.accepts.map(entry => entry.path)).toEqual(['/draft']);
  });

  it('gives a decision nothing: its page is the Studio’s run page', () => {
    const decision = appKindPaths(appOf('decision'));
    expect(decision).toEqual({
      publishes: [],
      accepts: [],
      actions: [],
      inputs: false,
    });
  });
});

describe("the catalogue's pages", () => {
  /** Every absolute `{path}` a block binds, at any depth. */
  const pathsOf = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap(pathsOf)
      : value && typeof value === 'object'
        ? [
            ...(typeof (value as { path?: unknown }).path === 'string' &&
            Object.keys(value).length === 1
              ? [(value as { path: string }).path]
              : []),
            ...Object.values(value).flatMap(pathsOf),
          ].filter(path => path.startsWith('/'))
        : [];

  it('bind only what their kind publishes and takes', () => {
    const surfaced = Object.values(APP_CATALOGUE).filter(
      app => hasAppPage(app) && app.interface.surface,
    );
    expect(surfaced.map(app => app.id)).toContain('quote-calculator');
    for (const app of surfaced) {
      const paths = appKindPaths(app);
      const known = new Set(
        [...paths.publishes, ...paths.accepts].map(entry => entry.path),
      );
      const handled = new Set(paths.actions.map(action => action.name));
      for (const node of app.interface.surface!.components) {
        for (const path of pathsOf(node)) {
          expect(known.has(path), `${app.id}: ${node.id} binds ${path}`).toBe(
            true,
          );
        }
        const event = (node.action as { event?: { name?: string } })?.event;
        if (event?.name) {
          expect(handled.has(event.name), `${app.id}: ${node.id}`).toBe(true);
        }
      }
    }
  });
});

describe('which applications have a page', () => {
  it('is a chat, a widget or a worker with a page or split layout', () => {
    expect(hasAppPage(APP_CATALOGUE['web-research'])).toBe(false);
    expect(hasAppPage(APP_CATALOGUE['quote-calculator'])).toBe(true);
    expect(hasAppPage(APP_CATALOGUE['inbox-triage'])).toBe(true);
    expect(hasAppPage(APP_CATALOGUE['ship-or-fix'])).toBe(false);
    const composed = appOf('chat', {
      surface: {
        protocol: 'a2ui/v0.9',
        components: [{ id: 'root', component: 'Text', text: 'Hi' }],
        composedBy: 'developer',
        composedAt: '',
      },
    });
    // A chat layout is the conversation alone, a surface composed or not.
    expect(hasAppPage(composed)).toBe(false);
    expect(
      hasAppPage({
        ...composed,
        interface: { ...composed.interface, layout: 'page' },
      }),
    ).toBe(true);
  });

  it('is contributed as the editor beside the chat, which opens on it alone', () => {
    const plugin = defineAppPagePlugin(APP_CATALOGUE['quote-calculator']);
    const editors = (plugin.contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopEditorView,
    ) as Array<{ value: { surfaceId: string; title: string } }>;
    expect(editors.map(item => item.value.surfaceId)).toEqual([
      APP_PAGE_SURFACE,
    ]);
    expect(editors[0].value.title).toBe('Quote Calculator');
    // The preset honours the editor asked for with the notebook and the
    // document off, and offers no strip to swap it.
    const reactor = buildReactorFromPlugins(
      loopPlugins({ editors: false, defaultEditor: APP_PAGE_SURFACE }),
    );
    const chat = reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME);
    expect(chat?.defaultSurface).toBe(APP_PAGE_SURFACE);
    expect(chat?.showSurfaceSelector).toBe(false);
    const alone = buildReactorFromPlugins(loopPlugins({ editors: false }));
    expect(
      alone.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.defaultSurface,
    ).toBe('none');
  });
});

describe('what the conversation publishes', () => {
  const turn = {
    id: 2,
    user: 'How do I reset my password?',
    assistant: 'From the settings page.',
    status: 'streaming' as const,
    activity: 'Searching the documentation…',
  };

  const conversation = [
    { role: 'user' as const, text: 'How do I reset my password?' },
    { role: 'assistant' as const, text: 'From the settings page.' },
  ];

  it('gives a chat the question, the answer, where it stands and the conversation', () => {
    expect(appPageData(appOf('chat'), turn, conversation)).toEqual({
      '/app': 'A chat',
      '/status': 'Answering',
      '/question': 'How do I reset my password?',
      '/answer': 'From the settings page.',
      '/messages': conversation,
    });
  });

  it('gives a widget its output, a worker its goal, activity and report', () => {
    expect(appPageData(appOf('widget'), turn, conversation)['/output']).toBe(
      'From the settings page.',
    );
    expect(appPageData(appOf('worker'), turn, conversation)).toMatchObject({
      '/goal': 'Keep the inbox sorted.',
      '/activity': 'Searching the documentation…',
      '/report': 'From the settings page.',
    });
    expect(
      appPageData(appOf('worker'), { id: 0, status: 'idle' }, []),
    ).toMatchObject({ '/status': 'Ready', '/activity': '', '/report': '' });
  });

  it('starts the page with every setting as its input holds it, and a draft', () => {
    expect(
      appPageInitialData(appOf('chat', { settings: SETTINGS })),
    ).toMatchObject({
      app: 'A chat',
      inputs: { product: ['Cloud'], short: false },
      draft: '',
    });
    expect(appPageInitialData(appOf('widget'))).not.toHaveProperty('draft');
    expect(appPageInitialData(appOf('widget')).files).toEqual([]);
    expect(appPageInitialData(appOf('chat'))).not.toHaveProperty('files');
  });
});

describe('what a button does', () => {
  const data = (values: Record<string, unknown>) => (path: string) =>
    values[path];

  it('sends a chat’s draft, its settings with it only when they changed', () => {
    const chat = appOf('chat', { settings: SETTINGS });
    const inputs = { product: ['Desktop'], short: true };
    const first = appPageAction(
      chat,
      { name: 'send' },
      data({ '/draft': ' Hello ', '/inputs': inputs }),
    );
    // What the page did goes with it to the session (R-04): the button,
    // and the settings as the session takes them.
    const loop = {
      action: { name: 'send', payload: {} },
      settings: { product: 'Desktop', short: true },
    };
    expect(first).toEqual({
      send: 'Hello\n\nProduct: Desktop\nShort answers: yes',
      inputs: 'Product: Desktop\nShort answers: yes',
      clear: ['/draft'],
      loop,
    });
    const again = appPageAction(
      chat,
      { name: 'send', context: { message: 'And then?' } },
      data({ '/draft': '', '/inputs': inputs }),
      'Product: Desktop\nShort answers: yes',
    );
    expect(again).toEqual({
      send: 'And then?',
      inputs: 'Product: Desktop\nShort answers: yes',
      clear: [],
      loop,
    });
    expect(appPageAction(chat, { name: 'send' }, data({}))).toEqual({
      refused: 'Nothing to send: write a message first.',
    });
  });

  it('runs a widget on every input written, by label or by id', () => {
    const quote = APP_CATALOGUE['quote-calculator'];
    const outcome = appPageAction(
      quote,
      { name: 'run' },
      data({ '/inputs': { seats: 50, plan: ['Team'], term: ['Annual'] } }),
    );
    expect(outcome).toEqual({
      send: 'Seats: 50\nPlan: Team\nTerm: Annual',
      inputs: 'Seats: 50\nPlan: Team\nTerm: Annual',
      clear: [],
      loop: {
        action: { name: 'run', payload: {} },
        settings: settingsOf(quote, {
          seats: 50,
          plan: ['Team'],
          term: ['Annual'],
        }),
      },
    });
    expect(appPageAction(quote, { name: 'run' }, data({}))).toEqual({
      refused: 'Quote Calculator has no inputs to run on: set one first.',
    });
    expect(
      inputsInWords(appOf('widget', { settings: SETTINGS }), {
        product: [],
        short: false,
      }),
    ).toBe('Short answers: no');
  });

  const csv = 'region,orders\nNorth,12\nSouth,7\n';
  const given = (name: string, type: string, text: string) => ({
    name,
    type,
    size: text.length,
    data_url: `data:${type};base64,${btoa(text)}`,
  });

  it('runs a widget on the files given, which go to its session', () => {
    const report = APP_CATALOGUE['report-from-a-file'];
    const inputs = { report: ['Summary'], question: '' };
    const files = [given('orders.csv', 'text/csv', csv)];
    const run = appPageAction(
      report,
      { name: 'run' },
      data({ '/inputs': inputs, '/files': files }),
    );
    // The file is not read here: the session puts it where the application
    // reads it, or refuses it in a sentence (LOOP R-04).
    expect(run).toEqual({
      send: 'Report: Summary',
      inputs: 'Report: Summary',
      clear: [],
      loop: {
        action: { name: 'run', payload: {} },
        files,
        settings: { report: 'Summary', question: '' },
      },
    });
    // A File upload's own action: the files in its context, else at /files.
    expect(
      appPageAction(
        report,
        { name: 'upload', context: { files } },
        data({ '/inputs': inputs }),
      ),
    ).toEqual({
      ...run,
      loop: {
        ...(run as { loop: object }).loop,
        action: { name: 'upload', payload: {} },
      },
    });
    expect(
      appPageAction(report, { name: 'upload' }, data({ '/files': files })),
    ).toMatchObject({ loop: { files } });
    expect(
      appPageAction(
        report,
        { name: 'upload', context: { files: [] } },
        data({ '/inputs': inputs }),
      ),
    ).toEqual({ refused: 'No file was given: choose one first.' });
    // A widget with no inputs is run on the files themselves, whatever they are.
    const pdf = given('contract.pdf', 'application/pdf', '%PDF');
    expect(
      appPageAction(
        appOf('widget'),
        { name: 'upload', context: { files: [pdf] } },
        data({}),
      ),
    ).toMatchObject({ send: 'Run on contract.pdf.', loop: { files: [pdf] } });
  });

  it('refuses what is not a file, or a file larger than a session takes, in a sentence', () => {
    const widget = appOf('widget');
    const refusedFor = (files: unknown) =>
      appPageAction(widget, { name: 'upload', context: { files } }, data({}));
    expect(refusedFor([{ name: 'x.csv' }])).toEqual({
      refused:
        'File 1 is not a file as File upload gives it ({name, type, size, data_url}).',
    });
    expect(refusedFor('orders.csv')).toEqual({
      refused: 'What was given as files is not a list of files.',
    });
    expect(
      refusedFor([
        {
          ...given('big.bin', 'application/octet-stream', 'x'),
          size: MAX_FILE_BYTES + 1,
        },
      ]),
    ).toEqual({
      refused: `big.bin is ${(MAX_FILE_BYTES + 1).toLocaleString('en')} bytes: a session takes files of at most ${MAX_FILE_BYTES.toLocaleString('en')}.`,
    });
    expect(givenFiles(undefined)).toEqual({ files: [] });
  });

  it('gives the session the settings as it takes them', () => {
    const app = appOf('widget', {
      settings: [
        ...SETTINGS,
        { id: 'count', type: 'number', label: 'Count', options: [] },
        { id: 'note', type: 'text', label: 'Note', options: [] },
      ],
    });
    expect(
      settingsOf(app, { product: ['Desktop'], short: 0, count: '3', note: 7 }),
    ).toEqual({ product: 'Desktop', short: false, count: 3, note: '7' });
    // Nothing chosen, nothing written: not said.
    expect(settingsOf(app, { product: [], count: '' })).toEqual({});
  });

  it('stops, starts over, and refuses what the kind does not do', () => {
    const chat = appOf('chat');
    expect(appPageAction(chat, { name: 'stop' }, data({}))).toEqual({
      stop: true,
    });
    expect(appPageAction(chat, { name: 'new' }, data({}))).toEqual({
      newChat: true,
    });
    expect(appPageAction(appOf('worker'), { name: 'run' }, data({}))).toEqual({
      refused: '“run” is not something A worker does: it does send, stop.',
    });
    expect(
      appPageAction(appOf('decision'), { name: 'save' }, data({})),
    ).toEqual({ refused: 'A decision handles no button.' });
  });
});

describe('the page drawn', () => {
  it('is, without a surface composed, the default page of the kind, whole', () => {
    for (const kind of ['chat', 'widget', 'worker'] as const) {
      const app = appOf(kind, { settings: SETTINGS });
      const components = defaultAppSurface(app);
      const ids = new Set(components.map(component => component.id));
      expect(components[0].id).toBe('root');
      for (const component of components) {
        const refs = [
          ...(Array.isArray(component.children) ? component.children : []),
          ...(typeof component.child === 'string' ? [component.child] : []),
        ];
        for (const ref of refs) {
          expect(ids.has(ref), `${kind}: ${ref}`).toBe(true);
        }
      }
      // It reads only what its kind publishes or takes.
      const known = new Set(
        [...appKindPaths(app).publishes, ...appKindPaths(app).accepts].map(
          entry => entry.path,
        ),
      );
      for (const path of boundPaths(components)) {
        expect(known.has(path), `${kind}: ${path}`).toBe(true);
      }
    }
  });

  it('is processed by the A2UI renderer, composed or default', () => {
    for (const app of [
      APP_CATALOGUE['inbox-triage'],
      appOf('widget', { settings: SETTINGS }),
      appOf('chat', { layout: 'page', settings: SETTINGS }),
    ]) {
      const processor = new MessageProcessor([basicCatalog]);
      expect(() =>
        processor.processMessages(
          appPageMessages(app, basicCatalog.id) as A2uiMessage[],
        ),
      ).not.toThrow();
      const surface = processor.model.getSurface('app');
      expect(surface?.dataModel.get('/app'), app.id).toBe(app.name);
    }
  });

  it('says a tree the catalog refuses where it would have been drawn', async () => {
    const app = appOf('widget', {
      surface: {
        protocol: 'a2ui/v0.9',
        components: [
          { id: 'root', component: 'Column', children: ['plan'] },
          // Options are {label, value} in A2UI v0.9, not words.
          {
            id: 'plan',
            component: 'ChoicePicker',
            options: ['Team'],
            value: { path: '/inputs/plan' },
          },
        ],
        composedBy: 'developer',
        composedAt: '',
      },
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <InlineSurface
          messages={appPageMessages(app, basicCatalog.id) as A2uiMessage[]}
          onAction={() => undefined}
        />,
      ),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /^This surface could not be drawn: .*ChoicePicker/,
    );
    await act(async () => root.unmount());
  });

  it('publishes into the drawn surface and hands a button its surface', async () => {
    const app = appOf('widget', { settings: SETTINGS });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const actions: Array<{ name: string; surface?: InlineSurfaceModel }> = [];
    const onAction = vi.fn(
      (action: { name: string }, surface?: InlineSurfaceModel) =>
        actions.push({ name: action.name, surface }),
    );
    const messages = appPageMessages(app, basicCatalog.id) as A2uiMessage[];
    const render = (output: string) =>
      root.render(
        <InlineSurface
          messages={messages}
          data={appPageData(
            app,
            { id: 1, status: 'done', assistant: output },
            [],
          )}
          onAction={onAction}
        />,
      );
    await act(async () => render('First'));
    await act(async () => render('The total is 1,200.'));
    expect(container.textContent).toContain('The total is 1,200.');
    expect(container.textContent).toContain('Answered');
    const run = [...container.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Run'),
    );
    expect(run).toBeTruthy();
    await act(async () => run!.click());
    expect(actions.map(action => action.name)).toEqual(['run']);
    // What a block wrote is read from the surface the button is on.
    expect(actions[0].surface?.dataModel.get('/inputs/product')).toEqual([
      'Cloud',
    ]);
    await act(async () => root.unmount());
    container.remove();
  });
});
