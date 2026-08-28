/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Entry point for the workspace example.
 *
 * Owns the providers, as every entry point does — the workspace mounts none of
 * its own (§3.5).
 *
 * @module loop-example-main
 */

// `@jupyter-widgets` assigns to a bare `__webpack_public_path__` at module
// scope, which Vite's `define` cannot rewrite because it rewrites reads and not
// assignment targets. Declaring it before anything else runs is what keeps a
// lazily-loaded chunk from throwing a ReferenceError.
const globals = globalThis as Record<string, unknown>;
if (globals['__webpack_public_path__'] === undefined) {
  globals['__webpack_public_path__'] = '';
}

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  DatalayerThemeProvider,
  setupPrimerPortals,
  themeConfigs,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import { LoopWorkspaceExample } from './examples/LoopWorkspaceExample';
import { internalQueryClient } from './utils';

import '../style/primer-primitives.css';

function Page(): JSX.Element {
  const { colorMode, theme } = useThemeStore();
  const systemColorMode = useSystemColorMode();
  const resolvedMode = colorMode === 'auto' ? systemColorMode : colorMode;
  const themeConfig = themeConfigs[theme];

  useEffect(() => {
    setupPrimerPortals();
  }, []);

  return (
    <DatalayerThemeProvider
      colorMode={resolvedMode}
      theme={themeConfig.primerTheme}
      themeStyles={themeConfig.themeStyles}
    >
      <QueryClientProvider client={internalQueryClient}>
        <LoopWorkspaceExample />
      </QueryClientProvider>
    </DatalayerThemeProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
