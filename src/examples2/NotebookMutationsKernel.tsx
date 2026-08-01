/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, SegmentedControl, Label, Text } from '@primer/react';
import { INotebookContent } from '@jupyterlab/nbformat';
import { Session, ServiceManager } from '@jupyterlab/services';
import {
  createLiteServiceManager,
  createServerSettings,
  setJupyterServerUrl,
  getJupyterServerUrl,
  getJupyterServerToken,
  setJupyterServerToken,
  ServiceManagerLess,
  loadJupyterConfig,
  OnSessionConnection,
  useNotebookStore,
  Notebook,
  SpinnerCentered,
  JupyterReactTheme,
} from '@datalayer/jupyter-react';
import { useCoreStore } from '../state';
import { createDatalayerServiceManager } from '../services/DatalayerServiceManager';

import nbformatExample from './notebooks/NotebookExample1.ipynb.json';

const NOTEBOOK_ID = 'notebook-mutations-id';
const LOCAL_JUPYTER_SERVER_URL = 'http://0.0.0.0:8888/api/jupyter-server';
const LOCAL_JUPYTER_SERVER_TOKEN =
  '60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6';

loadJupyterConfig();

const SERVICE_MANAGER_LESS = new ServiceManagerLess();

const NotebookMutationsKernel = () => {
  const [index, setIndex] = useState(0);
  const [nbformat, setNbformat] = useState(nbformatExample as INotebookContent);
  const [readonly, setReadonly] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [lite, setLite] = useState(false);
  const [serviceManager, setServiceManager] = useState<
    ServiceManager.IManager | ServiceManagerLess
  >(SERVICE_MANAGER_LESS);
  const [sessions, setSessions] = useState<Array<Session.ISessionConnection>>(
    [],
  );
  const { configuration } = useCoreStore();
  const notebookStore = useNotebookStore();
  const notebook = notebookStore.selectNotebook(NOTEBOOK_ID);
  const getCurrentNotebookContent = (): INotebookContent => {
    const adapter = notebook?.adapter as
      | {
          notebookPanel?: { content?: { model?: { toJSON?: () => unknown } } };
        }
      | undefined;
    return ((adapter?.notebookPanel?.content?.model?.toJSON?.() as
      INotebookContent | undefined) ?? nbformatExample) as INotebookContent;
  };
  const onSessionConnection: OnSessionConnection = (
    session: Session.ISessionConnection | undefined,
  ) => {
    if (session) {
      setSessions(sessions.concat(session));
    }
  };
  const changeIndex = (index: number) => {
    setIndex(index);
    setJupyterServerToken(getJupyterServerToken() || LOCAL_JUPYTER_SERVER_TOKEN);
    switch (index) {
      case 0: {
        setNbformat(getCurrentNotebookContent());
        setReadonly(true);
        setLite(false);
        setServiceManager(SERVICE_MANAGER_LESS);
        break;
      }
      case 1: {
        setJupyterServerUrl(LOCAL_JUPYTER_SERVER_URL);
        createLiteServiceManager().then(liteServiceManager => {
          setServiceManager(liteServiceManager);
          setNbformat(getCurrentNotebookContent());
          setReadonly(false);
          setLite(true);
        });
        break;
      }
      case 2: {
        setJupyterServerUrl(LOCAL_JUPYTER_SERVER_URL);
        setNbformat(getCurrentNotebookContent());
        setReadonly(false);
        setLite(false);
        const serverSettings = createServerSettings(
          getJupyterServerUrl(),
          getJupyterServerToken(),
        );
        const serviceManager = new ServiceManager({ serverSettings });
        (serviceManager as any)['__NAME__'] = 'MutatingServiceManager';
        setServiceManager(serviceManager);
        break;
      }
      case 3: {
        //        setWaiting(true);
        setLite(false);
        createDatalayerServiceManager(
          configuration?.cpuEnvironment || 'python-simple-env',
          configuration?.credits || 1,
        ).then(serviceManager => {
          (serviceManager as any)['__NAME__'] = 'DatalayerCPUServiceManager';
          setServiceManager(serviceManager);
          setReadonly(false);
          setNbformat(getCurrentNotebookContent());
          //          setWaiting(false);
        });
        break;
      }
      case 4: {
        setWaiting(true);
        setLite(false);
        createDatalayerServiceManager(
          configuration?.gpuEnvironment || 'pytorch-cuda-env',
          configuration?.credits || 1,
        ).then(serviceManager => {
          (serviceManager as any)['__NAME__'] = 'DatalayerGPUServiceManager';
          setServiceManager(serviceManager);
          setNbformat(getCurrentNotebookContent());
          setReadonly(false);
          setWaiting(false);
        });
        break;
      }
    }
  };
  return (
    <JupyterReactTheme>
      <>
        <Box display="flex">
          <Box>
            <SegmentedControl
              onChange={index => changeIndex(index)}
              aria-label="jupyter-react-example"
            >
              <SegmentedControl.Button defaultSelected={index === 0}>
                Readonly
              </SegmentedControl.Button>
              <SegmentedControl.Button defaultSelected={index === 1}>
                Browser Kernel
              </SegmentedControl.Button>
              <SegmentedControl.Button defaultSelected={index === 2}>
                OSS Kernel (CPU)
              </SegmentedControl.Button>
              <SegmentedControl.Button defaultSelected={index === 3}>
                Kernel (CPU)
              </SegmentedControl.Button>
              <SegmentedControl.Button defaultSelected={index === 4}>
                Kernel (GPU)
              </SegmentedControl.Button>
            </SegmentedControl>
          </Box>
          <Box ml={1} mt={1}>
            {/*
            <Label>Readonly: {String(notebook?.adapter?.readonly)}</Label>
            <Label>Serverless: {String(notebook?.adapter?.serverless)}</Label>
            */}
            <Label>Lite: {String(lite)}</Label>
            <Label>
              Service Manager URL: {serviceManager.serverSettings.baseUrl}
            </Label>
            <Label>
              Service Manager is ready: {String(serviceManager.isReady)}
            </Label>
            <Label>Kernel ID: {notebook?.adapter?.kernel?.id}</Label>
          </Box>
        </Box>
        <Box>
          <Text as="h3">Kernel Sessions</Text>
        </Box>
        <Box>
          {sessions.map(session => {
            return (
              <Box key={session.id}>
                <Text>
                  {session.name} {session.id} <Label>Kernel</Label> clientId [
                  {session.kernel?.clientId}) - id {session.kernel?.id}
                </Text>
              </Box>
            );
          })}
        </Box>
        {waiting ? (
          <SpinnerCentered />
        ) : (
          <Notebook
            height="calc(100vh - 2.6rem)"
            id={NOTEBOOK_ID}
            nbformat={nbformat as INotebookContent}
            onSessionConnection={onSessionConnection}
            readonly={readonly}
            serviceManager={serviceManager as ServiceManager.IManager}
          />
        )}
      </>
    </JupyterReactTheme>
  );
};

export default NotebookMutationsKernel;

// For standalone testing
if (typeof window !== 'undefined' && window.location.pathname === '/test') {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  root.render(<NotebookMutationsKernel />);
}
