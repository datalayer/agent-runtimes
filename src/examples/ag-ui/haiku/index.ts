/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Haiku example components for AG-UI tool-based generative UI.
 *
 * This folder contains haiku-specific components that demonstrate
 * tool-based generative UI where the backend generates haiku content
 * that is rendered both inline in chat and in a main display area.
 *
 * @module examples/ag-ui/haiku
 */

export {
  InlineHaikuCard,
  type InlineHaikuCardProps,
  type HaikuResult,
} from './InlineHaikuCard';

export { HaikuDisplay, type HaikuDisplayProps } from './HaikuDisplay';
