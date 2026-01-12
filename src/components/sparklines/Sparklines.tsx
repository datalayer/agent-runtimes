/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useMemo } from 'react';
import type { SparklinesProps } from './types';
import { dataToPoints } from './dataProcessing';

/**
 * Sparklines Component
 *
 * A lightweight, composable sparkline chart component.
 * Renders an SVG container and processes data into points for child components.
 *
 * @example
 * ```tsx
 * <Sparklines data={[1, 2, 3, 4, 5]} width={100} height={30}>
 *   <SparklinesLine color="#0969da" />
 * </Sparklines>
 * ```
 */
export const Sparklines: React.FC<SparklinesProps> = ({
  data = [],
  width = 240,
  height = 60,
  svgWidth,
  svgHeight,
  preserveAspectRatio = 'none',
  margin = 2,
  style,
  min,
  max,
  limit,
  children,
}) => {
  // Convert data to points
  const points = useMemo(() => {
    if (data.length === 0) {
      return [];
    }

    return dataToPoints({
      data,
      limit,
      width,
      height,
      margin,
      max,
      min,
    });
  }, [data, limit, width, height, margin, max, min]);

  if (data.length === 0) {
    return null;
  }

  // Build SVG props
  const svgProps: React.SVGProps<SVGSVGElement> = {
    style,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio,
  };

  if (svgWidth && svgWidth > 0) {
    svgProps.width = svgWidth;
  }

  if (svgHeight && svgHeight > 0) {
    svgProps.height = svgHeight;
  }

  return (
    <svg {...svgProps}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            data,
            points,
            width,
            height,
            margin,
            ...child.props,
          });
        }
        return child;
      })}
    </svg>
  );
};
