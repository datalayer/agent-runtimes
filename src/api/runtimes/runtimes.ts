/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtime instances API functions for the Datalayer platform.
 *
 * Provides functions for managing runtime instances (active compute containers).
 *
 * @module api/runtimes/runtimes
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  RuntimeData,
  CreateRuntimeRequest,
  CreateRuntimeResponse,
  ListRuntimesResponse,
} from '../../models/RuntimeDTO';
import {
  validateToken,
  validateRequiredString,
} from '@datalayer/core/lib/api/utils/validation';

/**
 * Create a new runtime instance.
 * @param token - Authentication token
 * @param data - Runtime creation configuration
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the created runtime details
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} With status 404 if the environment is not found
 * @throws {Error} With status 503 if no runtime is available
 */
export const createRuntime = async (
  token: string,
  data: CreateRuntimeRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<CreateRuntimeResponse> => {
  validateToken(token);

  try {
    return await requestDatalayerAPI<CreateRuntimeResponse>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes`,
      method: 'POST',
      body: data,
      token,
    });
  } catch (error: any) {
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data || {};

      if (status === 404) {
        // Environment not found
        throw new Error(
          `Environment '${data.environment_name}' not found. ${responseData.message || 'Please check the environment name and try again.'}`,
        );
      } else if (status === 503) {
        // No runtime available
        throw new Error(
          `No runtime available. ${responseData.message || 'The service is temporarily unavailable or at capacity. Please try again later.'}`,
        );
      }
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * List all runtime instances.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to list of runtime instances
 * @throws {Error} If authentication token is missing or invalid
 */
export const listRuntimes = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<ListRuntimesResponse> => {
  validateToken(token);

  const response = await requestDatalayerAPI<any>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes`,
    method: 'GET',
    token,
  });

  // The API returns { success: true, message: string, runtimes: Runtime[] }
  // The response already has the correct structure, just return it
  return response as ListRuntimesResponse;
};

/**
 * Get details for a specific runtime instance.
 * @param token - Authentication token
 * @param podName - The unique pod name of the runtime
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to runtime details
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If pod name is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const getRuntime = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<RuntimeData> => {
  validateToken(token);
  validateRequiredString(podName, 'Pod name');

  try {
    const response = await requestDatalayerAPI<any>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${podName}`,
      method: 'GET',
      token,
    });

    // The API returns { success: true, message: string, runtime: Runtime }
    // (Previously used 'kernel' field, now uses 'runtime')

    // Try 'runtime' field first (current API)
    if (response.runtime) {
      return {
        ...response.runtime,
        pod_name: response.runtime.pod_name || podName,
      } as RuntimeData;
    }

    // Fallback to 'kernel' field (old API)
    if (response.kernel) {
      return {
        ...response.kernel,
        pod_name: response.kernel.pod_name || podName,
      } as RuntimeData;
    }

    // Fallback if response structure is different
    return response as RuntimeData;
  } catch (error: any) {
    // Handle specific error cases
    if (error.response && error.response.status === 404) {
      // Runtime not found
      throw new Error(
        `Runtime with pod name '${podName}' not found. Please check the pod name and try again.`,
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Delete a runtime instance.
 * @param token - Authentication token
 * @param podName - The unique pod name of the runtime to delete
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving when deletion is complete
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If pod name is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const deleteRuntime = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<void> => {
  validateToken(token);
  validateRequiredString(podName, 'Pod name');

  try {
    return await requestDatalayerAPI<void>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${podName}`,
      method: 'DELETE',
      token,
    });
  } catch (error: any) {
    // Handle specific error cases
    if (error.response && error.response.status === 404) {
      // Runtime not found
      throw new Error(
        `Runtime with pod name '${podName}' not found. Cannot delete a non-existent runtime.`,
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Update a runtime instance.
 * @param token - Authentication token
 * @param podName - The unique pod name of the runtime
 * @param from - The source to update from
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to updated runtime details
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If pod name is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const updateRuntime = async (
  token: string,
  podName: string,
  from: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<RuntimeData> => {
  validateToken(token);
  validateRequiredString(podName, 'Pod name');

  try {
    return await requestDatalayerAPI<RuntimeData>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${podName}`,
      method: 'PUT',
      token,
      body: { from },
    });
  } catch (error: any) {
    // Handle specific error cases
    if (error.response && error.response.status === 404) {
      // Runtime not found
      throw new Error(
        `Runtime with pod name '${podName}' not found. Cannot update a non-existent runtime.`,
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Response from the pause/resume runtime endpoints.
 * The server returns 202 Accepted and provides a checkpoint UID
 * that can be polled for status updates.
 */
