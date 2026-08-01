/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ServiceManager } from '@jupyterlab/services';
import { useMemo } from 'react';
import {
  Cell,
  KernelIndicator,
  useJupyter,
  useKernelsStore,
  useCellsStore,
} from '@datalayer/jupyter-react';
import { getServiceManagerRuntimeEnvironmentDetails } from '../hooks/useAgentRuntimes';
import { ThemedJupyterProvider } from './utils/themedProvider';
import { Button, Heading, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

const CELL_ID = 'cell-example-1';

type IJupyterCellExampleProps = {
  serviceManager?: ServiceManager.IManager;
};

const DEFAULT_SOURCE = `from IPython.display import display

for i in range(10):
    display('I am a long string which is repeatedly added to the dom in separated divs: %d' % i)`;

const CellExampleContent = ({ serviceManager }: IJupyterCellExampleProps) => {
  const { defaultKernel } = useJupyter({
    serviceManager,
    // Reuse the first running kernel from the sandbox manager.
    // Do not start a new kernel from the cell example.
    useRunningKernelIndex: 0,
    startDefaultKernel: false,
  });
  const activeKernel = useMemo(() => {
    if (!defaultKernel) {
      return undefined;
    }
    const expectedBaseUrl = String(serviceManager?.serverSettings.baseUrl || '')
      .trim()
      .replace(/\/$/, '');
    const kernelBaseUrl = String(
      defaultKernel.connection?.serverSettings?.baseUrl || ''
    )
      .trim()
      .replace(/\/$/, '');
    if (expectedBaseUrl && kernelBaseUrl && expectedBaseUrl !== kernelBaseUrl) {
      return undefined;
    }
    return defaultKernel;
  }, [defaultKernel, serviceManager?.serverSettings.baseUrl]);
  const fallbackKernelEnvironmentName = useMemo(() => {
    const rawBaseUrl = String(serviceManager?.serverSettings.baseUrl || '').trim();
    if (!rawBaseUrl) {
      return 'local-jupyter-server';
    }
    try {
      const parsed = new URL(rawBaseUrl);
      if (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '0.0.0.0'
      ) {
        return 'local-jupyter-server';
      }
      return `${parsed.hostname} jupyter-server`;
    } catch {
      return 'local-jupyter-server';
    }
  }, [serviceManager?.serverSettings.baseUrl]);
  const runtimeEnvironment = useMemo(
    () => getServiceManagerRuntimeEnvironmentDetails(serviceManager),
    [serviceManager],
  );
  const kernelEnvironmentName =
    runtimeEnvironment?.environmentTitle ||
    runtimeEnvironment?.environmentName ||
    fallbackKernelEnvironmentName;
  const cellsStore = useCellsStore();
  const kernelsStore = useKernelsStore();

  return (
    <Box p={4}>
      <Heading as="h1" sx={{ fontSize: 3, mb: 3 }}>
        Cell Example
      </Heading>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ['1fr', null, 'repeat(3, minmax(0, 1fr))'],
          gap: 3,
          mb: 3,
        }}
      >
        <Box>
          <Text as="p" sx={{ mb: 0, wordBreak: 'break-word' }}>
            Source: {cellsStore.getSource(CELL_ID)}
          </Text>
        </Box>

        <Box>
          <Text as="p" sx={{ mb: 2 }}>
            Outputs Count: {cellsStore.getOutputsCount(CELL_ID)}
          </Text>
          <Box sx={{ mb: 2 }}>
            Kernel State:{' '}
            <Label>
              {activeKernel && kernelsStore.getExecutionState(activeKernel.id)}
            </Label>
          </Box>
          <Box>
            Kernel Phase:{' '}
            <Label>
              {activeKernel && kernelsStore.getExecutionPhase(activeKernel.id)}
            </Label>
          </Box>
        </Box>

        <Box>
          <Button
            sx={{ mb: 3 }}
            onClick={() => cellsStore.execute(CELL_ID)}
            disabled={!activeKernel}
          >
            Run Cell
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Box>Code Sandbox:</Box>
            <KernelIndicator
              kernel={activeKernel && activeKernel.connection}
              environmentName={kernelEnvironmentName}
              cpu={runtimeEnvironment?.cpu}
              memory={runtimeEnvironment?.memory}
              gpu={runtimeEnvironment?.gpu}
              bordered={false}
              position="bottom-left"
            />
          </Box>
          {!activeKernel && (
            <Text as="p" sx={{ mb: 0, color: 'fg.muted' }}>
              Waiting for an existing sandbox kernel connection.
            </Text>
          )}
        </Box>
      </Box>
      {activeKernel ? (
        <Cell source={DEFAULT_SOURCE} id={CELL_ID} kernel={activeKernel} />
      ) : null}
    </Box>
  );
};

export const CellExample = (props: IJupyterCellExampleProps) => {
  const { serviceManager } = props;

  return (
    <ThemedJupyterProvider>
      <CellExampleContent serviceManager={serviceManager} />
    </ThemedJupyterProvider>
  );
};

export default CellExample;
