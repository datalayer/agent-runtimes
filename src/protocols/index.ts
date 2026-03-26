/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol adapter exports for chat component.
 *
 * @module protocols
 */

export { BaseProtocolAdapter } from './BaseProtocolAdapter';
export { AGUIAdapter, type AGUIAdapterConfig } from './AGUIAdapter';
export { A2AAdapter, type A2AAdapterConfig } from './A2AAdapter';
export { VercelAIAdapter, type VercelAIAdapterConfig } from './VercelAIAdapter';
export {
  ACPAdapter,
  type ACPAdapterConfig,
  type ACPSession,
  type ACPAgent,
  type ACPPendingPermission,
} from './ACPAdapter';