export interface PauseResumeResponse {
  success: boolean;
  message: string;
  checkpoint_id: string | null;
}

/**
 * Optional body for the pause endpoint.
 * Metadata is stored in the checkpoint Solr record created by the backend.
 */
export interface PauseRuntimeBody {
  /** Checkpoint mode: 'criu' (full) or 'light' (history-only) */
  checkpoint_mode?: 'criu' | 'light';
  /** Human-readable checkpoint name */
  name?: string;
  /** Checkpoint description */
  description?: string;
  /** Agentspec identifier */
  agent_spec_id?: string;
  /** Full agentspec payload to persist with the checkpoint */
  agentspec?: Record<string, any>;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Lightweight checkpoint message history */
  messages?: string[];
}

/**
 * Pause a runtime by creating a checkpoint (async, light mode by default).
 *
 * Returns immediately with a 202 Accepted response.  The actual checkpoint
 * process runs in the background.  Use the returned `checkpoint_id` to
 * poll for status via the runtime-checkpoints API.
 *
 * @param token - Authentication token
 * @param podName - The unique pod name of the runtime to pause
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @param body - Optional metadata to store in the checkpoint record
 * @returns Promise resolving with the checkpoint ID for status tracking
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If pod name is missing or invalid
 */
export const pauseRuntime = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  body?: PauseRuntimeBody,
): Promise<PauseResumeResponse> => {
  validateToken(token);
  validateRequiredString(podName, 'Pod name');

  return await requestDatalayerAPI<PauseResumeResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${encodeURIComponent(podName)}/pause`,
    method: 'POST',
    token,
    ...(body ? { body } : {}),
  });
};

/**
 * Optional body for the resume endpoint.
 * Contains information needed by the operator to restore from a checkpoint.
 */
export interface ResumeRuntimeBody {
  /** Checkpoint mode to resume from: 'criu' or 'light' */
  checkpoint_mode?: 'criu' | 'light';
  /** Explicit checkpoint identifier */
  checkpoint_id?: string;
  /** Agentspec identifier (required by the operator for restore) */
  agent_spec_id?: string;
  /** Specific checkpoint timestamp to restore from */
  checkpoint_timestamp?: string;
  /** Environment name override */
  environment_name?: string;
  /** Container image override */
  container_image?: string;
  /** Target node name */
  node_name?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Resume a paused runtime by restoring from a checkpoint (async).
 *
 * Returns immediately with a 202 Accepted response.  The actual restore
 * process runs in the background.  Use the returned `checkpoint_id` to
 * poll for status.
 *
 * @param token - Authentication token
 * @param podName - The unique pod name of the runtime to resume
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @param body - Optional body with agent_spec_id and restore options
 * @returns Promise resolving with the checkpoint ID for status tracking
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If pod name is missing or invalid
 */
export const resumeRuntime = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  body?: ResumeRuntimeBody,
): Promise<PauseResumeResponse> => {
  validateToken(token);
  validateRequiredString(podName, 'Pod name');

  return await requestDatalayerAPI<PauseResumeResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${encodeURIComponent(podName)}/resume`,
    method: 'POST',
    token,
    ...(body ? { body } : {}),
  });
};
