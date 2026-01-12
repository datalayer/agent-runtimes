/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { StarFillIcon } from '@primer/octicons-react';

interface RatingProps {
  /** Rating value between 1 and 5 */
  value: number;
  /** Size of the stars */
  size?: number;
}

/**
 * Rating Component
 *
 * Displays a star rating using octicons.
 */
export const Rating: React.FC<RatingProps> = ({ value, size = 12 }) => {
  const clampedValue = Math.max(1, Math.min(5, value));

  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, index) => (
        <StarFillIcon
          key={index}
          size={size}
          fill={index < clampedValue ? '#fbbf24' : '#e5e7eb'}
        />
      ))}
    </Box>
  );
};
