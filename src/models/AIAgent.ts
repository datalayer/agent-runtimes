/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AI Agent model
 */
export type IAIAgent = {
  /**
   * ID of the document monitored by the agent.
   */
  documentId: string;
  /**
   * ID of the runtime connected to the agent.
   *
   * This is not the name of the remote pod but
   * the Jupyter Kernel ID of the process within it.
   */
  runtimeId?: string;
};

export default IAIAgent;
