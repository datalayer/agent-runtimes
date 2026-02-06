/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export interface FooterMetricsProps {
  tokens: number;
  cost: number;
}

/**
 * Footer Metrics Component
 *
 * Displays token usage and cost.
 */
export const FooterMetrics: React.FC<FooterMetricsProps> = ({
  tokens,
  cost,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        py: 2,
        px: 3,
      }}
    >
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
        Tokens:{' '}
        <Text as="span" sx={{ fontWeight: 'bold', color: 'fg.default' }}>
          {tokens.toLocaleString()}
        </Text>
      </Text>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
        Cost:{' '}
        <Text as="span" sx={{ fontWeight: 'bold', color: 'fg.default' }}>
          ${cost.toFixed(2)} USD
        </Text>
      </Text>
    </Box>
  );
};
