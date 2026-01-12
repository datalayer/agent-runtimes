/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import type { SparklinesLineProps } from './types';
import type { Point } from './dataProcessing';

/**
 * Sparklines Line Component
 *
 * Renders a line chart within a Sparklines container.
 */
export const SparklinesLine: React.FC<SparklinesLineProps> = ({
  points = [],
  height = 60,
  margin = 2,
  color = '#0969da',
  style = {},
}) => {
  if (!points || points.length === 0) {
    return null;
  }

  // Convert points to polyline format
  const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  // Create fill area by closing the path
  const closePolyPoints: Point[] = [
    { x: points[points.length - 1].x, y: height - margin },
    { x: margin, y: height - margin },
    { x: margin, y: points[0].y },
  ];

  const fillPoints = points
    .concat(closePolyPoints)
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  const lineStyle: React.CSSProperties = {
    stroke: color || style.stroke || 'slategray',
    strokeWidth: style.strokeWidth || '1.5',
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    fill: 'none',
  };

  const fillStyle: React.CSSProperties = {
    stroke: 'none',
    strokeWidth: '0',
    fillOpacity: style.fillOpacity || '0.1',
    fill: style.fill || color || 'slategray',
  };

  return (
    <g>
      <polyline points={fillPoints} style={fillStyle} />
      <polyline points={linePoints} style={lineStyle} />
    </g>
  );
};
