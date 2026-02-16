/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { Sparklines, SparklinesLine } from '../../components/sparklines';

export interface HeaderControlsProps {
  onToggleContextTree: () => void;
}

/**
 * Header Controls Component
 *
 * Contains the context toggle sparkline.
 */
export const HeaderControls: React.FC<HeaderControlsProps> = ({
  onToggleContextTree,
}) => {
  // Sample data for the sparkline - in production, this would come from props or state
  const sparklineData = [
    120, 200, 150, 180, 170, 210, 200, 220, 180, 210, 230, 250, 260, 270, 280,
    290, 300, 320, 310, 330,
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        '&:hover': {
          opacity: 0.8,
        },
      }}
      onClick={onToggleContextTree}
    >
      <Box sx={{ width: '120px', height: '30px' }}>
        <Sparklines data={sparklineData} width={120} height={30}>
          <SparklinesLine color="#0969da" style={{ strokeWidth: '2' }} />
        </Sparklines>
      </Box>
    </Box>
  );
};
