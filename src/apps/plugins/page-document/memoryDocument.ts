/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's document, in memory (the user, 24 November 2026: "the
 * notebook and document tools ... should be able to manipulate in memory
 * documents"). The document tools act on a Lexical editor registered in
 * jupyter-lexical's store; that editor was the one the side panel mounts,
 * and a panel that was not shown (or waited for a runtime) left the tools
 * with no document. Here the document is an editor of its own, built with
 * the Jupyter Lexical nodes and no DOM, registered under `page-document`
 * from the first tool call. The panel shows and edits it (`useMirror`); it
 * is never needed for the tools to work.
 *
 * Its Jupyter cells run on the page's kernel (the user, 24 November 2026:
 * "It should be connected to the pyodide browser runtime"): the panel binds
 * it (`bindPageDocumentKernel`) to the kernel the view runs on, the
 * workspace's or Python in this browser, so a cell the agent inserts or runs
 * here runs where the person's do. The Jupyter behaviour itself (inserting a
 * cell with its output, the run commands) is jupyter-lexical's
 * `JupyterInputOutputPlugin`, a React plugin, hosted on a detached root:
 * without it the agent's `jupyter-cell` came out as an empty paragraph.
 *
 * Loaded on the first call, not with the chat: the Jupyter Lexical
 * extension is heavy, and the embed's first load is budgeted.
 *
 * @module apps/plugins/page-document/memoryDocument
 */

import { createElement, useEffect, type ComponentType } from 'react';
import type { LexicalEditor } from 'lexical';
import type { ServiceManager } from '@jupyterlab/services';
import type { Kernel } from '@datalayer/jupyter-react';
import { conversationScopedId } from '../../pageTools/conversationScope';

/** The id the tools and the store know the page's document by, outside a workspace. */
export const PAGE_DOCUMENT_ID = 'page-document';

/** The id of its panel's editor, which mirrors it. */
export const PAGE_DOCUMENT_VIEW_ID = 'page-document-view';

/** The services the document's cells run on, and the kernel to join there. */
export type PageDocumentServices = {
  serviceManager: ServiceManager.IManager;
  kernelId?: string;
};

type JupyterLexical = typeof import('@datalayer/jupyter-lexical');
type LexicalCore = typeof import('lexical');

let lexicalModule: JupyterLexical | undefined;
let coreModule: LexicalCore | undefined;

type Binding = {
  services: PageDocumentServices | undefined;
  kernel: Kernel | undefined;
};

/** A conversation's document: its editor, and the kernel its cells run on. */
type PageDocument = {
  id: string;
  built?: Promise<LexicalEditor>;
  binding: Binding;
  bindings: number;
  readyKernel: Kernel | undefined;
  waiters: Array<(kernel: Kernel) => void>;
};

const documents = new Map<string, PageDocument>();

function documentOf(conversation: string): PageDocument {
  let held = documents.get(conversation);
  if (!held) {
    held = {
      id: pageDocumentId(conversation),
      binding: { services: undefined, kernel: undefined },
      bindings: 0,
      readyKernel: undefined,
      waiters: [],
    };
    documents.set(conversation, held);
  }
  return held;
}

/** The id the tools and the store know a conversation's document by. */
export const pageDocumentId = (conversation = ''): string =>
  conversationScopedId(PAGE_DOCUMENT_ID, conversation);

/** The id of a conversation's panel editor, which mirrors it. */
export const pageDocumentViewId = (conversation = ''): string =>
  conversationScopedId(PAGE_DOCUMENT_VIEW_ID, conversation);

/**
 * A conversation's in-memory document (`conversationScope`), built and
 * registered once, under `page-document:<conversation>`; the page's one,
 * `page-document`, outside a workspace. Kept while its tab is hidden and
 * shown again; a new thread is another conversation, with a document of its
 * own.
 */
