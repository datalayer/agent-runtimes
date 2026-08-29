/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The notebook view: the ephemeral notebook, bound to the sandbox the base
 * plugin owns.
 *
 * @module loop/plugins/notebook/NotebookView
 */

import type { ServiceManager } from '@jupyterlab/services';
import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { EphemeralNotebook } from '../../../chat/notebook/EphemeralNotebook';
import {
  LoopNotebookToolbar,
  LoopNotebookToolbarItem,
  type ChatSurfaceProps,
} from '../../core';
import { useEditorToolbar } from '../../core/toolbar';
import { useSandboxService } from '../agents';

export default function NotebookView({
  workspace,
}: ChatSurfaceProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);
  // Named once: it identifies the notebook to its store, and it is what a
  // toolbar item is handed so it can report on *this* notebook.
  const notebookId = workspace.surfaceId;

  // The toolbar is not this view's to draw. It offers the point, and a plugin
  // provides the bar; with that plugin switched off there is no toolbar here
  // at all, not an empty one. Items come from whoever adds to it — the toolbar
  // plugin's kernel light, the chat's agent actions — and this view names none
  // of them. It used to hardcode two buttons that submitted prompts, which
  // meant the notebook knew about the chat.
  const toolbar = useEditorToolbar(
    LoopNotebookToolbar,
    LoopNotebookToolbarItem,
    {
      workspace,
      editorId: notebookId,
    },
  );

  // The switcher's `canOpen` gate should have kept this view shut, but a
  // sandbox can go away while it is on screen — say so rather than rendering a
  // notebook wired to nothing.
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
          The notebook needs a running sandbox. Open the Sandbox view to see
          what it is doing.
        </Text>
      </Box>
    );
  }

  // A browser sandbox already owns its kernel; binding to that manager is what
  // puts the agent's executions and the reader's cells in the same one. A
  // server sandbox is reached by URL, as before, and returns null here.
  const browserManager =
    (service.getServiceManager() as ServiceManager.IManager | null) ??
    undefined;

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <EphemeralNotebook
        // The entry point owns the theme; a second provider here would fight
        // it over BaseStyles and font tokens (§3.5, §3.6).
        inheritTheme
        notebookId={notebookId}
        serviceManager={browserManager}
        // Join the sandbox's kernel rather than starting a rival one.
        kernelId={browserManager ? snapshot.kernelId : undefined}
        showToolbar={toolbar.present}
        toolbarExtraItems={toolbar.items}
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
