/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Point interface for sparkline coordinates
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Sparklines component props
 */
export interface SparklinesProps {
  data: number[];
  width?: number;
  height?: number;
  svgWidth?: number;
  svgHeight?: number;
  preserveAspectRatio?: string;
  margin?: number;
  style?: React.CSSProperties;
  min?: number;
  max?: number;
  limit?: number;
  children?: React.ReactNode;
}

/**
 * Sparklines Line component props
 */
export interface SparklinesLineProps {
  data?: number[];
  points?: Point[];
  width?: number;
  height?: number;
  margin?: number;
  color?: string;
  style?: React.CSSProperties;
}
