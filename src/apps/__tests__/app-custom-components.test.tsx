/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Components a developer writes (LOOP P-17): declared in the Appspec,
 * reviewed as agentspecs reviews them, listed with the catalog for that
 * application alone, contributed by its own plugin, and drawn in a sandboxed
 * frame of no origin — its module fetched without credentials and checked
 * against its hash, what it sends refused unless declared.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import {
  CUSTOM_FRAME_SANDBOX,
  catalogOfBlocks,
  catalogWithOwn,
  customFrameDocument,
  customFramePolicy,
  customImplementation,
  customModule,
  fromFrame,
  integrityHolds,
} from '../../components/a2ui';
import { listComponents } from '../../specs/uiPlugins';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import {
  appComponents,
  customComponentProblems,
} from '../apps/customComponents';
import { appPreset } from '../apps/AppRenderer';
import { LoopA2uiComponent } from '../core/a2uiComponents';
import { LoopCanvasBlock } from '../core/canvasBlocks';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../plugins/a2ui-surface/InlineSurface';
import {
  appComponentsPluginName,
  defineAppComponentsPlugin,
} from '../plugins/app-components';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GAUGE = {
  name: 'Gauge',
  description: 'A dial, from nothing to its most.',
  props: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      most: { type: 'number', default: 100 },
    },
    required: ['label'],
  },
  shows: ['value'],
  sends: ['chosen'],
  source: 'https://elements.example.com/gauge.js',
};

const BASE = {
  schema: 'loop.app/v1',
  id: 'desk',
  name: 'Desk',
  kind: 'chat',
  agent: 'cog-crawler:0.0.1',
};

const declared = (changes: Record<string, unknown> = {}) =>
  parseAppspec({
    ...BASE,
    interface: { custom_components: [{ ...GAUGE, ...changes }] },
  }).app.interface.customComponents![0];

describe('a component its developer wrote, reviewed', () => {
  it('is read and written as the spec says it', () => {
    const { app } = parseAppspec({
      ...BASE,
      interface: { custom_components: [GAUGE] },
    });
    const gauge = app.interface.customComponents![0];
    expect(gauge).toMatchObject({ name: 'Gauge', height: 240, integrity: '' });
    expect(dumpAppspec(app).interface).toEqual({ custom_components: [GAUGE] });
    expect(
      checkAppspec({ ...BASE, interface: { custom_components: [GAUGE] } })
        .problems,
    ).toEqual([]);
  });

  it('is refused in the sentences agentspecs says', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: 'Table' }, 'The component Table is a component of the catalog'],
      [{ name: 'gauge' }, 'a word starting with a capital letter'],
      [{ source: './gauge.js' }, "is a file of the application's folder"],
      [
        { source: 'http://elements.example.com/g.js' },
        'is loaded over `https://`',
      ],
      [{ source: 'javascript:alert(1)' }, 'is loaded over `https://`'],
      [{ integrity: 'md5-x' }, 'is no Subresource Integrity hash'],
      [{ props: { type: 'array' } }, 'props are the JSON Schema of an object'],
      [
        { props: { type: 'object', properties: { when: { type: 'date' } } } },
        "'when' is typed 'date'",
      ],
      [
        { props: { type: 'object', properties: { id: { type: 'string' } } } },
        "cannot have a property named 'id'",
      ],
      [
        { shows: ['label'] },
        "both has the property 'label' and binds through it",
      ],
      [{ sends: ['action'] }, "cannot bind through 'action'"],
      [{ example: { value: 1 } }, "example is refused: it needs 'label'"],
      [{ height: 10 }, 'between 40 and 2000 pixels'],
    ];
    for (const [changes, sentence] of cases) {
      expect(customComponentProblems(declared(changes)).join(' ')).toContain(
        sentence,
      );
    }
    expect(
      checkAppspec({
        ...BASE,
        interface: { custom_components: [GAUGE, GAUGE] },
      }).problems,
    ).toContain('Two of its own components have the same name.');
  });

  it('is placed and drawn by its application only, checked as the catalog is', () => {
    const surface = (node: Record<string, unknown>) => ({
      components: [
        { id: 'root', component: 'Column', children: ['load'] },
        { id: 'load', component: 'Gauge', ...node },
      ],
    });
    const own = {
      ...BASE,
      interface: {
        layout: 'split',
        custom_components: [GAUGE],
        surface: surface({ label: 'Load', value: { path: '/load' } }),
      },
    };
    expect(checkAppspec(own).problems).toEqual([]);
    expect(
      checkAppspec({
        ...own,
        interface: { ...own.interface, surface: surface({ most: 'a lot' }) },
      }).problems,
    ).toContain(
      "The surface's “load” is a Gauge its schema refuses: 'most' is number; it needs 'label'.",
    );
    // Another application has no Gauge: the catalog does not open.
    expect(
      checkAppspec({ ...BASE, interface: { components: ['Gauge'] } }).problems,
    ).toContain('There is no component named “Gauge” in the catalog.');
    const { app } = parseAppspec(own);
    const palette = appComponents(app, listComponents());
    expect(palette.at(-1)).toMatchObject({
      id: 'Gauge',
      category: 'custom',
      standard: false,
      bindings: { shows: ['value'], sends: ['chosen'] },
    });
    expect(
      appComponents(parseAppspec(BASE).app, listComponents()),
    ).toHaveLength(listComponents().length);
  });

  it("draws a widget's page output with it", () => {
    const page = (component: string, props: Record<string, unknown>) => ({
      ...BASE,
      kind: 'widget',
      interface: {
        custom_components: [GAUGE],
        page: {
          function: 'load',
          inputs: {
            type: 'object',
            properties: { seats: { type: 'integer', default: 1 } },
          },
          outputs: [{ name: 'load', component, props }],
        },
      },
    });
    expect(checkAppspec(page('Gauge', { label: 'Load' })).problems).toEqual([]);
    expect(checkAppspec(page('Gauge', {})).problems).toContain(
      "The output “load” is a Gauge its schema refuses: it needs 'label'.",
    );
    expect(checkAppspec(page('Dial', {})).problems.join(' ')).toContain(
      'or a component of its own (`custom_components`)',
    );
  });
});

