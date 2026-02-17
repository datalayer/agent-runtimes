/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  JupyterReactTheme,
  Notebook,
  NotebookToolbar,
  CellSidebarExtension,
  CellSidebarButton,
} from '@datalayer/jupyter-react';
import { ServiceManager } from '@jupyterlab/services';
import nbformatExample from './stores/notebooks/NotebookExample1.ipynb.json';

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
    <>
      <Box as="h1">Jupyter Notebook Example</Box>
      {serviceManager && (
        <JupyterReactTheme>
          <Notebook
            id={NOTEBOOK_ID}
            nbformat={nbformatExample}
            serviceManager={serviceManager}
            startDefaultKernel={true}
            extensions={extensions}
            Toolbar={NotebookToolbar}
          />
        </JupyterReactTheme>
      )}
    </>
  );
};

export default JupyterNotebookExample;
