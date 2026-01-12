/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useJupyter, JupyterReactTheme } from '@datalayer/jupyter-react';
import { JupyterCellExample } from './examples/JupyterCellExample';
import { JupyterNotebookExample } from './examples/JupyterNotebookExample';

import './App.css';

export function App() {
  const { serviceManager } = useJupyter({
    jupyterServerUrl: 'https://oss.datalayer.run/api/jupyter-server',
    jupyterServerToken:
      '60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6',
    startDefaultKernel: true,
  });
  return (
    <JupyterReactTheme>
      {serviceManager && <JupyterCellExample serviceManager={serviceManager} />}
      {serviceManager && (
        <JupyterNotebookExample serviceManager={serviceManager} />
      )}
    </JupyterReactTheme>
  );
}

export default App;
