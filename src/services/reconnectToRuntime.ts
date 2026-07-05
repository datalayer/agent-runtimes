/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ServerConnection, ServiceManager } from '@jupyterlab/services';

export interface RuntimeInfo {
  runtimeId: string;
  podName: string;
  ingress: string;
  token: string;
  environmentName?: string;
}

/**
 * Reconnects to an existing Datalayer runtime
 *
 * This function creates a ServiceManager that connects to an already
 * allocated Jupyter server instance using stored runtime information.
 *
 * @param runtimeInfo - The stored runtime information
 * @returns A configured ServiceManager instance
 * @throws Error if the reconnection fails
 *
 * @example
 * ```typescript
 * const runtimeInfo = {
 *   runtimeId: 'abc123',
 *   podName: 'jupyter-pod-xyz',
 *   ingress: 'https://jupyter.example.com',
 *   token: 'secret-token'
 * };
 * const serviceManager = await reconnectToRuntime(runtimeInfo);
 * await serviceManager.ready;
 * ```
 */
export const reconnectToRuntime = async (
  runtimeInfo: RuntimeInfo,
): Promise<ServiceManager.IManager> => {
  try {
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: runtimeInfo.ingress,
      wsUrl: runtimeInfo.ingress.replace(/^http/, 'ws'),
      token: runtimeInfo.token,
      appendToken: true,
    });

    const serviceManager = new ServiceManager({ serverSettings });

    // Store runtime info on the serviceManager instance for access
    (serviceManager as any).__datalayerRuntime = {
      environmentName: runtimeInfo.environmentName || 'unknown',
      credits: 0,
      reservationId: runtimeInfo.runtimeId,
      podName: runtimeInfo.podName,
      ingress: runtimeInfo.ingress,
      token: runtimeInfo.token,
      createdAt: new Date().toISOString(),
    };

    console.log('Reconnected to existing runtime:', {
      runtimeId: runtimeInfo.runtimeId,
      podName: runtimeInfo.podName,
      ingress: runtimeInfo.ingress,
    });

    return serviceManager;
  } catch (error) {
    console.error('Error reconnecting to runtime:', error);
    throw error;
  }
};

export default reconnectToRuntime;
