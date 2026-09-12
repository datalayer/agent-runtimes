/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sandbox view: what is running, and how to reach it.
 *
 * The browser twin of `/code-sandbox` in the terminal — the same facts, drawn
 * rather than printed.
 *
 * @module loop/plugins/agents/SandboxView
 */

import type { JSX } from 'react';
import { Box, Label, Text } from '@primer/react';
import { useSignalValue } from '@datalayer/reactor/react';
import type { LoopViewProps } from '../../core';
import { useSandboxService } from './useSandboxService';

function Row({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', gap: 3, py: 1, fontSize: 1 }}>
      <Text sx={{ color: 'fg.muted', minWidth: '140px' }}>{label}</Text>
      <Text sx={{ fontFamily: 'mono', wordBreak: 'break-all' }}>
        {value || <Text sx={{ color: 'fg.subtle' }}>—</Text>}
      </Text>
    </Box>
  );
}

export default function SandboxView(_props: LoopViewProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);
  const status = useSignalValue(service.status);
  const lastExecution = useSignalValue(service.lastExecution);

  const tone =
    snapshot.state === 'running'
      ? 'success'
      : snapshot.state === 'error'
        ? 'danger'
        : 'attention';

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', px: 4, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Text sx={{ fontSize: 3, fontWeight: 'bold' }}>Code Sandbox</Text>
        <Label variant={tone}>{snapshot.state}</Label>
      </Box>

      <Row label="Variant" value={snapshot.variant} />
      <Row label="Kernel" value={status?.kernel_name ?? snapshot.kernelId} />
      <Row label="Kernel id" value={snapshot.kernelId} />
      <Row label="Jupyter server" value={snapshot.jupyterUrl} />
      <Row label="Execution state" value={status?.execution_state} />

      {snapshot.state !== 'running' ? (
        <Box
          sx={{
            mt: 3,
            p: 3,
            bg: 'attention.subtle',
            borderRadius: 2,
            fontSize: 1,
          }}
        >
          No sandbox is attached. Views that need one — the notebook, the
          document — stay unavailable until there is a kernel to bind to.
        </Box>
      ) : null}

      {lastExecution ? (
        <Box sx={{ mt: 4 }}>
          <Text sx={{ fontSize: 2, fontWeight: 'bold' }}>Last execution</Text>
          <Box
            sx={{
              mt: 2,
              p: 2,
              bg: 'canvas.subtle',
              borderRadius: 2,
              fontFamily: 'mono',
              fontSize: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {lastExecution.code}
          </Box>
          {lastExecution.stdout ? (
            <Box
              sx={{
                mt: 1,
                fontFamily: 'mono',
                fontSize: 0,
                whiteSpace: 'pre-wrap',
              }}
            >
              {lastExecution.stdout}
            </Box>
          ) : null}
          {lastExecution.error ? (
            <Box
              sx={{
                mt: 1,
                color: 'danger.fg',
                fontFamily: 'mono',
                fontSize: 0,
              }}
            >
              {lastExecution.error}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
