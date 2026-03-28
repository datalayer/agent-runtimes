/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ServiceManager } from '@jupyterlab/services';
import type { AgentStatus } from './agents';

/**
 * Connection state enumeration
 */
export type ConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

/**
 * Information about a connected agent runtime.
 */
export interface AgentConnection {
  /** Runtime pod name (unique identifier). */
  podName: string;
  /** Environment name. */
  environmentName: string;
  /** Base URL for the Jupyter server. */
  jupyterBaseUrl: string;
  /** Base URL for the agent-runtimes server. */
  agentBaseUrl: string;
  /** JupyterLab ServiceManager for the runtime. */
  serviceManager?: ServiceManager.IManager;
  /** Runtime status. */
  status: AgentStatus;
  /** Kernel ID if connected. */
  kernelId?: string;
  /** Agent ID. */
  agentId?: string;
  /** Full endpoint URL for the agent. */
  endpoint?: string;
  /** Whether the agent is ready to use. */
  isReady?: boolean;
}
