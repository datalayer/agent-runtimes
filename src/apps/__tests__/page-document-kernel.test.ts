/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The in-memory document runs its Jupyter cells on the page's kernel (the
 * user, 24 November 2026: "It should be connected to the pyodide browser
 * runtime"): the agent's cell is a cell, not an empty paragraph, the
 * adapter the tools use gets the kernel's services, and a run waits for the
 * kernel and runs on it.
 */

import { describe, expect, it, vi } from 'vitest';

const executed: Array<{ code: string; kernel: unknown }> = [];
const kernels: Array<{ props: Record<string, unknown> }> = [];

vi.mock('@datalayer/jupyter-react', async () => {
  class FakeSignal {
    private slots: Array<(sender: unknown) => void> = [];
    connect(slot: (sender: unknown) => void) {
      this.slots.push(slot);
    }
    emit(sender: unknown) {
      this.slots.forEach(slot => slot(sender));
    }
  }
  class OutputAdapter {
    kernel: unknown;
    outputs: unknown[];
    outputArea: {
      model: { toJSON: () => unknown[]; changed: FakeSignal };
    };
    constructor(_id: string, kernel: unknown, outputs: unknown[] = []) {
      this.kernel = kernel;
      this.outputs = outputs ?? [];
      this.outputArea = {
        model: { toJSON: () => this.outputs, changed: new FakeSignal() },
      };
    }
    setOutputs(outputs: unknown[]) {
      this.outputs = outputs ?? [];
    }
    async execute(code: string) {
      executed.push({ code, kernel: this.kernel });
      this.outputs = [{ output_type: 'stream', name: 'stdout', text: '2\n' }];
      this.outputArea.model.changed.emit(this.outputArea.model);
    }
  }
  class Kernel {
    props: Record<string, unknown>;
    ready: Promise<void>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
      this.ready = Promise.resolve();
      kernels.push(this);
    }
  }
  return {
    OutputAdapter,
    Kernel,
    newUuid: () => Math.random().toString(36).slice(2),
    OperationRunner: class {
      async execute(
        operation: { execute: (p: unknown, c: unknown) => unknown },
        params: unknown,
        context: unknown,
      ) {
        return operation.execute(params, context);
      }
    },
  };
});

const { lexicalStore } = await import('@datalayer/jupyter-lexical');
const { createLexicalTools } =
  await import('../../tools/adapters/agent-runtimes/lexicalHooks');
const { PAGE_DOCUMENT_ID, bindPageDocumentKernel, mirror, pageDocumentEditor } =
  await import('../plugins/page-document/memoryDocument');
const { PAGE_DOCUMENT_FRONTEND_TOOLS } =
  await import('../plugins/page-document');

const tool = (part: string) => {
  const flat = (name: string) => name.toLowerCase().replace(/_/g, '');
  const found = createLexicalTools(PAGE_DOCUMENT_ID).find(t =>
    flat(t.name).includes(flat(part)),
  );
  if (!found?.handler) throw new Error(`no ${part} tool`);
  return found.handler;
};

describe('the in-memory document on the page kernel', () => {
  it('takes a Jupyter cell from the agent', async () => {
    await pageDocumentEditor();
    await tool('insert_block')({
      type: 'jupyter-cell',
      source: '1 + 1',
      afterId: 'BOTTOM',
    });
    const read = JSON.stringify(await tool('read_all_blocks')({}));
    expect(read).toContain('jupyter-cell');
    expect(read).toContain('1 + 1');
  });

  it('waits for the kernel to run the agent’s cell, then runs it there, the adapter on the kernel’s services', async () => {
    const blocks = await lexicalStore
      .getState()
      .lexicals.get(PAGE_DOCUMENT_ID)!
      .adapter!.getBlocks();
    const cell = blocks.find(b => b.block_type === 'jupyter-cell')!;
    const run = PAGE_DOCUMENT_FRONTEND_TOOLS.find(t =>
      t.name.toLowerCase().endsWith('runblock'),
    )!;
    // The panel's editor, mirroring the document, gets the run's results.
    const { buildEditorFromExtensions } = await import('@lexical/extension');
    const { defineExtension } = await import('lexical');
    const { JupyterLexicalExtension } =
      await import('@datalayer/jupyter-lexical');
    const { ReactPluginHostExtension } =
      await import('@lexical/react/ReactPluginHostExtension');
    const view = buildEditorFromExtensions(
      defineExtension({
        name: 'test-view',
        namespace: 'test-view',
        dependencies: [ReactPluginHostExtension, JupyterLexicalExtension],
      }),
    );
    const stop = mirror(await pageDocumentEditor(), view);

    // Called while Python is still starting in the browser: no kernel yet.
    let settled = false;
    const pending = Promise.resolve(run.handler!({ id: cell.block_id })).then(
      result => {
        settled = true;
        return result as { success: boolean; outputs?: unknown[] };
      },
    );
    await new Promise(r => setTimeout(r, 50));
    expect(settled).toBe(false);
    expect(executed).toHaveLength(0);

    const manager = {
      ready: Promise.resolve(),
      kernels: { kind: 'kernels' },
      kernelspecs: { kind: 'kernelspecs' },
      sessions: { kind: 'sessions' },
    };
    await bindPageDocumentKernel({
      serviceManager: manager as never,
      kernelId: 'pyodide-1',
    });
    const adapter = lexicalStore
      .getState()
      .lexicals.get(PAGE_DOCUMENT_ID)?.adapter;
    expect(adapter?.serviceManager).toBe(manager);
    const kernel = kernels.at(-1)!;
    expect(kernel.props).toMatchObject({
      kernelModel: { id: 'pyodide-1' },
      kernelManager: manager.kernels,
      sessionManager: manager.sessions,
    });

    const result = await pending;
    expect(result.success).toBe(true);
    expect(executed.at(-1)).toEqual({ code: '1 + 1', kernel });
    expect(JSON.stringify(result.outputs)).toContain('2\\n');
    await new Promise(r => setTimeout(r, 0));
    expect(JSON.stringify(view.getEditorState().toJSON())).toContain('2\\n');
    stop();
  });
});
