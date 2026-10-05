/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * jupyter-react's notebook, read-only and with no kernel: the notebook a
 * member of the team gave, as its balloon shows it (`NotebookPreview`).
 *
 * `readonly` makes every cell uneditable; `ServiceManagerLess` is a service
 * manager that reaches no server and starts no kernel, so nothing here runs
 * and no Pyodide is loaded — the notebook that runs is `TeamNotebook`'s, on
 * the browser sandbox. Loaded by `NotebookPreview` when a notebook is drawn,
 * never before.
 *
 * @module components/teams/NotebookPreviewView
 */

import type { CSSProperties, JSX } from 'react';
import { useMemo } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import { useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  JupyterReactTheme,
  Notebook,
  ServiceManagerLess,
} from '@datalayer/jupyter-react';
import type { NotebookDocument } from './NotebookPreview';
import {
  JUPYTER_DARK_VARIABLES,
  JUPYTER_LIGHT_VARIABLES,
} from './jupyterThemeVariables';

export type NotebookPreviewViewProps = {
  nbformat: NotebookDocument;
  /** Its height, in pixels: it scrolls within. */
  height: number;
};

/** Each preview has its own id in jupyter-react's store. */
let drawn = 0;

export function NotebookPreviewView({
  nbformat,
  height,
}: NotebookPreviewViewProps): JSX.Element {
  // A manager with no server and no kernel: nothing can run.
  const serviceManager = useMemo(() => new ServiceManagerLess(), []);
  // A new id, and a copy handed once, for each notebook: the notebook
  // component keeps, and edits in place, the document it is first handed.
  const id = useMemo(() => {
    drawn += 1;
    return `team-notebook-preview-${drawn}`;
  }, [nbformat]);
  const content = useMemo(
    () => JSON.parse(JSON.stringify(nbformat)) as INotebookContent,
    [nbformat],
  );
  const { colorScheme } = useTheme();
  const mode = colorScheme?.startsWith('dark') ? 'dark' : 'light';
  return (
    <Box
      data-notebook-preview-theme={mode}
      sx={{ height }}
      // JupyterLab writes its theme for the whole page, so two previews in
      // two modes would share the last one written: each carries its own
      // mode's variables on its own subtree.
      style={
        (mode === 'dark'
          ? JUPYTER_DARK_VARIABLES
          : JUPYTER_LIGHT_VARIABLES) as CSSProperties
      }
    >
      {/*
        A theme's mark (jupyter-react marks each JupyterReactTheme so): the
        theme below takes itself for a nested one, and styles its own subtree
        in this mode without writing the mode the page shares — two previews
        in two modes side by side would write it in turn, forever.
      */}
      <span data-jupyter-react-theme-root="notebook-preview" hidden />
      <JupyterReactTheme colormode={mode}>
        <Box
          data-notebook-preview-view={id}
          sx={{
            height,
            // No toolbar: no room kept for one.
            '& .datalayer-NotebookPanel-header': {
              display: 'none',
              minHeight: 0,
            },
            // Small, as a balloon holds it: no prompts, no sidebars, no
            // collapsers, the headings a step down.
            '& .jp-InputPrompt, & .jp-OutputPrompt, & .jp-Collapser, & .jp-cell-toolbar, & .jp-Notebook-footer':
              { display: 'none !important' },
            '& .jp-Notebook': { padding: '4px !important', fontSize: '12px' },
            '& .jp-Cell': { padding: '2px 0 !important' },
            '& .jp-Cell .jp-InputArea-editor, & .jp-Cell .jp-OutputArea-output':
              { marginLeft: '0 !important' },
            '& .jp-RenderedHTMLCommon': { paddingRight: 0, fontSize: '12px' },
            '& .jp-RenderedHTMLCommon :is(h1, h2, h3, h4)': {
              fontSize: '14px',
              margin: '2px 0',
            },
            '& .jp-RenderedHTMLCommon .jp-InternalAnchorLink': {
              display: 'none',
            },
          }}
        >
          <Notebook
            id={id}
            nbformat={content}
            readonly
            serviceManager={serviceManager}
            startDefaultKernel={false}
            height={`${height}px`}
            cellSidebarMargin={0}
          />
        </Box>
      </JupyterReactTheme>
    </Box>
  );
}

export default NotebookPreviewView;