export function pageDocumentEditor(conversation = ''): Promise<LexicalEditor> {
  const held = documentOf(conversation);
  held.built ??= (async () => {
    const [
      { buildEditorFromExtensions, getExtensionDependencyFromEditor },
      core,
      { ReactPluginHostExtension, mountReactPluginHost },
      lexical,
    ] = await Promise.all([
      import('@lexical/extension'),
      import('lexical'),
      import('@lexical/react/ReactPluginHostExtension'),
      import('@datalayer/jupyter-lexical'),
    ]);
    lexicalModule = lexical;
    coreModule = core;
    const editor = buildEditorFromExtensions(
      core.defineExtension({
        name: '@datalayer/agent-runtimes/page-document',
        namespace: held.id,
        // The extension's React parts are hosted by the plugin host, on a
        // root that is never attached: an in-memory document draws nothing.
        dependencies: [
          ReactPluginHostExtension,
          lexical.JupyterLexicalExtension,
        ],
        onError(error: Error) {
          console.error('[page-document]', error);
        },
      }),
    );
    // Registered through the extension's signals, so the kernel's services,
    // known later, reach the adapter the tools use without rebuilding it.
    getExtensionDependencyFromEditor(
      editor,
      lexical.LexicalStateExtension,
    ).output.lexicalId.value = held.id;
    if (typeof document !== 'undefined') {
      mountReactPluginHost(editor, document.createElement('div'));
      await hostJupyter(editor, undefined);
    }
    editor.registerUpdateListener(() => attachKernel(editor, held));
    watchOutputs(editor);
    return editor;
  })();
  return held.built;
}

/**
 * Host jupyter-lexical's Jupyter plugin on the document with `kernel`, and
 * resolve once its handlers are registered (a child's effects run before its
 * parent's, so `Hosted`'s effect means the plugin's have run).
 */
async function hostJupyter(
  editor: LexicalEditor,
  kernel: Kernel | undefined,
): Promise<void> {
  const lexical = lexicalModule;
  if (!lexical) {
    return;
  }
  const { mountReactPluginElement } =
    await import('@lexical/react/ReactPluginHostExtension');
  await new Promise<void>(resolve => {
    mountReactPluginElement(editor, {
      key: 'page-document-jupyter',
      element: createElement(Hosted, {
        Plugin: lexical.JupyterInputOutputPlugin as ComponentType<{
          kernel?: Kernel;
        }>,
        kernel,
        onMounted: resolve,
      }),
    });
  });
}

function Hosted({
  Plugin,
  kernel,
  onMounted,
}: {
  Plugin: ComponentType<{ kernel?: Kernel }>;
  kernel?: Kernel;
  onMounted: () => void;
}) {
  useEffect(() => {
    onMounted();
  }, [onMounted]);
  return createElement(Plugin, { kernel });
}

/**
 * Run the document's cells on `services` (none: on nothing, until the panel
 * knows a kernel). The adapter the tools use gets the service manager
 * (`documentExecuteCodeInDocument` runs on it) and every output node the
 * kernel (`documentRunBlock` runs through them).
 */
export async function bindPageDocumentKernel(
  services: PageDocumentServices | undefined,
  conversation = '',
): Promise<void> {
  const editor = await pageDocumentEditor(conversation);
  const held = documentOf(conversation);
  const lexical = lexicalModule!;
  if (
    held.binding.services?.serviceManager === services?.serviceManager &&
    held.binding.services?.kernelId === services?.kernelId
  ) {
    return;
  }
  const turn = ++held.bindings;
  held.readyKernel = undefined;
  let kernel: Kernel | undefined;
  if (services) {
    const { Kernel: KernelClass } = await import('@datalayer/jupyter-react');
    const manager = services.serviceManager;
    kernel = new KernelClass({
      kernelName: 'python',
      kernelSpecName: 'python',
      kernelModel: services.kernelId
        ? ({ id: services.kernelId, name: 'python' } as never)
        : undefined,
      kernelManager: manager.kernels,
      kernelspecsManager: manager.kernelspecs,
      sessionManager: manager.sessions,
    });
  }
  if (turn !== held.bindings) {
    return;
  }
  held.binding = { services, kernel };
  const { getExtensionDependencyFromEditor } =
    await import('@lexical/extension');
  getExtensionDependencyFromEditor(
    editor,
    lexical.LexicalStateExtension,
  ).output.serviceManager.value = services?.serviceManager;
  await hostJupyter(editor, kernel);
  attachKernel(editor, held);
  void kernel?.ready.then(() => {
    if (held.binding.kernel !== kernel) {
      return;
    }
    held.readyKernel = kernel;
    const resolved = held.waiters;
    held.waiters = [];
    resolved.forEach(resolve => resolve(kernel));
  });
}

