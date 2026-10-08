/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own components, drawn (LOOP C-18): each of Table, Chart, File
 * upload, Chat, Evidence, Form and File to download renders from its catalog example on a
 * surface drawn by `datalayerCatalog`, reads what the application publishes
 * through its binding, and sends what a person does through the A2UI action
 * path — written where its binding points, then its action dispatched with
 * that value in its context. Each stays behind `visible_when`.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../../../apps/plugins/a2ui-surface/InlineSurface';
import { COMPONENT_CATALOGUE } from '../../../specs/uiPlugins';
import {
  OWN_COMPONENT_IDS,
  VISIBLE_WHEN,
  chartOption,
  datalayerCatalog,
  downloadOf,
  fileRefusal,
  sizeInWords,
} from '..';

// ECharts draws on a canvas or an SVG it sizes from the page, which jsdom
// does not lay out: the option it is handed is what is checked.
const drawn: { option?: unknown } = {};
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: unknown }) => {
    drawn.option = option;
    return <div data-testid="echarts" />;
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Node = Record<string, unknown> & { id: string; component: string };

const surface = (nodes: Node[], data: Record<string, unknown>): A2uiMessage[] =>
  [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 's', catalogId: SURFACE_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 's',
        components: [
          { id: 'root', component: 'Column', children: [nodes[0].id] },
          ...nodes,
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 's', path: '/', value: data },
    },
  ] as A2uiMessage[];

const example = (id: string) => ({ ...COMPONENT_CATALOGUE[id].example });

let mounted: { root: Root; container: HTMLElement } | null = null;

afterEach(async () => {
  if (mounted) {
    const { root, container } = mounted;
    await act(async () => root.unmount());
    container.remove();
    mounted = null;
  }
});

async function draw(
  nodes: Node[],
  data: Record<string, unknown> = {},
  published?: Record<string, unknown>,
) {
  const actions: A2uiClientAction[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  const messages = surface(nodes, data);
  const render = (next?: Record<string, unknown>) =>
    act(async () =>
      root.render(
        <InlineSurface
          messages={messages}
          onAction={action => actions.push(action)}
          data={next}
        />,
      ),
    );
  await render(published);
  // The first render shows the loading state; content follows.
  await act(async () => undefined);
  return { container, actions, render };
}

const sent = (actions: A2uiClientAction[]) =>
  actions.map(action => {
    const { name, context } = action as {
      name: string;
      context?: Record<string, unknown>;
    };
    return { name, context };
  });

const key = (element: Element, k: string) =>
  act(async () => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true }),
    );
  });

const click = (element: Element) =>
  act(async () => {
    (element as HTMLElement).click();
  });

