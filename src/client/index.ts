/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Client mixins and domain-level client abstractions for agent-runtimes.
 *
 * @module client
 */

export { AgentsMixin } from './AgentsMixin';
export type { IAgentRuntimesClient } from './IAgentRuntimesClient';
export {
  SdkAgentRuntimesClient,
  type AgentsSdkLike,
} from './SdkAgentRuntimesClient';
export {
  AgentRuntimesClientProvider,
  useAgentRuntimesClient,
  useOptionalAgentRuntimesClient,
  type AgentRuntimesClientProviderProps,
} from './AgentRuntimesClientContext';
