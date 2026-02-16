/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box, Slider } from '@datalayer/primer-addons';

export interface TimeTravelProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Time Travel Component
 *
 * Slider for navigating through document history.
 */
export const TimeTravel: React.FC<TimeTravelProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}) => {
  return (
    <Box
      sx={{
        marginTop: 3,
        padding: 3,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        backgroundColor: 'canvas.subtle',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          marginBottom: 2,
        }}
      >
        <Text sx={{ fontSize: 0, fontWeight: 'semibold' }}>Time Travel</Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Navigate through history: {value} steps
        </Text>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        aria-label="Time travel slider"
      />
    </Box>
  );
};
