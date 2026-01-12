/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Inference provider exports for chat component.
 *
 * @module components/chat/inference
 */

export { BaseInferenceProvider } from './BaseInferenceProvider';
export {
  DatalayerInferenceProvider,
  type DatalayerInferenceConfig,
} from './DatalayerInferenceProvider';
export {
  SelfHostedInferenceProvider,
  type SelfHostedInferenceConfig,
} from './SelfHostedInferenceProvider';

// Re-export inference types
export type {
  InferenceProvider,
  InferenceProviderConfig,
  InferenceProviderFactory,
  InferenceProviderType,
  InferenceRequestOptions,
  InferenceResponse,
  StreamEvent,
  StreamEventType,
  StreamEventHandler,
} from '../types/inference';
