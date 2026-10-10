/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's computer, beside its page (LOOP R-23).
 *
 * An application whose browse, files and shell are on, drawn as the Studio's Preview
 * draws it — `AppRenderer` with its `sidebar` — on the Local target: its
 * agent runs on the local agent-runtimes server, and the computer view beside
 * it shows the page its browser has open, what ran on its sandbox, its
 * files, and *Take over* — clicks and typing then go to its page — and
 * *Hand back*.
 *
 * @module examples/LoopAppComputerExample
 */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { AppRenderer } from '../apps/apps/AppRenderer';
import { APP_CATALOGUE } from '../specs/apps';
import type { AppSpec } from '../types/agentspecs';

setupPrimerPortals();

/** Web Research, given a computer with its files and its shell on. */
function computerDesk(): AppSpec {
  const base = APP_CATALOGUE['web-research'];
  return {
    ...base,
    id: 'computer-desk',
    name: 'Computer Desk',
    emoji: '🖥️',
    description:
      'Works on its own computer: opens web pages, runs code, reads and writes files.',
    connections: [],
    rules: [],
    instructions:
      'You have a computer: open web pages in its browser, run Python on it with your tools, and keep what you make in files there.',
    interface: {
      ...base.interface,
      welcome: 'I work on my own computer. Ask me to compute something.',
      starters: [
        {
          label: 'Open a page',
          message:
            'Open https://example.com in your browser, tell me its title and take a screenshot.',
        },
        {
          label: 'Write a file',
          message:
            'Run Python that writes the squares of 1 to 5 in squares.txt, then print the file.',
        },
      ],
    },
    permissions: {
      ...base.permissions,
      computer: { browse: true, files: true, shell: true },
    },
  };
}

const LoopAppComputerExample: React.FC = () => {
  const app = useMemo(computerDesk, []);
  return (
    <ThemedProvider>
      <Box height="100vh" minHeight={0}>
        <AppRenderer
          app={app}
          // The examples Vite server has no /api proxy.
          serverUrl={resolveExampleAgentRuntimesUrl('local')}
          target="local"
          sidebar
        />
      </Box>
    </ThemedProvider>
  );
};

export default LoopAppComputerExample;
