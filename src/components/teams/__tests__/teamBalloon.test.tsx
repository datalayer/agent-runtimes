/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team's balloons (LOOP T-23, H-29): each member's shows only what it
 * says or does now (`current`) — "Asking Accounting…" for Sales' one tool,
 * "Using list_invoices…" while Accounting calls Odoo — and the notebook
 * Accounting gave shows in Sales' balloon read-only, drawn statically (no
 * kernel, no Pyodide); the notebook that runs is drawn right under the
 * team, into the area the page names, as it arrives, and a click in the
 * balloon takes the reader there.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { A2ATeamGraph } from '../A2ATeamGraph';
import { AT_REST, type A2ATeamPersona } from '../useA2ATeam';
import { toolOwnName, type A2ATeamConnection } from '../a2aTeamFlow';
import {
  NotebookPreview,
  focusTeamNotebook,
  notebookDocument,
} from '../NotebookPreview';
import { toolLineOfStep } from '../../../chat/assistant/toolLine';
import previewSource from '../NotebookPreview.tsx?raw';
import viewSource from '../NotebookPreviewView.tsx?raw';
import exampleSource from '../../../examples/AgentA2ATeamExample.tsx?raw';

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  if (!('DOMMatrixReadOnly' in window)) {
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m22 = 1;
        constructor() {}
      },
    );
  }
});

afterEach(() => cleanup());

// The notebook that runs (JupyterLab, the sandbox, Pyodide), stood in for.
vi.mock('../TeamNotebookView', () => ({
  default: ({ fileName }: { fileName: string }) => (
    <div data-testid="sandbox-notebook">{fileName}</div>
  ),
}));

/**
 * jupyter-react, stood in for: what is checked is that the notebook is
 * handed to its Notebook read-only, on a manager with no kernel, and that
 * it is loaded only once a notebook is drawn. The stand-in draws the cells
 * and outputs it is handed, as text.
 */
