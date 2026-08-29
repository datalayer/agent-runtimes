/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The document view: the ephemeral Lexical document, bound to the sandbox.
 *
 * This module is only ever reached through the view's `load()` thunk, which is
 * what keeps `@datalayer/jupyter-lexical` — and the Lumino nodes it initialises
 * on import — out of the shell's bundle until someone opens a document.
 *
 * @module loop/plugins/document/DocumentView
 */

import type { ServiceManager } from '@jupyterlab/services';
import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';
import {
  LoopDocumentToolbar,
  LoopDocumentToolbarItem,
  type ChatSurfaceProps,
} from '../../core';
import { useEditorToolbar } from '../../core/toolbar';
import { useSandboxService } from '../agents';

export default function DocumentView({
  workspace,
}: ChatSurfaceProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);
  const documentId = `loop-${workspace.agentId || 'default'}`;

  // Read before the early return, not after: the hook count must not depend on
  // whether a sandbox happens to be running. As with the notebook, the bar
  // itself belongs to a plugin — switch that off and the document has no
  // toolbar rather than an empty one.
  const toolbar = useEditorToolbar(
    LoopDocumentToolbar,
    LoopDocumentToolbarItem,
    {
      workspace,
      editorId: documentId,
    },
  );

  if (snapshot.state !== 'running') {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'fg.muted',
          fontSize: 1,
          px: 4,
          textAlign: 'center',
        }}
      >
        <Text>
          The document needs a running sandbox for its code blocks. Open the
          Sandbox view to see what it is doing.
        </Text>
      </Box>
    );
  }

  // A browser sandbox already owns its kernel; binding to that manager is what
  // puts the agent's code blocks and the reader's in the same one. A server
  // sandbox is reached by URL, as before, and returns null here. The notebook
  // view does exactly this — the document simply never did, which is why it
  // came up blank on Pyodide.
  const browserManager =
    (service.getServiceManager() as ServiceManager.IManager | null) ??
    undefined;

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <EphemeralDocument
        // The entry point owns the theme; a second provider here would fight
        // it over BaseStyles and font tokens (§3.5, §3.6).
        inheritTheme
        documentId={documentId}
        serviceManager={browserManager}
        showToolbar={toolbar.present}
        toolbarExtraItems={toolbar.items}
        // Join the sandbox's kernel rather than starting a rival one.
        kernelId={browserManager ? snapshot.kernelId : undefined}
        runtimeOverride={
          !browserManager && snapshot.jupyterUrl
            ? {
                baseUrl: snapshot.jupyterUrl,
                // Without the token the server refuses every request and the
                // cell runs into silence — no kernel, no output, no error the
                // reader can act on.
                token: snapshot.jupyterToken,
              }
            : undefined
        }
      />
    </Box>
  );
}
