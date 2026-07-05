/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  Notebook,
  NotebookToolbar,
  CellSidebarExtension,
  CellSidebarButton,
} from '@datalayer/jupyter-react';
import { ServiceManager } from '@jupyterlab/services';

import nbformatExample from './notebooks/NotebookExample1.ipynb.json';

const NOTEBOOK_ID = 'notebook-example-1';
type INotebookExampleProps = {
  serviceManager?: ServiceManager.IManager;
};

export const NotebookExample = (props: INotebookExampleProps) => {
  const { serviceManager } = props;

  const extensions = useMemo(
    () => [new CellSidebarExtension({ factory: CellSidebarButton })],
    [],
  );

  if (!serviceManager) {
    return (
      <Box as="h1">
        A Jupyter Notebook
        <div>Loading...</div>
      </Box>
    );
  }

  return (
    <>
      <Box as="h1">A Jupyter Notebook</Box>
      <Notebook
        id={NOTEBOOK_ID}
        nbformat={nbformatExample}
        serviceManager={serviceManager}
        startDefaultKernel={true}
        extensions={extensions}
        Toolbar={NotebookToolbar}
      />
    </>
  );
};

export default NotebookExample;
