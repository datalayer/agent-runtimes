/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */
import { createDatalayerServiceManager } from '../services/DatalayerServiceManager';

import { useState, useEffect, useMemo } from 'react';
import { Checkbox, FormControl, Heading } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { INotebookContent } from '@jupyterlab/nbformat';
import { ServiceManager } from '@jupyterlab/services';
import {
  loadJupyterConfig,
  Notebook,
  JupyterCollaborationProvider,
} from '@datalayer/jupyter-react';
import { DatalayerCollaborationProvider } from '../collaboration';
import { useCoreStore } from '../state';
import { ThemedJupyterProvider } from './utils/themedProvider';
import { useRuntimeTargetStore } from './utils/runtimeTargetStore';

import nbformatExample from './utils/notebooks/NotebookExample1.ipynb.json';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';

// This corresponds to the notebook ID in the URL when you open an existing notbook in your library
const NOTEBOOK_ID = '01JZQRQ35GG871QQCZW9TB1A8J';
const ROOM_PATH = 'notebook-collaboration-example.ipynb';

/**
 * Example demonstrating how to use Datalayer services with Notebook
 *
 * This example shows:
 * 1. How to create and use DatalayerServiceManager for runtime management
 * 2. How to create and use DatalayerCollaborationProvider for real-time collaboration
 * 3. How to enable/disable Datalayer collaboration
 * 4. How to pass these to the base Notebook component
 * 5. Graceful fallback when Datalayer credentials are not available
 */
type INotebookCollaborationExampleProps = {
  serviceManager?: ServiceManager.IManager;
};

