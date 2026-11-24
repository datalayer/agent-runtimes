/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The document's Jupyter cells on the document's kernel, whenever it comes.
 *
 * jupyter-lexical's `JupyterInputOutputPlugin` hands its kernel to the
 * outputs it finds when the kernel changes, and to the cells it inserts. A
 * cell that arrives another way (the agent's document, mirrored into the
 * view as a whole new state) held no kernel, and a cell run before the
 * kernel was there answered "No runtime connected" (the user, 24 November
 * 2026, on a public demo whose Python starts in the browser). Here:
 *
 * - every output in the editor is kept on the kernel, after each update;
 * - while a kernel is on its way (`awaiting`), Shift+Enter in a cell says
 *   the cell waits, and the cell runs once the kernel is ready.
 *
 * @module chat/document/DocumentKernelPlugin
 */

import { useEffect, useRef, useState } from 'react';
import {
  $getSelection,
  $nodesOfType,
  COMMAND_PRIORITY_NORMAL,
  KEY_ENTER_COMMAND,
  type LexicalNode,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { Kernel } from '@datalayer/jupyter-react';
import {
  $isJupyterInputNode,
  $jupyterOutputNodeFor,
  JupyterInputNode,
  JupyterOutputNode,
} from '@datalayer/jupyter-lexical';

/** What a cell run before its kernel shows until it runs. */
export const WAITING_FOR_KERNEL_TEXT =
  'The kernel is starting; this cell runs once it is ready.\n';

function $inputAtSelection(): JupyterInputNode | null {
  let node: LexicalNode | null = $getSelection()?.getNodes()[0] ?? null;
  while (node && !$isJupyterInputNode(node)) {
    node = node.getParent();
  }
  return node as JupyterInputNode | null;
}

export function DocumentKernelPlugin({
  kernel,
  awaiting = false,
}: {
  kernel?: Kernel;
  awaiting?: boolean;
}): null {
  const [editor] = useLexicalComposerContext();
  const pending = useRef(new Set<string>());
  // The kernel once its session is up: before that a run is sent nowhere.
  const [ready, setReady] = useState<Kernel>();
  useEffect(() => {
    let current = true;
    setReady(undefined);
    void kernel?.ready.then(() => {
      if (current) {
        setReady(kernel);
      }
    });
    return () => {
      current = false;
    };
  }, [kernel]);
  const waiting = !ready && (awaiting || Boolean(kernel));

  // Every output on the kernel, including the ones a new state brought in.
  useEffect(() => {
    if (!kernel) {
      return;
    }
    const attach = () =>
      editor.getEditorState().read(() => {
        for (const node of $nodesOfType(JupyterOutputNode)) {
          const adapter = node.getLatest().__outputAdapter;
          if (adapter && adapter.kernel !== kernel) {
            adapter.kernel = kernel;
          }
        }
      });
    attach();
    return editor.registerUpdateListener(attach);
  }, [editor, kernel]);

  // A run before the kernel: noted, and said, rather than refused.
  useEffect(() => {
    if (!waiting) {
      return;
    }
    return editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      event => {
        if (!event?.shiftKey) {
          return false;
        }
        const input = $inputAtSelection();
        if (!input) {
          return false;
        }
        event.preventDefault();
        const uuid = input.getJupyterInputNodeUuid();
        pending.current.add(uuid);
        const output = $jupyterOutputNodeFor(uuid);
        if (output) {
          const notice = [
            {
              output_type: 'stream' as const,
              name: 'stdout' as const,
              text: [WAITING_FOR_KERNEL_TEXT],
            },
          ];
          const writable = output.getWritable();
          writable.__outputAdapter.setOutputs(notice);
          writable.setOutputs(notice);
          writable.__renderTrigger++;
        }
        return true;
      },
      // Above jupyter-lexical's own handler, which warns and gives up.
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor, waiting]);

  // The kernel came: run what waited for it.
  useEffect(() => {
    if (!ready || pending.current.size === 0) {
      return;
    }
    const uuids = [...pending.current];
    pending.current.clear();
    editor.update(() => {
      for (const uuid of uuids) {
        const input = $nodesOfType(JupyterInputNode).find(
          node => node.getJupyterInputNodeUuid() === uuid,
        );
        const output = $jupyterOutputNodeFor(uuid);
        if (!input || !output) {
          continue;
        }
        output.updateKernel(ready);
        output.executeCode(input.getTextContent());
      }
    });
  }, [editor, ready]);

  return null;
}

export default DocumentKernelPlugin;
