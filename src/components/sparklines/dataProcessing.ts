/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Get minimum value from array
 */
export const min = (data: number[]): number => {
  return Math.min(...data);
};

/**
 * Get maximum value from array
 */
export const max = (data: number[]): number => {
  return Math.max(...data);
};

/**
 * Convert data array to SVG points
 */
export interface DataToPointsOptions {
  data: number[];
  limit?: number;
  width?: number;
  height?: number;
  margin?: number;
  max?: number;
  min?: number;
}

export interface Point {
  x: number;
  y: number;
}

export const dataToPoints = ({
  data,
  limit,
  width = 1,
  height = 1,
  margin = 0,
  max: maxVal,
  min: minVal,
}: DataToPointsOptions): Point[] => {
  let processedData = [...data];
  const len = processedData.length;

  // Limit data if specified
  if (limit && limit < len) {
    processedData = processedData.slice(len - limit);
  }

  // Calculate min/max if not provided
  const dataMax = maxVal ?? max(processedData);
  const dataMin = minVal ?? min(processedData);

  // Calculate scaling factors
  const vfactor = (height - margin * 2) / (dataMax - dataMin || 2);
  const hfactor = (width - margin * 2) / ((limit || len) - (len > 1 ? 1 : 0));

  // Map data to points
  return processedData.map((d, i) => ({
    x: i * hfactor + margin,
    y: (dataMax === dataMin ? 1 : dataMax - d) * vfactor + margin,
  }));
};
