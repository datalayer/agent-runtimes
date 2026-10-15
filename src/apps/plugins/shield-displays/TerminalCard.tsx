/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a coding agent ran (SHIELD §4.3, SH-16): the command in the header,
 * the output kept after the terminal was released, and how it ended — the
 * exit code, or *running* while it runs. What it reads is
 * `portable/displays`' (`protocolDisplayOf`), the phone's contract too.
 *
 * @module apps/plugins/shield-displays/TerminalCard
 */

import type { JSX } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { displayLine, type ProtocolDisplay } from '../../../portable';

export type TerminalCardProps = {
  display: Extract<ProtocolDisplay, { kind: 'terminal' }>;
};

export function TerminalCard({ display }: TerminalCardProps): JSX.Element {
  const failed = display.exitCode !== null && display.exitCode !== 0;
  return (
    <Box
      data-shield-display="terminal"
      data-exit-code={display.exitCode === null ? 'running' : display.exitCode}
      sx={{
        width: '100%',
        border: '1px solid',
        borderColor: failed ? 'danger.muted' : 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
        fontSize: 0,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          bg: 'canvas.subtle',
          borderBottom: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Text sx={{ fontFamily: 'mono', fontWeight: 'bold' }}>
          {display.command ? `$ ${display.command}` : display.terminalId}
        </Text>
        <Text sx={{ color: failed ? 'danger.fg' : 'fg.muted' }}>
          {displayLine(display)}
        </Text>
      </Box>
      <Box
        as="pre"
        sx={{
          m: 0,
          px: 2,
          py: 1,
          overflowX: 'auto',
          fontFamily: 'mono',
          whiteSpace: 'pre-wrap',
          bg: 'canvas.default',
        }}
      >
        {display.output || (display.exitCode === null ? '…' : '(no output)')}
      </Box>
    </Box>
  );
}
