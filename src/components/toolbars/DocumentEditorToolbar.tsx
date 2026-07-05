/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Button, Box } from '@primer/react';
import { RepoPushIcon } from '@primer/octicons-react';
import { documentStore } from '../../state/substates';

export const DocumentEditorToolbar = () => {
  return (
    <Box display="flex">
      <Box>
        <Button
          variant="invisible"
          size="small"
          leadingVisual={RepoPushIcon}
          onClick={() => documentStore.getState().save(new Date())}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
};

export default DocumentEditorToolbar;
