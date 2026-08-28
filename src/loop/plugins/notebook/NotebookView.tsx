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

import { useMemo } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import { FoldIcon, SyncIcon } from '@primer/octicons-react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { EphemeralNotebook } from '../../../chat/notebook/EphemeralNotebook';
import type { LoopViewProps } from '../../core';
import { useSandboxService } from '../code-sandbox';

export default function NotebookView({ workspace }: LoopViewProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);

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

  // The specialists are reached the way a person would reach them — by asking.
  // A button that called a private API would be a second way to invoke an agent
  // that could drift from the one people type, so these submit the same prompt
  // through the same channel.
  const toolbarExtraItems = useMemo<ToolbarItem[]>(
    () => [
      {
        key: 'loop-compact',
        type: 'button',
        ariaLabel: 'Compact this notebook',
        title: 'Ask @NotebookCompactor to shorten it without changing results',
        icon: FoldIcon,
        order: 200,
        group: 'loop',
        onClick: () => {
          workspace.prompts.submit(
            '@NotebookCompactor compact this notebook without changing what it computes.',
          );
        },
      },
      {
        key: 'loop-reproduce',
        type: 'button',
        ariaLabel: 'Check reproducibility',
        title: 'Ask @NotebookReproducer to run it on a fresh sandbox',
        icon: SyncIcon,
        order: 201,
        group: 'loop',
        onClick: () => {
          workspace.prompts.submit(
            '@NotebookReproducer run this notebook top to bottom on a fresh sandbox and report what does not reproduce.',
          );
        },
      },
    ],
    [workspace.prompts],
  );

  // A browser sandbox already owns its kernel; binding to that manager is what
  // puts the agent's executions and the reader's cells in the same one. A
  // server sandbox is reached by URL, as before, and returns null here.
  const browserManager =
    (service.getServiceManager() as ServiceManager.IManager | null) ?? undefined;

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <EphemeralNotebook
        // The entry point owns the theme; a second provider here would fight
        // it over BaseStyles and font tokens (§3.5, §3.6).
        inheritTheme
        notebookId={`loop-${workspace.agentId || 'default'}`}
        serviceManager={browserManager ?? undefined}
        // Join the sandbox's kernel rather than starting a rival one.
        kernelId={browserManager ? snapshot.kernelId : undefined}
        toolbarExtraItems={toolbarExtraItems}
        runtimeOverride={
          !browserManager && snapshot.jupyterUrl
            ? { baseUrl: snapshot.jupyterUrl }
            : undefined
        }
      />
    </Box>
  );
}
