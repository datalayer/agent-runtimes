/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
import { ServiceManager } from '@jupyterlab/services';
import { INotebookContent } from '@jupyterlab/nbformat';
import {
  createDatalayerServiceManager,
  reconnectToRuntime,
} from '@datalayer/core/services';
import { DatalayerCollaborationProvider } from '@datalayer/core/collaboration';
import {
  useIAMStore,
  useCoreStore,
  useRuntimesStore,
} from '@datalayer/core/state';
import { Flash, Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { getStoredRuntime, storeRuntime } from '../utils/runtimeStorage';

// Dynamically import Jupyter components to avoid SSR issues
const JupyterReactTheme = dynamic(
  () => import('@datalayer/jupyter-react').then(mod => mod.JupyterReactTheme),
  { ssr: false },
);

const Notebook = dynamic(
  () => import('@datalayer/jupyter-react').then(mod => mod.Notebook),
  { ssr: false },
);

interface NotebookViewerProps {
  notebookPath: string;
  runtime: string;
  notebookContent?: any;
}

export default function NotebookViewer({
  notebookPath,
  runtime,
  notebookContent,
  onRuntimeCreated,
}: NotebookViewerProps & {
  onRuntimeCreated?: (runtimeId: string, podName: string) => void;
}) {
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nbformat, setNbformat] = useState<INotebookContent | null>(null);
  const iamStore = useIAMStore();
  const coreStore = useCoreStore();
  const runtimesStore = useRuntimesStore();
  const { token } = iamStore;
  const serviceManagerRef = useRef<ServiceManager.IManager | null>(null);
  const [collaborationProvider, setCollaborationProvider] = useState<
    DatalayerCollaborationProvider | undefined
  >(undefined);

  // Extensions will be created client-side only
  const [extensions, setExtensions] = useState<any[]>([]);

  useEffect(() => {
    // Import extensions dynamically on client-side
    import('@datalayer/jupyter-react').then(mod => {
      setExtensions([
        new mod.CellSidebarExtension({ factory: mod.CellSidebarButton }),
      ]);
    });
  }, []);

  useEffect(() => {
    async function initializeServices() {
      if (serviceManagerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        if (!token) {
          throw new Error('Please log in first');
        }

        // Ensure token is in the configuration for createDatalayerServiceManager
        const currentConfig = coreStore.configuration;
        if (!currentConfig.token) {
          coreStore.setConfiguration({
            ...currentConfig,
            token: token,
          });
        }

        // Check for existing runtime in localStorage
        const runtimeKey = `${notebookPath}_${runtime}`;
        const storedRuntimeData = getStoredRuntime(runtimeKey);

        let manager, runtimeId, podName;

        if (storedRuntimeData) {
          console.log('Reusing existing runtime:', storedRuntimeData);

          // Reconnect to existing runtime
          manager = await reconnectToRuntime({
            runtimeId: storedRuntimeData.runtimeId,
            podName: storedRuntimeData.podName,
            ingress: storedRuntimeData.ingress,
            token: storedRuntimeData.token,
            environmentName: runtime,
          });

          runtimeId = storedRuntimeData.runtimeId;
          podName = storedRuntimeData.podName;
        }

        // Create new runtime if we don't have one
        if (!manager) {
          manager = await createDatalayerServiceManager(
            runtime || 'ai-agents-env',
            100,
          );

          // Get runtime info from the store - find the runtime for our environment
          const currentPods = runtimesStore.runtimePods;
          const matchingRuntime = currentPods.find(
            pod => pod.environment_name === (runtime || 'ai-agents-env'),
          );

          if (matchingRuntime && matchingRuntime.reservation_id) {
            runtimeId = matchingRuntime.reservation_id;
            podName = matchingRuntime.pod_name;

            // Store runtime info for reuse
            storeRuntime(runtimeKey, {
              runtimeId: matchingRuntime.reservation_id,
              podName: matchingRuntime.pod_name,
              ingress: matchingRuntime.ingress,
              token: matchingRuntime.token,
              environment: runtime,
              notebookPath: notebookPath,
            });
            console.log('Stored runtime for reuse:', matchingRuntime);
          }
        }

        if (onRuntimeCreated && runtimeId && podName) {
          onRuntimeCreated(runtimeId, podName);
        }

        if (manager && !manager.isDisposed) {
          serviceManagerRef.current = manager;
          await manager.ready;
          setServiceManager(manager);

          // Create collaboration provider
          const sdkConfig = coreStore.configuration;
          const runUrl =
            sdkConfig?.runtimesRunUrl || 'https://prod1.datalayer.run';
          const isValidUID =
            notebookPath && /^[A-Z0-9]{26,}$/i.test(notebookPath);

          if (token && isValidUID) {
            try {
              const collabProvider = new DatalayerCollaborationProvider({
                runUrl,
                token,
              });
              setCollaborationProvider(collabProvider);
            } catch (err) {
              // Continue without collaboration
            }
          }
        }

        await loadNotebook(notebookPath);
      } catch (err: any) {
        if (!err?.message?.includes('Disposed')) {
          setError(err instanceof Error ? err.message : 'Failed to connect');
        }
      } finally {
        setIsLoading(false);
      }
    }

    async function loadNotebook(path: string) {
      try {
        // If notebook content was passed as prop, use it
        if (notebookContent) {
          // Check if it's already in nbformat structure
          if (notebookContent.cells && notebookContent.metadata) {
            setNbformat(notebookContent as INotebookContent);
          } else if (notebookContent.content) {
            // If it's wrapped in a content property
            setNbformat(notebookContent.content as INotebookContent);
          } else {
            // Create default notebook if structure is unexpected
            setNbformat(createEmptyNotebook());
          }
        } else if (path.startsWith('/') || path.includes('example')) {
          // Load from public folder for local files
          const response = await fetch(`/notebooks/${path.replace(/^\//, '')}`);
          if (response.ok) {
            const notebook = await response.json();
            setNbformat(notebook as INotebookContent);
          } else {
            // Create a default empty notebook if file not found
            setNbformat(createEmptyNotebook());
          }
        } else {
          // For notebook IDs, we expect the content to be passed as prop
          // If not available, create an empty notebook
          setNbformat(createEmptyNotebook());
        }
      } catch (err) {
        // Create an empty notebook as fallback
        setNbformat(createEmptyNotebook());
      }
    }

    if (token && !serviceManagerRef.current) {
      initializeServices();
    } else if (serviceManagerRef.current) {
      setIsLoading(false);
      loadNotebook(notebookPath);
    }

    return () => {
      // Only dispose in non-development environments
      if (process.env.NODE_ENV !== 'development' && serviceManagerRef.current) {
        serviceManagerRef.current.dispose?.();
        serviceManagerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only depend on token to avoid re-creating on every prop change

  // Separate effect to handle notebook content changes
  useEffect(() => {
    if (serviceManager && notebookContent) {
      // Update notebook content when it changes
      if (notebookContent.cells && notebookContent.metadata) {
        setNbformat(notebookContent as INotebookContent);
      } else if (notebookContent.content) {
        setNbformat(notebookContent.content as INotebookContent);
      }
    }
  }, [notebookContent, serviceManager]);

  // Helper function to create an empty notebook
  function createEmptyNotebook(): INotebookContent {
    return {
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3',
        },
        language_info: {
          name: 'python',
          version: '3.11.0',
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
      cells: [
        {
          cell_type: 'markdown',
          metadata: {},
          source: [
            '# Welcome to Datalayer Notebook\n',
            '\n',
            'Start coding below!',
          ],
        },
        {
          cell_type: 'code',
          metadata: {},
          source: [
            '# Your Python code here\n',
            'print("Hello from Datalayer!")',
          ],
          outputs: [],
          execution_count: null,
        },
      ],
    };
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          py: 6,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>Connecting to runtime...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <div style={{ margin: '16px' }}>
        <Flash variant="danger">Error: {error}</Flash>
      </div>
    );
  }

  if (!serviceManager || !nbformat) {
    return (
      <div style={{ margin: '16px' }}>
        <Flash variant="warning">
          {!serviceManager
            ? 'Service manager not initialized'
            : 'Notebook not loaded'}
        </Flash>
      </div>
    );
  }

  return (
    <JupyterReactTheme colormode="light">
      <div style={{ height: 'calc(100vh - 250px)', width: '100%' }}>
        <Notebook
          id={notebookPath}
          nbformat={nbformat}
          serviceManager={serviceManager as any}
          startDefaultKernel={true}
          extensions={extensions}
          height="100%"
          collaborationProvider={collaborationProvider}
        />
      </div>
    </JupyterReactTheme>
  );
}