const jupyter = vi.hoisted(() => ({
  loaded: 0,
  props: [] as Array<Record<string, any>>,
}));
vi.mock('@datalayer/jupyter-react', () => {
  jupyter.loaded += 1;
  class ServiceManagerLess {
    readonly less = true;
  }
  return {
    ServiceManagerLess,
    JupyterReactTheme: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    Notebook: (props: Record<string, any>) => {
      jupyter.props.push(props);
      return (
        <div data-testid="jupyter-notebook">
          {props.nbformat.cells.map((cell: any, index: number) => (
            <div key={index} data-cell={cell.cell_type}>
              {String(cell.source)}
              {(cell.outputs ?? []).map((output: any, at: number) => (
                <pre key={at} data-output={output.output_type}>
                  {String(output.text)}
                </pre>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

const NOTEBOOK = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { language_info: { name: 'python' } },
  cells: [
    {
      cell_type: 'markdown',
      source: ['## Open invoices\n', 'From the **books**.'],
    },
    {
      cell_type: 'code',
      source: 'total = 1200 + 860\nprint(total)',
      outputs: [
        { output_type: 'stream', name: 'stdout', text: ['2060\n'] },
        { output_type: 'execute_result', data: { 'text/plain': "'EUR'" } },
        { output_type: 'error', ename: 'KeyError', evalue: "'due'" },
        {
          output_type: 'display_data',
          data: { 'image/png': 'iVBORw0KGgo=', 'text/plain': '<Figure>' },
        },
      ],
    },
  ],
};

describe('NotebookPreview, a notebook read-only', () => {
  it('is jupyter-react’s notebook, read-only, with no kernel, loaded when drawn', async () => {
    expect(jupyter.loaded).toBe(0);
    const { container, findByTestId } = render(
      <NotebookPreview notebook={NOTEBOOK} title="Accounting’s notebook" />,
    );
    const notebook = await findByTestId('jupyter-notebook');
    expect(jupyter.loaded).toBe(1);
    const props = jupyter.props[jupyter.props.length - 1];
    expect(props.readonly).toBe(true);
    expect(props.startDefaultKernel).toBe(false);
    expect(props.kernelId).toBeUndefined();
    expect(props.serviceManager.less).toBe(true);
    // Its cells and the outputs it carries, handed as a copy.
    expect(props.nbformat).toEqual(NOTEBOOK);
    expect(props.nbformat).not.toBe(NOTEBOOK);
    expect(
      notebook.querySelector('[data-cell="markdown"]')?.textContent,
    ).toContain('Open invoices');
    expect(notebook.querySelector('[data-output="stream"]')?.textContent).toBe(
      '2060\n',
    );
    expect(
      container.querySelector('[role="region"]')?.getAttribute('aria-label'),
    ).toBe('Accounting’s notebook, read-only');
  });

  it('takes the notebook as a string too, and refuses what is not one', () => {
    expect(notebookDocument(JSON.stringify(NOTEBOOK))?.cells).toHaveLength(2);
    expect(notebookDocument('not json')).toBeUndefined();
    expect(notebookDocument({ cells: 'x' })).toBeUndefined();
    const { container } = render(
      <NotebookPreview notebook="not a notebook" title="x" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('imports jupyter-react lazily, and no kernel, sandbox nor Pyodide', () => {
    const imports = (source: string) =>
      source
        .split('\n')
        .filter(line => /^import |^} from '|from '/.test(line))
        .join('\n');
    expect(imports(previewSource)).not.toMatch(/jupyter-react|pyodide/i);
    expect(previewSource).toContain(
      "lazy(() => import('./NotebookPreviewView'))",
    );
    expect(imports(viewSource)).not.toMatch(
      /pyodide|browserService|EphemeralNotebook|TeamNotebookView/i,
    );
    expect(viewSource).toContain('new ServiceManagerLess()');
  });

  it('says how to run it, and a click takes the reader there', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <NotebookPreview notebook={NOTEBOOK} title="n" onOpen={onOpen} />,
    );
    const open = container.querySelector<HTMLElement>(
      '[data-notebook-preview-open]',
    );
    expect(open?.textContent).toBe('Open it to run it');
    act(() => open?.click());
    act(() => container.querySelector<HTMLElement>('[role="region"]')?.click());
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('focuses the notebook that runs, scrolled to', () => {
    const section = document.createElement('section');
    section.setAttribute('data-team-notebook', '');
    section.tabIndex = -1;
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    focusTeamNotebook();
    expect(section.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(section);
    section.remove();
  });
});

const ODOO: A2ATeamConnection = {
  id: 'odoo-accounting',
  name: 'Odoo Accounting',
  label: 'Odoo',
  via: 'via MCP',
  tools: ['odoo_accounting_list_invoices'],
  prefix: 'odoo_accounting_',
};

function member(id: string, persona: A2ATeamPersona) {
  return {
    id,
    name: id === 'sales' ? 'Sales' : 'Accounting',
    character: id === 'sales' ? 'paperclip' : 'wizard',
    where: 'here',
    persona,
  };
}

function Graph({
  sales,
  accounting,
  under,
}: {
  sales: A2ATeamPersona;
  accounting: A2ATeamPersona;
  /** The area under the graph, where Sales' notebook runs. */
  under?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <A2ATeamGraph
      entry={{ ...member('sales', sales), expandTarget: under }}
      peer={member('accounting', accounting)}
      flow="still"
      connected
    />
  );
}

const balloonOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-team-member="${id}"] [data-speech-balloon]`);

describe("the team's balloons", () => {
  it('are current, and say the tools in plain words', () => {
    expect(toolOwnName('odoo_accounting_list_invoices', [ODOO])).toBe(
      'list_invoices',
    );
    const { container } = render(
      <Graph
        sales={{
          ...AT_REST,
          state: 'waiting',
          insist: true,
          saying: 'Accounting, could you: list the invoices',
          tool: {
            id: 'ask',
            tool: 'ask_accounting',
            name: 'ask_accounting',
            phase: 'running',
            words: 'Asking Accounting…',
          },
        }}
        accounting={{
          ...AT_REST,
          state: 'working',
          insist: true,
          tool: toolLineOfStep(
            { id: 'c1', name: 'odoo_accounting_list_invoices', ended: false },
            toolOwnName('odoo_accounting_list_invoices', [ODOO]),
          ),
        }}
      />,
    );
    const sales = balloonOf(container, 'sales');
    const accounting = balloonOf(container, 'accounting');
    expect(sales?.getAttribute('data-balloon-display')).toBe('current');
    expect(sales?.querySelector('[data-balloon-tool]')?.textContent).toBe(
      'Asking Accounting…',
    );
    expect(
      accounting?.querySelector('[data-balloon-tool="running"]')?.textContent,
    ).toBe('Using list_invoices…');
    expect(
      accounting?.querySelector('[data-balloon-announce]')?.textContent,
    ).toBe('Using list_invoices…');
  });

  it("show the notebook given in Sales' balloon, read-only, the one that runs under the graph", async () => {
    const area = document.createElement('div');
    area.scrollIntoView = vi.fn();
    document.body.appendChild(area);
    const { container } = render(
      <Graph
        under={{ current: area }}
        sales={{
          ...AT_REST,
          state: 'speaking',
          insist: true,
          saying: 'Here are the open invoices.',
          notebook: {
            mediaType: 'application/x-ipynb+json',
            name: 'Open invoices',
            filename: 'open-invoices.ipynb',
            data: NOTEBOOK,
          },
        }}
        accounting={AT_REST}
      />,
    );
    const sales = balloonOf(container, 'sales');
    expect(sales?.textContent).toContain('Here are the open invoices.');
    const preview = sales?.querySelector('[data-notebook-preview]');
    expect(preview).not.toBeNull();
    await waitFor(() =>
      expect(
        preview?.querySelector('[data-testid="jupyter-notebook"]')?.textContent,
      ).toContain('print(total)'),
    );
    // As it arrives, the one that runs is drawn under the graph.
    await waitFor(() =>
      expect(
        area.querySelector(
          '[data-team-notebook] [data-testid="sandbox-notebook"]',
        )?.textContent,
      ).toBe('open-invoices.ipynb'),
    );
    expect(
      preview?.querySelector('[data-notebook-preview-open]')?.textContent,
    ).toBe('Open it below to run it');
    // A click in the balloon takes the reader there, focused.
    act(() =>
      preview
        ?.querySelector<HTMLElement>('[data-notebook-preview-open]')
        ?.click(),
    );
    await waitFor(() => expect(area.scrollIntoView).toHaveBeenCalled());
    expect(document.activeElement).toBe(
      area.querySelector('[data-team-notebook]'),
    );
    area.remove();
  });

  it('keeps the notebook in the balloon while a tool runs, and offers Expand', () => {
    const { container } = render(
      <Graph
        sales={{
          ...AT_REST,
          state: 'working',
          insist: true,
          tool: {
            id: 'ask',
            tool: 'ask_accounting',
            name: 'ask_accounting',
            phase: 'running',
          },
          notebook: {
            mediaType: 'application/x-ipynb+json',
            name: 'Open invoices',
            data: NOTEBOOK,
          },
        }}
        accounting={AT_REST}
      />,
    );
    const sales = balloonOf(container, 'sales');
    expect(sales?.querySelector('[data-notebook-preview]')).not.toBeNull();
    expect(sales?.querySelector('[data-balloon-expand]')).not.toBeNull();
  });
});

describe('the team example', () => {
  it('names the area right under the team, before the composer, for the notebook that runs', () => {
    const graph = exampleSource.indexOf('<A2ATeamGraph');
    const area = exampleSource.indexOf('ref={notebookArea}');
    const composer = exampleSource.indexOf('<Textarea');
    expect(graph).toBeGreaterThan(0);
    expect(area).toBeGreaterThan(graph);
    expect(area).toBeLessThan(composer);
    expect(exampleSource).toContain('expandTarget: notebookArea');
    expect(exampleSource).not.toMatch(/<TeamNotebook/);
  });
});
