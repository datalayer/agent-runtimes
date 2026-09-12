/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  Notebook,
  CellSidebarExtension,
  CellSidebarButton,
} from '@datalayer/jupyter-react';
import { ThemedJupyterProvider } from './utils/themedProvider';
import { ServiceManager } from '@jupyterlab/services';
import nbformatExample from './utils/notebooks/NotebookExample1.ipynb.json';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';

const NOTEBOOK_ID = 'notebook-example-1';
type IJupyterNotebookExampleProps = {
  serviceManager?: ServiceManager.IManager;
};

export const JupyterNotebookExample = (props: IJupyterNotebookExampleProps) => {
  const { serviceManager } = props;

  const extensions = useMemo(
    () => [new CellSidebarExtension({ factory: CellSidebarButton })],
    [],
  );

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: 3,
      }}
    >
      <Box
        sx={{
          marginBottom: 3,
          paddingBottom: 3,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Box as="h1" sx={{ margin: 0 }}>
          Notebook Example
        </Box>
        <p>
          A notebook on the selected sandbox, with the kernel indicator in its
          toolbar.
        </p>
      </Box>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          padding: 3,
          backgroundColor: 'canvas.default',
        }}
      >
        {serviceManager ? (
          <ThemedJupyterProvider>
            <Notebook
              id={NOTEBOOK_ID}
              nbformat={nbformatExample}
              serviceManager={serviceManager}
              startDefaultKernel={true}
              extensions={extensions}
              Toolbar={ExampleNotebookToolbar}
              height="calc(100vh - 300px)"
              cellSidebarMargin={120}
            />
          </ThemedJupyterProvider>
        ) : (
          <Box sx={{ padding: 3 }}>
            <p>Loading service manager...</p>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default JupyterNotebookExample;