describe('its frame', () => {
  it('allows its bootstrap and the module it is handed, and nothing else', () => {
    expect(CUSTOM_FRAME_SANDBOX).toBe('allow-scripts');
    const policy = customFramePolicy('n0nce');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'nonce-n0nce' blob:");
    expect(policy).not.toContain('connect-src');
    const page = customFrameDocument('n0nce', 'A <dial>');
    expect(page).toContain(`content="${policy}"`);
    expect(page).toContain('<script nonce="n0nce">');
    expect(page).toContain('<title>A &#60;dial&#62;</title>');
  });

  it('hears only the frame it drew, and only what it says', () => {
    const frame = {} as Window;
    const other = {} as Window;
    const said = (data: unknown, source: Window = frame) =>
      fromFrame({ source, data } as MessageEvent, frame);
    expect(said({ tag: 'loop.component', kind: 'ready' })).toEqual({
      kind: 'ready',
    });
    expect(
      said({ tag: 'loop.component', kind: 'send', name: 'chosen', value: 3 }),
    ).toEqual({ kind: 'send', name: 'chosen', value: 3 });
    expect(said({ tag: 'loop.component', kind: 'ready' }, other)).toBeNull();
    expect(said({ kind: 'ready' })).toBeNull();
    expect(said({ tag: 'loop.component', kind: 'eval', code: 'x' })).toBeNull();
    expect(said({ tag: 'loop.component', kind: 'send', name: 3 })).toBeNull();
  });

  it('fetches its module without credentials and draws only the one reviewed', async () => {
    const code =
      'export default function draw(root) { root.textContent = "1"; }';
    const bytes = new TextEncoder().encode(code);
    const digest = await crypto.subtle.digest('SHA-384', bytes);
    const integrity = `sha384-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
    expect(await integrityHolds(bytes.buffer, integrity)).toBe(true);
    expect(await integrityHolds(bytes.buffer, 'sha384-AAAA')).toBe(false);
    expect(await integrityHolds(bytes.buffer, 'md5-AAAA')).toBe(false);
    const fetcher = vi.fn(async () => new Response(code));
    await expect(
      customModule('https://m.example.com/a.js', integrity, fetcher),
    ).resolves.toBe(code);
    expect(fetcher).toHaveBeenCalledWith('https://m.example.com/a.js', {
      credentials: 'omit',
      mode: 'cors',
    });
    await expect(
      customModule('https://m.example.com/b.js', 'sha384-AAAA', fetcher),
    ).rejects.toThrow('Its module is not the one reviewed');
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    await expect(
      customModule('https://m.example.com/c.js', '', missing),
    ).rejects.toThrow(
      'could not be fetched from https://m.example.com/c.js (404)',
    );
  });
});

describe('on a surface', () => {
  let mounted: { root: Root; container: HTMLElement } | null = null;

  afterEach(async () => {
    if (mounted) {
      const { root, container } = mounted;
      await act(async () => root.unmount());
      container.remove();
      mounted = null;
    }
  });

  const messages = [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 's', catalogId: SURFACE_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { id: 'root', component: 'Column', children: ['load'] },
          {
            id: 'load',
            component: 'Gauge',
            label: 'Load',
            value: { path: '/load' },
            chosen: { path: '/chosen' },
            action: {
              event: {
                name: 'choose',
                context: { chosen: { path: '/chosen' } },
              },
            },
          },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 's', path: '/', value: { load: 42 } },
    },
  ] as A2uiMessage[];

  it('is drawn in its sandboxed frame, given its properties, and sends what it declares', async () => {
    const code = 'export default () => ({})';
    const fetcher = vi.fn(async () => new Response(code));
    const gauge = { ...declared(), source: 'https://m.example.com/gauge.js' };
    const catalog = catalogWithOwn([customImplementation(gauge, '1', fetcher)]);
    const actions: A2uiClientAction[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { root, container };
    await act(async () => {
      root.render(
        <InlineSurface
          messages={messages}
          catalog={catalog}
          onAction={action => actions.push(action)}
        />,
      );
    });
    const frame = container.querySelector('iframe')!;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
    expect(frame.style.height).toBe('240px');
    const told: unknown[] = [];
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(
      (message: unknown) => {
        told.push(message);
      },
    );
    const say = async (data: Record<string, unknown>) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { tag: 'loop.component', ...data },
            source: frame.contentWindow,
          }),
        );
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    await say({ kind: 'ready' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(told).toContainEqual({
      tag: 'loop.component',
      kind: 'props',
      props: { label: 'Load', value: 42 },
    });
    expect(told).toContainEqual({
      tag: 'loop.component',
      kind: 'module',
      code,
    });
    await say({ kind: 'send', name: 'chosen', value: 7 });
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('choose');
    expect(actions[0].context).toEqual({ chosen: 7 });
    // What it does not declare is refused, and said.
    await say({ kind: 'send', name: 'secret', value: 1 });
    expect(actions).toHaveLength(1);
    expect(container.textContent).toContain(
      'It sent “secret”, which it does not declare under `sends`.',
    );
  });

  it("is of its application's catalog only", () => {
    const gauge = declared();
    const own = [customImplementation(gauge)];
    expect(
      catalogOfBlocks(['Text', 'Gauge'], own).components.has('Gauge'),
    ).toBe(true);
    expect(() => catalogOfBlocks(['Text', 'Gauge'])).toThrow(
      'No renderer draws Gauge',
    );
    expect(() =>
      catalogOfBlocks(
        ['Text'],
        [customImplementation({ ...gauge, name: 'Text' })],
      ),
    ).toThrow('Text is a component of the catalog');
  });
});

describe('as a contribution of its application', () => {
  it('is a block and a renderer of its plugin, in its preset alone', () => {
    const { app } = parseAppspec({
      ...BASE,
      interface: { layout: 'split', custom_components: [GAUGE] },
    });
    const reactor = buildReactorFromPlugins([defineAppComponentsPlugin(app)]);
    reactor.start();
    expect(
      reactor.getContributions(LoopCanvasBlock).map(entry => entry.value.id),
    ).toEqual(['Gauge']);
    expect(
      reactor
        .getContributions(LoopA2uiComponent)
        .map(entry => [entry.value.id, entry.value.app]),
    ).toEqual([['Gauge', 'desk']]);
    const names = (spec: typeof app) =>
      appPreset(spec).plugins.map(plugin => (plugin as { name: string }).name);
    expect(names(app)).toContain(appComponentsPluginName('desk'));
    expect(names(parseAppspec(BASE).app)).not.toContain(
      appComponentsPluginName('desk'),
    );
    expect(() => defineAppComponentsPlugin(parseAppspec(BASE).app)).toThrow(
      'has no component of its own',
    );
  });
});
