/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import { coreStore } from '@datalayer/core/lib/state/substates/CoreState';
import { DEFAULT_DATALAYER_CONFIG } from '@datalayer/core/lib/config/Configuration';
import { createRuntime } from '../runtimes/actions';

const normalizeEnvironmentName = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = String(value)
    .trim()
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .trim();
  return normalized || undefined;
};

const normalizeRuntimeName = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = String(value)
    .trim()
    .replace(/^['\"]+/, '')
    .replace(/['\"]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || undefined;
};

/**
 * Creates a ServiceManager configured for Datalayer.
 *
 * This function requests a new kernel from Datalayer's platform and
 * returns a configured ServiceManager that connects to the allocated
 * Jupyter server instance.
 *
 * @param environmentName - The name of the Datalayer environment to use
 * @param credits - The credit limit for this kernel session
 * @param runtimeName - Optional human-readable runtime name
 * @returns A configured ServiceManager instance
 * @throws Error if the kernel request fails or configuration is missing
 *
 * @example
 * ```typescript
 * const serviceManager = await createDatalayerServiceManager('ai-agents-env', 100);
 * await serviceManager.ready;
 * // Use the service manager with notebooks
 * ```
 */
export const createDatalayerServiceManager = async (
  environmentName?: string,
  credits?: number,
  runtimeName?: string,
): Promise<ServiceManager.IManager> => {
  const { configuration } = coreStore.getState();
  const token = configuration?.token || '';

  // Use provided values or fall back to config or defaults
  const actualEnvironmentName =
    normalizeEnvironmentName(environmentName) ||
    normalizeEnvironmentName(configuration?.cpuEnvironment) ||
    DEFAULT_DATALAYER_CONFIG.cpuEnvironment!;
  const actualCredits =
    credits ?? configuration?.credits ?? DEFAULT_DATALAYER_CONFIG.credits!;
  const actualRuntimeName =
    normalizeRuntimeName(runtimeName) ||
    `Agent Runtime - ${new Date().toISOString()}`;

  if (!token) {
    throw new Error(
      'Datalayer API token is required to create a service manager',
    );
  }

  try {
    // Use the existing createRuntime function which handles auth properly
    const runtime = await createRuntime({
      environmentName: actualEnvironmentName,
      type: 'notebook',
      givenName: actualRuntimeName,
      creditsLimit: actualCredits,
      capabilities: [],
    });

    const serverSettings = ServerConnection.makeSettings({
      baseUrl: runtime.ingress,
      wsUrl: runtime.ingress.replace(/^http/, 'ws'),
      token: runtime.token,
      appendToken: true,
    });

    const serviceManager = new ServiceManager({ serverSettings });

    console.log('Created Datalayer service manager:', {
      environmentName: actualEnvironmentName,
      credits: actualCredits,
      givenName: actualRuntimeName,
      reservationId: runtime.reservation_id,
      podName: runtime.pod_name,
      ingress: runtime.ingress,
    });

    return serviceManager;
  } catch (error) {
    console.error('Error creating Datalayer service manager:', error);
    throw error;
  }
};

export default createDatalayerServiceManager;