const NotebookCollaborationExample = (
  props: INotebookCollaborationExampleProps,
) => {
  // Load config on component mount
  loadJupyterConfig();

  const [nbformat] = useState(nbformatExample as INotebookContent);
  const [enableCollaboration, setEnableCollaboration] = useState(false);
  const [readonly] = useState(false);
  const [serviceManager, setServiceManager] = useState<
    ServiceManager.IManager | undefined
  >(props.serviceManager);
  const [collaborationReady, setCollaborationReady] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(
    null,
  );

  const { configuration } = useCoreStore();
  const runtimeTarget = useRuntimeTargetStore(state => state.target);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      if (!enableCollaboration || !serviceManager) {
        setCollaborationReady(false);
        setCollaborationError(null);
        return;
      }
      setCollaborationReady(false);
      setCollaborationError(null);
      if (runtimeTarget === 'datalayer') {
        setCollaborationReady(true);
        return;
      }
      try {
        await serviceManager.ready;
        try {
          await serviceManager.contents.get(ROOM_PATH, { content: false });
        } catch (error) {
          if (
            (error as { response?: { status?: number } }).response?.status !==
            404
          )
            throw error;
          try {
            await serviceManager.contents.save(ROOM_PATH, {
              type: 'notebook',
              format: 'json',
              content: nbformat,
            });
          } catch (saveError) {
            // Some Jupyter backends create the file but return a response that
            // the contents client cannot decode. Verify before reporting it.
            try {
              await serviceManager.contents.get(ROOM_PATH, { content: false });
            } catch {
              throw saveError;
            }
          }
        }
        // Do not open the collaboration websocket until the room file is
        // observable through the same service manager.
        await serviceManager.contents.get(ROOM_PATH, { content: false });
        if (!cancelled) setCollaborationReady(true);
      } catch (error) {
        console.error('Failed to prepare collaboration room:', error);
        if (!cancelled) {
          setCollaborationReady(false);
          setCollaborationError(String(error));
        }
      }
    };
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [enableCollaboration, nbformat, runtimeTarget, serviceManager]);
  useEffect(() => {
    // Create DatalayerServiceManager if not provided
    const createManager = async () => {
      if (props.serviceManager) {
        // Use provided service manager (should be DatalayerServiceManager from main.tsx)
        // Wait for it to be ready
        await props.serviceManager.ready;
        return;
      }

      // Create DatalayerServiceManager if we have credentials
      if (configuration?.token && configuration?.spacerUrl) {
        try {
          // Now we can pass undefined to use config/defaults
          const manager = await createDatalayerServiceManager(
            configuration?.cpuEnvironment,
            configuration?.credits,
          );
          await manager.ready;
          setServiceManager(manager);
        } catch (error) {
          console.error('Failed to create DatalayerServiceManager:', error);
        }
      } else {
        console.warn(
          'Datalayer credentials not configured. Please set spacerUrl and token.',
        );
      }
    };

    createManager();
  }, [props.serviceManager, configuration]);

  // Each Notebook owns its own shared model, so each pane needs a separate
  // provider. Both providers point at the same real library document.
  const collaborationProviders = useMemo(() => {
    if (!enableCollaboration || !collaborationReady) {
      return [undefined, undefined] as const;
    }

    if (runtimeTarget === 'local') {
      const config = {
        path: ROOM_PATH,
        serverSettings: serviceManager?.serverSettings,
      };
      return [
        new JupyterCollaborationProvider(config),
        new JupyterCollaborationProvider(config),
      ] as const;
    }

    const spacerUrl = configuration?.spacerUrl;
    const token = configuration?.token;
    if (!spacerUrl || !token) return [undefined, undefined] as const;
    return [
      new DatalayerCollaborationProvider({ spacerUrl, token }),
      new DatalayerCollaborationProvider({ spacerUrl, token }),
    ] as const;
  }, [
    enableCollaboration,
    collaborationReady,
    runtimeTarget,
    configuration?.spacerUrl,
    configuration?.token,
  ]);

  const [collaborationProvider1, collaborationProvider2] =
    collaborationProviders;

  // Close websocket connections when collaboration is disabled or the example
  // is unmounted. This also prevents stale providers from keeping a notebook
  // in its loading state after toggling the checkbox.
  useEffect(() => {
    return () => {
      collaborationProviders.forEach(provider => provider?.dispose());
    };
  }, [collaborationProviders]);

  return (
    <ThemedJupyterProvider>
      <Box p={3}>
        <Heading as="h2" sx={{ mb: 3 }}>
          Notebook Collaboration Example
        </Heading>

        <Box sx={{ mb: 3 }}>
          <FormControl>
            <Checkbox
              checked={enableCollaboration}
              onChange={e => setEnableCollaboration(e.target.checked)}
            />
            <FormControl.Label>
              Enable Datalayer Collaboration
            </FormControl.Label>
          </FormControl>
          {enableCollaboration && runtimeTarget !== 'datalayer' && (
            <Box sx={{ mt: 1, color: 'fg.muted', fontSize: 0 }}>
              Real-time Datalayer collaboration requires the cloud runtime
              target. Local mode does not expose a collaboration room.
            </Box>
          )}
        </Box>

        {(!configuration?.spacerUrl || !configuration?.token) && (
          <Box sx={{ mb: 2, p: 2, bg: 'danger.subtle' }}>
            Warning: Datalayer configuration is missing. Please configure
            spacerUrl and token to use DatalayerServiceManager and collaboration
            features.
          </Box>
        )}

        {!serviceManager && (
          <Box sx={{ mb: 2, p: 2, bg: 'attention.subtle' }}>
            Note: DatalayerServiceManager is not available. Notebook
            functionality will be limited.
          </Box>
        )}

        {collaborationError && (
          <Box sx={{ mb: 2, p: 2, bg: 'danger.subtle' }}>
            Collaboration could not start: {collaborationError}
          </Box>
        )}

        {enableCollaboration && collaborationReady ? (
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              flexDirection: 'row',
            }}
          >
            <Box
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  p: 2,
                  bg: 'canvas.default',
                  borderBottom: '1px solid',
                  borderColor: 'border.default',
                  fontWeight: 'bold',
                }}
              >
                Collaborator 1
              </Box>
              {serviceManager ? (
                <Notebook
                  id={NOTEBOOK_ID}
                  Toolbar={ExampleNotebookToolbar}
                  path={ROOM_PATH}
                  height="calc(100vh - 280px)"
                  nbformat={nbformat}
                  readonly={readonly}
                  serviceManager={serviceManager}
                  startDefaultKernel={true}
                  collaborationProvider={collaborationProvider1}
                />
              ) : (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  Loading ServiceManager...
                </Box>
              )}
            </Box>
            <Box
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  p: 2,
                  bg: 'canvas.default',
                  borderBottom: '1px solid',
                  borderColor: 'border.default',
                  fontWeight: 'bold',
                }}
              >
                Collaborator 2
              </Box>
              {serviceManager ? (
                <Notebook
                  id={NOTEBOOK_ID}
                  Toolbar={ExampleNotebookToolbar}
                  path={ROOM_PATH}
                  height="calc(100vh - 280px)"
                  nbformat={nbformat}
                  readonly={readonly}
                  serviceManager={serviceManager}
                  startDefaultKernel={false}
                  collaborationProvider={collaborationProvider2}
                />
              ) : (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  Loading ServiceManager...
                </Box>
              )}
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
            }}
          >
            {serviceManager ? (
              <Notebook
                id={NOTEBOOK_ID}
                Toolbar={ExampleNotebookToolbar}
                height="calc(100vh - 200px)"
                nbformat={nbformat}
                readonly={readonly}
                serviceManager={serviceManager}
                startDefaultKernel={true}
                collaborationProvider={collaborationProvider1}
              />
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                Loading ServiceManager...
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ mt: 2, fontSize: 1, color: 'fg.subtle' }}>
          <Box as="p" sx={{ m: 0, mb: 2 }}>
            This example demonstrates how to use Datalayer services with
            Notebook:
          </Box>
          <Box as="ul" sx={{ m: 0, pl: 3, '& li': { mb: 1 } }}>
            <li>
              <strong>DatalayerServiceManager:</strong> Connects to Datalayer
              infrastructure for kernel management
            </li>
            <li>
              <strong>DatalayerCollaborationProvider:</strong> Enables real-time
              collaboration
            </li>
            <li>Both require Datalayer credentials (spacerUrl and token)</li>
            <li>Pass them directly to the base Notebook component</li>
            <li>
              No wrapper components needed - just create the services and pass
              them as props
            </li>
            <li>
              This shows the explicit, composable pattern for Datalayer
              integration
            </li>
          </Box>
        </Box>
      </Box>
    </ThemedJupyterProvider>
  );
};

export default NotebookCollaborationExample;
