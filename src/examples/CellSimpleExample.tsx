/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ServiceManager } from '@jupyterlab/services';
import {
  Cell,
  KernelIndicator,
  useJupyter,
  useKernelsStore,
  useCellsStore,
} from '@datalayer/jupyter-react';
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

const JupyterCellExampleContent = () => {
  const { defaultKernel } = useJupyter({ startDefaultKernel: true });
  const cellsStore = useCellsStore();
  const kernelsStore = useKernelsStore();

  return (
    <Box p={4}>
      <Heading as="h1" sx={{ fontSize: 3, mb: 3 }}>
        Jupyter Cell Example
      </Heading>
      <Text as="p" sx={{ mb: 2 }}>
        Source: {cellsStore.getSource(CELL_ID)}
      </Text>
      <Text as="p" sx={{ mb: 2 }}>
        Outputs Count: {cellsStore.getOutputsCount(CELL_ID)}
      </Text>
      <Box>
        Kernel State:{' '}
        <Label>
          {defaultKernel && kernelsStore.getExecutionState(defaultKernel.id)}
        </Label>
      </Box>
      <Box>
        Kernel Phase:{' '}
        <Label>
          {defaultKernel && kernelsStore.getExecutionPhase(defaultKernel.id)}
        </Label>
      </Box>
      <Box display="flex">
        <Box>Kernel Indicator:</Box>
        <Box ml={3}>
          <KernelIndicator kernel={defaultKernel && defaultKernel.connection} />
        </Box>
      </Box>
      <Box>
        <Button onClick={() => cellsStore.execute(CELL_ID)}>Run cell</Button>
      </Box>
      <Cell source={DEFAULT_SOURCE} id={CELL_ID} kernel={defaultKernel} />
    </Box>
  );
};

export const JupyterCellExample = (props: IJupyterCellExampleProps) => {
  return (
    <ThemedJupyterProvider>
      <JupyterCellExampleContent />
    </ThemedJupyterProvider>
  );
};

export default JupyterCellExample;
