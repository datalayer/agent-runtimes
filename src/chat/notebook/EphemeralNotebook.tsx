/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * EphemeralNotebook — an in-memory Jupyter notebook rendered next to the chat.
 *
 * The notebook model lives purely in memory (the `nbformat` content below is
 * never persisted to a file) and is backed by a sandbox kernel obtained via
 * `useJupyter`. This mirrors the pattern used by the notebook editor and the
 * `NotebookNbformat` example, so the agent can drive the notebook through the
 * registered notebook frontend tools while nothing is written to disk.
 *
 * The container structure (relative wrapper + absolutely positioned inner box
 * + `#dla-Jupyter-Notebook` overrides) is copied from the notebook editor
 * (`NotebookEditorPanel`) so the cells get a resolved height and actually
 * render — a plain `height: 100%` collapses to zero inside a flex parent.
 *
 * @module chat/notebook/EphemeralNotebook
 */

import { useMemo } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import {
  Box,
  DatalayerThemeProvider,
  getThemeConfig,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import {
  Notebook,
  NotebookToolbar,
  CellSidebarExtension,
  CellSidebarButton,
  JupyterReactTheme,
  useJupyter,
} from '@datalayer/jupyter-react';

/**
 * Minimal in-memory notebook content. A single empty code cell is provided so
 * the notebook renders immediately and the agent can insert/update cells.
 */
const EPHEMERAL_NOTEBOOK_CONTENT: INotebookContent = {
  cells: [
    {
      cell_type: 'code',
      source: [''],
      metadata: {},
      outputs: [],
      execution_count: null,
    },
  ],
  metadata: {
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    },
    language_info: { name: 'python' },
  },
  nbformat: 4,
  nbformat_minor: 5,
};

export interface EphemeralNotebookProps {
  /**
   * Notebook identifier. Must match the id passed to `useNotebookTools` so the
   * agent's notebook frontend tools operate on this notebook instance.
   */
  notebookId: string;
  /** Left margin reserved for the cell sidebar (default 120). */
  cellSidebarMargin?: number;
}

/**
 * Renders an in-memory notebook backed by a sandbox kernel.
 */
export function EphemeralNotebook({
  notebookId,
  cellSidebarMargin = 120,
}: EphemeralNotebookProps) {
  // Obtain an in-memory service manager and a default sandbox kernel.
  const { serviceManager, defaultKernel } = useJupyter({
    startDefaultKernel: true,
  });

  // Resolve the active theme/color-mode exactly like the notebook editor
  // (NotebookEditorPanel) so the notebook honours dark / branded themes
  // instead of always rendering light.
  const { colorMode, theme: themeVariant } = useThemeStore();
  const systemMode = useSystemColorMode();
  const themeConfig = getThemeConfig(themeVariant);
  const resolvedMode = colorMode === 'auto' ? systemMode : colorMode;
  const modeStyles =
    resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light;
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';

  const extensions = useMemo(
    () => [new CellSidebarExtension({ factory: CellSidebarButton })],
    [],
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        bg: 'canvas.default',
      }}
    >
      {serviceManager ? (
        <DatalayerThemeProvider
          colorMode={colorMode}
          theme={themeConfig.primerTheme}
          themeStyles={themeConfig.themeStyles}
        >
          <JupyterReactTheme
            colormode={resolvedMode}
            backgroundColor={themeBackground}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                overscrollBehaviorY: 'contain',
                overflowAnchor: 'none',
                padding: 2,
                // Give the notebook a resolved height so cells render. The
                // Jupyter Notebook component renders its outer container with
                // id "dla-Jupyter-Notebook"; pin its toolbar and let the cell
                // area grow to fill the remaining space.
                '& #dla-Jupyter-Notebook': {
                  display: 'flex',
                  flexDirection: 'column',
                },
                '& #dla-Jupyter-Notebook > :first-of-type': {
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  flex: '0 0 auto',
                  background: 'var(--jp-layout-color0, transparent)',
                },
                '& #dla-Jupyter-Notebook > .dla-Box-Notebook': {
                  flex: '1 1 auto',
                  minHeight: 0,
                },
              }}
            >
              <Notebook
                nbformat={EPHEMERAL_NOTEBOOK_CONTENT}
                id={notebookId}
                serviceManager={serviceManager}
                kernel={defaultKernel}
                height="100%"
                cellSidebarMargin={cellSidebarMargin}
                extensions={extensions}
                Toolbar={NotebookToolbar}
              />
            </Box>
          </JupyterReactTheme>
        </DatalayerThemeProvider>
      ) : (
        <Box sx={{ p: 3, color: 'fg.muted' }}>Starting notebook…</Box>
      )}
    </Box>
  );
}

export default EphemeralNotebook;