/** How long an agent's run waits for the page's kernel to start. */
export const KERNEL_WAIT_MS = 120_000;

/**
 * The document's kernel once it is ready: what a run by the agent waits for.
 * A public demo's Python starts in the browser and takes seconds; a run
 * before that ran on nothing and returned no output.
 */
export function pageDocumentKernel(
  timeoutMs: number = KERNEL_WAIT_MS,
  conversation = '',
): Promise<Kernel> {
  const held = documentOf(conversation);
  if (held.readyKernel) {
    return Promise.resolve(held.readyKernel);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      held.waiters = held.waiters.filter(waiter => waiter !== settle);
      reject(
        new Error(
          `The document's kernel did not start within ${Math.round(timeoutMs / 1000)} seconds.`,
        ),
      );
    }, timeoutMs);
    const settle = (kernel: Kernel) => {
      clearTimeout(timer);
      resolve(kernel);
    };
    held.waiters.push(settle);
  });
}

/** The output nodes of the editor whose state is being read. */
function $outputNodes() {
  const lexical = lexicalModule;
  const core = coreModule;
  if (!lexical || !core) {
    return [];
  }
  return core.$nodesOfType(lexical.JupyterOutputNode);
}

/** Give every output node of the in-memory document the bound kernel. */
function attachKernel(editor: LexicalEditor, held: PageDocument): void {
  const kernel = held.binding.kernel;
  editor.getEditorState().read(() => {
    for (const node of $outputNodes()) {
      const adapter = node.getLatest().__outputAdapter;
      if (adapter && adapter.kernel !== kernel) {
        adapter.kernel = kernel;
      }
    }
  });
}

/**
 * Write an output's results into its node when they arrive, so the update
 * reaches the other editor through the mirror: a run's outputs live in the
 * output area's model, which no Lexical update follows. The cells
 * jupyter-lexical inserts do this themselves; a cell that came through the
 * mirror (or a restored state) did not, and its results stayed in one
 * editor. Returns how to stop.
 */
export function watchOutputs(editor: LexicalEditor): () => void {
  const watched = new WeakSet<object>();
  return editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      for (const node of $outputNodes()) {
        const adapter = node.getLatest().__outputAdapter;
        const model = adapter?.outputArea?.model;
        if (!model || watched.has(adapter)) {
          continue;
        }
        watched.add(adapter);
        const key = node.getKey();
        model.changed.connect(() => {
          queueMicrotask(() => {
            editor.update(
              () => {
                const current = coreModule?.$getNodeByKey(key);
                if (
                  !current ||
                  !(current instanceof lexicalModule!.JupyterOutputNode) ||
                  current.__outputAdapter !== adapter
                ) {
                  return;
                }
                const outputs = model.toJSON();
                if (
                  JSON.stringify(current.getOutputs()) !==
                  JSON.stringify(outputs)
                ) {
                  current.setOutputs(outputs);
                }
              },
              { discrete: true },
            );
          });
        });
      }
    });
  });
}

/** Tags an update carries so the two editors do not echo each other. */
const FROM_MEMORY = 'page-document-from-memory';
const FROM_VIEW = 'page-document-from-view';

/**
 * Keep the panel's editor and the in-memory document the same: the view
 * starts from the document, the document's changes reach the view, and the
 * person's edits in the view reach the document, their cells' results
 * included. Returns how to stop.
 */
export function mirror(memory: LexicalEditor, view: LexicalEditor): () => void {
  view.setEditorState(view.parseEditorState(memory.getEditorState().toJSON()), {
    tag: FROM_MEMORY,
  });
  const toView = memory.registerUpdateListener(({ editorState, tags }) => {
    if (tags.has(FROM_VIEW)) {
      return;
    }
    view.setEditorState(view.parseEditorState(editorState.toJSON()), {
      tag: FROM_MEMORY,
    });
  });
  const toMemory = view.registerUpdateListener(
    ({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      if (
        tags.has(FROM_MEMORY) ||
        (dirtyElements.size === 0 && dirtyLeaves.size === 0)
      ) {
        return;
      }
      memory.setEditorState(memory.parseEditorState(editorState.toJSON()), {
        tag: FROM_VIEW,
      });
    },
  );
  const viewOutputs = watchOutputs(view);
  return () => {
    toView();
    toMemory();
    viewOutputs();
  };
}
