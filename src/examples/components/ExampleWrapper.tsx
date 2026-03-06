/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';

/**
 * ExampleWrapper
 *
 * Wraps every example in a fixed-height container that accounts for
 * the 60 px header bar. Examples inside can use `100vh` or `100%`
 * freely — the wrapper clips and scrolls as needed.
 */
export const ExampleWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Box
    sx={{
      height: 'calc(100vh - 60px)',
      width: '100%',
      overflow: 'auto',
      position: 'relative',
    }}
  >
    {children}
  </Box>
);

export default ExampleWrapper;
