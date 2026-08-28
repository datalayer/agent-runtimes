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

import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { EphemeralDocument } from '../../../chat/document/EphemeralDocument';
import type { LoopViewProps } from '../../core';
import { useSandboxService } from '../code-sandbox';

export default function DocumentView({ workspace }: LoopViewProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);

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

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <EphemeralDocument
        // The entry point owns the theme; a second provider here would fight
        // it over BaseStyles and font tokens (§3.5, §3.6).
        inheritTheme
        documentId={`loop-${workspace.agentId || 'default'}`}
        runtimeOverride={
          snapshot.jupyterUrl ? { baseUrl: snapshot.jupyterUrl } : undefined
        }
      />
    </Box>
  );
}
