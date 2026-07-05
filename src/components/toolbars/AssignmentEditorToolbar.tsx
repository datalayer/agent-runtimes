/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { RepoPushIcon } from '@primer/octicons-react';
// import { PlayIcon, StopIcon } from '@primer/octicons-react';
// import { notebookStore } from '@datalayer/jupyter-react';
import { useGradeStore } from '../../state/substates';

export const AssignmentEditorToolbar = (props: { notebookId: string }) => {
  //  const { notebookId } = props;
  //   const notebook = notebookStore.getState().selectNotebook(notebookId);
  const { grade } = useGradeStore();
  return (
    <Box display="flex">
      <Box>
        <Button
          variant="invisible"
          size="small"
          leadingVisual={RepoPushIcon}
          onClick={() => grade(new Date())}
        >
          Grade
        </Button>
      </Box>
      {/* notebook?.kernelStatus !== 'busy' && (
      TODO Fix run all button when kernel is busy
        <Box>
          <Button
            variant="invisible"
            size="small"
            leadingVisual={PlayIcon}
            onClick={e => notebookStore.getState().runAll(notebookId)}
          >
            Run all
          </Button>
        </Box>
      )*/}
      {/* notebook?.kernelStatus === 'busy' && (
      // TODO Fix interrupt button when kernel is busy
        <Box>
          <Button
            variant="danger"
            size="small"
            leadingVisual={StopIcon}
            onClick={e => notebookStore.getState().interrupt(notebookId)}
          >
            Interrupt
          </Button>
        </Box>
      )*/}
    </Box>
  );
};

export default AssignmentEditorToolbar;