/** Types into a React-controlled field as a person would. */
async function type(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const buttonNamed = (container: HTMLElement, words: string) => {
  const found = [...container.querySelectorAll('button')].find(
    button =>
      button.textContent?.trim() === words ||
      button.getAttribute('aria-label') === words,
  );
  if (!found) {
    throw new Error(`No button “${words}”.`);
  }
  return found;
};

describe('Datalayer’s own components', () => {
  it('each has a renderer in the catalog, with visible_when declared', () => {
    expect(OWN_COMPONENT_IDS).toEqual([
      'Table',
      'Chart',
      'FileUpload',
      'Chat',
      'Evidence',
      'Form',
      'Download',
    ]);
    for (const id of OWN_COMPONENT_IDS) {
      const renderer = datalayerCatalog.components.get(id);
      expect(renderer, id).toBeDefined();
      const shape = (renderer!.schema as { shape: Record<string, unknown> })
        .shape;
      expect(VISIBLE_WHEN in shape, id).toBe(true);
      expect('action' in shape, id).toBe(true);
      for (const binding of [
        ...COMPONENT_CATALOGUE[id].bindings!.shows,
        ...COMPONENT_CATALOGUE[id].bindings!.sends,
      ]) {
        expect(binding in shape, `${id}.${binding}`).toBe(true);
      }
      // Its example, and nothing it does not declare.
      expect(
        (
          renderer!.schema as {
            safeParse: (v: unknown) => { success: boolean };
          }
        ).safeParse(example(id)).success,
        id,
      ).toBe(true);
      expect(
        (
          renderer!.schema as {
            safeParse: (v: unknown) => { success: boolean };
          }
        ).safeParse({ ...example(id), unknown_key: 1 }).success,
        id,
      ).toBe(false);
    }
  });

  it('Table: rows from a binding, a page at a time, a chosen row sent', async () => {
    const rows = [
      { model: 'fast', 'pass rate': 0.7, cost: 1 },
      { model: 'careful', 'pass rate': 0.9, cost: 3 },
      { model: 'cheap', 'pass rate': 0.5, cost: 0.2 },
    ];
    const { container, actions, render } = await draw(
      [
        {
          id: 'runs',
          component: 'Table',
          ...example('Table'),
          page_size: 2,
          selectable: true,
          rows: { path: '/rows' },
          selected: { path: '/chosen' },
          action: {
            event: { name: 'select', context: { row: { path: '/chosen' } } },
          },
        },
      ],
      { rows },
    );
    expect(container.querySelector('h3')?.textContent).toBe('Runs');
    const headers = [...container.querySelectorAll('th')].map(
      th => th.textContent,
    );
    expect(headers).toEqual(['model', 'pass rate', 'cost']);
    let body = () => [...container.querySelectorAll('tbody tr')];
    expect(body().map(row => row.textContent)).toEqual([
      'fast0.71',
      'careful0.93',
    ]);
    expect(container.textContent).toContain('Page 1 of 2');
    await click(buttonNamed(container, 'Next'));
    expect(body().map(row => row.textContent)).toEqual(['cheap0.50.2']);
    await click(buttonNamed(container, 'Previous'));

    // By keyboard: the row is focusable and Enter chooses it.
    const careful = body()[1] as HTMLElement;
    expect(careful.tabIndex).toBe(0);
    await key(careful, 'Enter');
    expect(sent(actions)).toEqual([
      { name: 'select', context: { row: rows[1] } },
    ]);
    expect(body()[1].getAttribute('aria-selected')).toBe('true');

    // What the application publishes anew is what it shows.
    await render({ '/rows': [{ model: 'new', 'pass rate': 1, cost: 2 }] });
    body = () => [...container.querySelectorAll('tbody tr')];
    expect(body().map(row => row.textContent)).toEqual(['new12']);
    expect(container.textContent).not.toContain('Page 1 of');
  });

  it('Chart: points from a binding, drawn by kind, its numbers in a table', async () => {
    const points = [
      { model: 'fast', 'pass rate': 0.7 },
      { model: 'careful', 'pass rate': 0.9 },
    ];
    const { container, render } = await draw(
      [
        {
          id: 'chart',
          component: 'Chart',
          ...example('Chart'),
          points: { path: '/points' },
        },
      ],
      { points },
    );
    expect(container.querySelector('[data-testid="echarts"]')).not.toBeNull();
    const option = drawn.option as {
      xAxis: { data: string[] };
      series: { type: string; data: unknown[] }[];
    };
    expect(option.xAxis.data).toEqual(['fast', 'careful']);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe('bar');
    expect(option.series[0].data).toEqual([0.7, 0.9]);
    expect(container.querySelector('figure')?.getAttribute('aria-label')).toBe(
      'Chart: pass rate by model, as a bar',
    );
    expect(container.querySelector('summary')?.textContent).toBe('The numbers');
    expect(container.querySelector('tbody')?.textContent).toBe(
      'fast0.7careful0.9',
    );

    await render({ '/points': [{ model: 'cheap', 'pass rate': 0.4 }] });
    expect((drawn.option as { xAxis: { data: string[] } }).xAxis.data).toEqual([
      'cheap',
    ]);
  });

  it('Chart: a series apart for each value, an area, a scatter of numbers', () => {
    const colours = { series: ['a', 'b'], text: 't', muted: 'm', grid: 'g' };
    const points = [
      { day: 'Mon', runs: 1, kind: 'eval' },
      { day: 'Tue', runs: 2, kind: 'eval' },
      { day: 'Mon', runs: 3, kind: 'test' },
    ];
    const area = chartOption(
      points,
      { kind: 'area', x: 'day', y: 'runs', series: 'kind' },
      colours,
    ) as {
      series: {
        name: string;
        type: string;
        areaStyle?: object;
        data: unknown[];
      }[];
    };
    expect(area.series.map(one => [one.name, one.type, one.data])).toEqual([
      ['eval', 'line', [1, 2]],
      ['test', 'line', [3, null]],
    ]);
    expect(area.series[0].areaStyle).toEqual({});
    const scatter = chartOption(
      [{ cost: 1, score: 2 }],
      { kind: 'scatter', x: 'cost', y: 'score' },
      colours,
    ) as { xAxis: { type: string }; series: { data: unknown[] }[] };
    expect(scatter.xAxis.type).toBe('value');
    expect(scatter.series[0].data).toEqual([[1, 2]]);
  });

  it('File upload: a file chosen is read, written to its binding and sent', async () => {
    const { container, actions } = await draw([
      {
        id: 'contract',
        component: 'FileUpload',
        ...example('FileUpload'),
        files: { path: '/files' },
        action: {
          event: { name: 'upload', context: { files: { path: '/files' } } },
        },
      },
    ]);
    expect(container.textContent).toContain('The contract');
    const choose = buttonNamed(container, 'Choose a file');
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe('.pdf,.docx');
    const clicked = vi
      .spyOn(input, 'click')
      .mockImplementation(() => undefined);
    await click(choose);
    expect(clicked).toHaveBeenCalled();

    const give = async (file: File) => {
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // FileReader reports on a later task.
      await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    };
    await give(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(container.textContent).toContain(
      'notes.txt is not one it takes (.pdf, .docx).',
    );
    expect(actions).toEqual([]);

    await give(new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' }));
    expect(sent(actions)).toEqual([
      {
        name: 'upload',
        context: {
          files: [
            {
              name: 'contract.pdf',
              type: 'application/pdf',
              size: 4,
              data_url: 'data:application/pdf;base64,JVBERg==',
            },
          ],
        },
      },
    ]);
    expect(container.textContent).toContain('Given: contract.pdf');
  });

  it('File upload: too large a file is refused', () => {
    expect(
      fileRefusal({ name: 'a.pdf', size: 2 * 1024 * 1024 }, ['.pdf'], 1),
    ).toBe('a.pdf is larger than 1 MB.');
    expect(fileRefusal({ name: 'A.PDF', size: 10 }, ['.pdf'], 1)).toBeNull();
    expect(fileRefusal({ name: 'any', size: 10 }, undefined, 1)).toBeNull();
  });

  it('Download: a file offered by its name, its kind and size said, a press sent', async () => {
    const { container, actions } = await draw([
      {
        id: 'totals',
        component: 'Download',
        ...example('Download'),
        action: {
          event: { name: 'download', context: { file: 'totals.csv' } },
        },
      },
    ]);
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('totals.csv');
    expect(link.getAttribute('download')).toBe('totals.csv');
    expect(link.getAttribute('href')).toBe(
      'data:text/csv;base64,bW9udGgsdG90YWwKSmFuLDEyMDAK',
    );
    expect(container.textContent).toContain('text/csv · 21 bytes');
    expect(container.textContent).toContain("The month's totals.");
    // jsdom does not navigate: the press is what is checked.
    link.addEventListener('click', event => event.preventDefault());
    await click(link);
    expect(sent(actions)).toEqual([
      { name: 'download', context: { file: 'totals.csv' } },
    ]);
  });

  it('Download: a link of another scheme is not followed', async () => {
    expect(downloadOf({ name: 'x.csv', url: 'javascript:alert(1)' })).toEqual({
      problem:
        'x.csv is not offered: its link is neither an http(s) link nor a data: URL.',
    });
    expect(downloadOf({ name: '', url: 'https://a.b/x' })).toEqual({
      problem: 'This file has no name.',
    });
    expect(downloadOf({ name: 'r.pdf', url: 'https://a.b/r.pdf' })).toEqual({
      name: 'r.pdf',
      url: 'https://a.b/r.pdf',
    });
    expect(sizeInWords(1)).toBe('1 byte');
    expect(sizeInWords(1536)).toBe('1.5 KB');
    expect(sizeInWords(30 * 1024 * 1024)).toBe('30 MB');
    expect(sizeInWords(undefined)).toBe('');
  });

  it('Chat: its welcome and starters, the messages published, a message sent', async () => {
    const node: Node = {
      id: 'chat',
      component: 'Chat',
      ...example('Chat'),
      messages: { path: '/messages' },
      message: { path: '/draft' },
      action: {
        event: { name: 'send', context: { message: { path: '/draft' } } },
      },
    };
    const { container, actions, render } = await draw([node], { messages: [] });
    expect(container.textContent).toContain('Ask me to research anything.');
    const starter = [...container.querySelectorAll('[role="button"]')].find(
      element => element.textContent === 'What changed in Python 3.13?',
    )!;
    expect((starter as HTMLElement).tabIndex).toBe(0);
    await key(starter, 'Enter');
    expect(sent(actions)).toEqual([
      { name: 'send', context: { message: 'What changed in Python 3.13?' } },
    ]);

    const composer = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(composer.placeholder).toBe('Ask anything');
    await type(composer, 'And in 3.14?');
    await key(composer, 'Enter');
    expect(sent(actions)[1]).toEqual({
      name: 'send',
      context: { message: 'And in 3.14?' },
    });
    expect(composer.value).toBe('');

    await render({
      '/messages': [
        { role: 'user', text: 'And in 3.14?' },
        { role: 'tool', name: 'web_search', args: { q: 'python 3.14' } },
        { role: 'assistant', text: 'Free-threading is supported.' },
      ],
    });
    expect(container.textContent).toContain('Free-threading is supported.');
    expect(container.textContent).not.toContain('Ask me to research anything.');
  });

  it('Evidence: the sources published, their passages, the rest behind more', async () => {
    const sources = Array.from({ length: 7 }, (_, index) => ({
      title: `Source ${index + 1}`,
      url: `https://example.org/${index + 1}`,
      passage: `Passage ${index + 1}`,
    }));
    const { container, actions } = await draw(
      [
        {
          id: 'evidence',
          component: 'Evidence',
          ...example('Evidence'),
          sources: { path: '/sources' },
          action: { event: { name: 'open' } },
        },
      ],
      { sources },
    );
    expect(container.querySelector('h3')?.textContent).toBe(
      'What this rests on',
    );
    const items = () => [...container.querySelectorAll('li')];
    expect(items()).toHaveLength(5);
    expect(container.querySelector('blockquote')?.textContent).toBe(
      'Passage 1',
    );
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://example.org/1');
    expect(link.target).toBe('_blank');
    link.addEventListener('click', event => event.preventDefault());
    await click(link);
    expect(sent(actions)).toEqual([{ name: 'open', context: {} }]);
    await click(buttonNamed(container, '2 more'));
    expect(items()).toHaveLength(7);
  });

  it('Form: fields from its schema, the values published, the values sent', async () => {
    const { container, actions } = await draw(
      [
        {
          id: 'quote',
          component: 'Form',
          ...example('Form'),
          values: { path: '/quote' },
          action: {
            event: { name: 'submit', context: { quote: { path: '/quote' } } },
          },
        },
      ],
      { quote: { seats: 3 } },
    );
    expect(container.querySelector('h3')?.textContent).toBe('The quote');
    const seats = container.querySelector('input') as HTMLInputElement;
    expect(seats.value).toBe('3');
    await type(seats, '12');
    const send = buttonNamed(container, 'Send');
    await act(async () => {
      send
        .closest('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
    expect(sent(actions)).toEqual([
      { name: 'submit', context: { quote: { seats: 12 } } },
    ]);
  });

  it('Form: a form its schema refuses sends nothing and says why', async () => {
    const { container, actions } = await draw([
      {
        id: 'quote',
        component: 'Form',
        ...example('Form'),
        action: { event: { name: 'submit' } },
      },
    ]);
    // Untouched, it does not open in red.
    expect(container.textContent).not.toContain('must have required property');
    const send = buttonNamed(container, 'Send');
    await act(async () => {
      send
        .closest('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
    expect(actions).toEqual([]);
    expect(container.textContent).toContain('must have required property');
  });

  it('Form: without an action, settings — no button, the values written as filled', async () => {
    const { container, actions } = await draw(
      [
        { id: 'both', component: 'Column', children: ['settings', 'shown'] },
        {
          id: 'settings',
          component: 'Form',
          schema: {
            type: 'object',
            properties: {
              seats: { type: 'integer', title: 'Seats', default: 10 },
            },
          },
          values: { path: '/inputs' },
        },
        { id: 'shown', component: 'Text', text: { path: '/inputs/seats' } },
      ],
      { inputs: { seats: 10 } },
    );
    const form = container.querySelector('[data-testid="a2ui-form"]')!;
    expect(form.querySelectorAll('button')).toHaveLength(0);
    await type(form.querySelector('input') as HTMLInputElement, '12');
    // Written where its values point, for the next run; nothing sent.
    expect(container.textContent).toContain('12');
    expect(actions).toEqual([]);
  });

  it('Form: its fields drawn with the inputs its ui names — a switch, tags, radio buttons, a slider (LOOP P-20)', async () => {
    const { container, actions } = await draw(
      [
        {
          id: 'settings',
          component: 'Form',
          schema: {
            type: 'object',
            properties: {
              live: { type: 'boolean', title: 'Live data' },
              topics: {
                type: 'array',
                title: 'Topics',
                items: { type: 'string' },
              },
              tone: { type: 'string', title: 'Tone', enum: ['warm', 'dry'] },
              seats: {
                type: 'integer',
                title: 'Seats',
                minimum: 1,
                maximum: 9,
              },
            },
          },
          ui: {
            live: { 'ui:widget': 'switch' },
            topics: { 'ui:widget': 'tags' },
            tone: { 'ui:widget': 'radio', 'ui:enumNames': ['Warm', 'Dry'] },
            seats: { 'ui:widget': 'range' },
          },
          values: { path: '/inputs' },
        },
      ],
      { inputs: { live: false, topics: ['billing'], tone: 'warm', seats: 3 } },
    );
    const form = container.querySelector('[data-testid="a2ui-form"]')!;
    const toggle = form.querySelector(
      '[aria-labelledby$="-label"][aria-pressed]',
    );
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(form.textContent).toContain('billing');
    expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(form.textContent).toContain('Warm');
    expect(form.querySelector('input[type="range"]')).not.toBeNull();
    await click(toggle as HTMLElement);
    expect(
      form.querySelector('[aria-pressed]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(actions).toEqual([]);
  });

  it('Table: a row chosen is shown chosen when nothing is bound to selected', async () => {
    const { container, actions } = await draw([
      {
        id: 'runs',
        component: 'Table',
        columns: ['model'],
        selectable: true,
        rows: [{ model: 'fast' }, { model: 'careful' }],
        action: { event: { name: 'select' } },
      },
    ]);
    const second = container.querySelectorAll('tbody tr')[1];
    await key(second, ' ');
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(
      container.querySelectorAll('tbody tr')[0].getAttribute('aria-selected'),
    ).toBe('false');
    expect(sent(actions)).toEqual([{ name: 'select', context: {} }]);
  });

  it('stays behind visible_when, as every block does', async () => {
    const { container, render } = await draw(
      [
        {
          id: 'runs',
          component: 'Table',
          columns: ['model'],
          rows: [{ model: 'fast' }],
          [VISIBLE_WHEN]: { path: '/ready' },
        },
      ],
      { ready: false },
    );
    expect(container.querySelector('table')).toBeNull();
    await render({ '/ready': true });
    expect(container.querySelector('table')?.textContent).toContain('fast');
  });
});
