/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a coding agent changed in one file, as a unified diff (SHIELD §4.3,
 * SH-16): the path and the count in the header, each line signed and
 * coloured, the file's language on the block for a highlighter. What it
 * reads is `portable/displays`' (`protocolDisplayOf`, `unifiedDiffLines`),
 * so the phone draws the same thing from the same contract.
 *
 * @module apps/plugins/shield-displays/DiffCard
 */

import type { JSX } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  displayLine,
  unifiedDiffLines,
  type ProtocolDisplay,
} from '../../../portable';

export type DiffCardProps = {
  display: Extract<ProtocolDisplay, { kind: 'diff' }>;
};

const COLOURS = {
  context: { bg: 'transparent', fg: 'fg.muted', sign: ' ' },
  add: { bg: 'success.subtle', fg: 'success.fg', sign: '+' },
  remove: { bg: 'danger.subtle', fg: 'danger.fg', sign: '-' },
} as const;

export function DiffCard({ display }: DiffCardProps): JSX.Element {
  const lines = unifiedDiffLines(display.oldText, display.newText);
  return (
    <Box
      data-shield-display="diff"
      data-language={display.language}
      sx={{
        width: '100%',
        border: '1px solid',
        borderColor: 'border.default',
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
          {display.path}
        </Text>
        <Text sx={{ color: 'fg.muted' }}>{displayLine(display)}</Text>
      </Box>
      <Box
        as="pre"
        className={`language-${display.language}`}
        sx={{ m: 0, overflowX: 'auto', fontFamily: 'mono' }}
      >
        {lines.map((line, index) => (
          <Box
            as="span"
            key={index}
            data-diff-line={line.kind}
            sx={{
              display: 'block',
              px: 2,
              bg: COLOURS[line.kind].bg,
              color: COLOURS[line.kind].fg,
              whiteSpace: 'pre',
            }}
          >
            {COLOURS[line.kind].sign}
            {line.text}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
