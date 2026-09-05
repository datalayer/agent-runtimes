/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
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
 * What a failed request carries, as far as these functions read it: the
 * status the service answered with, and the message it gave.
 */
interface RequestFailure {
  response?: {
    status?: number;
    data?: { message?: string };
  };
}

/**
 * The shape `GET /runtimes/{uid}` answers: the runtime under `runtime`, or
 * under `kernel` from the API before it.
 */
interface RuntimeEnvelope {
  runtime?: Partial<RuntimeData>;
  kernel?: Partial<RuntimeData>;
}

/**
 * The status a failed request answered with, when it answered at all.
 */
function statusOf(error: unknown): number | undefined {
  return (error as RequestFailure).response?.status;
}

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
  } catch (error) {
    const failure = error as RequestFailure;
    if (failure.response) {
      const status = failure.response.status;
      const responseData = failure.response.data || {};

      if (status === 404) {
        // Environment not found
        throw new Error(
          `Environment '${data.environment?.name || ''}' not found. ${responseData.message || 'Please check the environment name and try again.'}`,
          { cause: error },
        );
      } else if (status === 503) {
        // No runtime available
        throw new Error(
          `No runtime available. ${responseData.message || 'The service is temporarily unavailable or at capacity. Please try again later.'}`,
          { cause: error },
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

  // The API returns { success: true, message: string, runtimes: Runtime[] }
  return await requestDatalayerAPI<ListRuntimesResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes`,
    method: 'GET',
    token,
  });
};

/**
 * Get details for a specific runtime instance.
 * @param token - Authentication token
 * @param runtimeName - The uid of the runtime
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to runtime details
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If the uid is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const getRuntime = async (
  token: string,
  runtimeName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<RuntimeData> => {
  validateToken(token);
  validateRequiredString(runtimeName, 'Runtime uid');

  try {
    const response = await requestDatalayerAPI<RuntimeEnvelope>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${runtimeName}`,
      method: 'GET',
      token,
    });

    // The API returns { success: true, message: string, runtime: Runtime }
    // (Previously used 'kernel' field, now uses 'runtime')

    // Try 'runtime' field first (current API)
    if (response.runtime) {
      return {
        ...response.runtime,
        runtime_name: response.runtime.runtime_name || runtimeName,
      } as RuntimeData;
    }

    // Fallback to 'kernel' field (old API)
    if (response.kernel) {
      return {
        ...response.kernel,
        runtime_name: response.kernel.runtime_name || runtimeName,
      } as RuntimeData;
    }

    // Fallback if response structure is different
    return response as unknown as RuntimeData;
  } catch (error) {
    if (statusOf(error) === 404) {
      // Runtime not found
      throw new Error(
        `Runtime '${runtimeName}' not found. Check the uid and try again.`,
        { cause: error },
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Delete a runtime instance.
 * @param token - Authentication token
 * @param runtimeName - The uid of the runtime to delete
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving when deletion is complete
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If the uid is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const deleteRuntime = async (
  token: string,
  runtimeName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<void> => {
  validateToken(token);
  validateRequiredString(runtimeName, 'Runtime uid');

  try {
    return await requestDatalayerAPI<void>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${runtimeName}`,
      method: 'DELETE',
      token,
    });
  } catch (error) {
    if (statusOf(error) === 404) {
      // Runtime not found
      throw new Error(
        `Runtime '${runtimeName}' not found. Cannot delete a non-existent runtime.`,
        { cause: error },
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Update a runtime instance.
 * @param token - Authentication token
 * @param runtimeName - The uid of the runtime
 * @param from - The source to update from
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to updated runtime details
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If the uid is missing or invalid
 * @throws {Error} With status 404 if the runtime is not found
 */
export const updateRuntime = async (
  token: string,
  runtimeName: string,
  from: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<RuntimeData> => {
  validateToken(token);
  validateRequiredString(runtimeName, 'Runtime uid');

  try {
    return await requestDatalayerAPI<RuntimeData>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${runtimeName}`,
      method: 'PUT',
      token,
      body: { from },
    });
  } catch (error) {
    if (statusOf(error) === 404) {
      // Runtime not found
      throw new Error(
        `Runtime '${runtimeName}' not found. Cannot update a non-existent runtime.`,
        { cause: error },
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
  agentspec?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
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
 * @param runtimeName - The uid of the runtime to pause
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @param body - Optional metadata to store in the checkpoint record
 * @returns Promise resolving with the checkpoint ID for status tracking
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If the uid is missing or invalid
 */
export const pauseRuntime = async (
  token: string,
  runtimeName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  body?: PauseRuntimeBody,
): Promise<PauseResumeResponse> => {
  validateToken(token);
  validateRequiredString(runtimeName, 'Runtime uid');

  return await requestDatalayerAPI<PauseResumeResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${encodeURIComponent(runtimeName)}/pause`,
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
  metadata?: Record<string, unknown>;
}

/**
 * Persisted memory record returned by ``/api/runtimes/v1/memories``.
 */
export interface RuntimeMemory {
  id: string;
  memory?: string | null;
  hash?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  run_id?: string | null;
  actor_id?: string | null;
  role?: string | null;
  scope?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Response payload for listing persisted runtime memories.
 */
export interface ListRuntimeMemoriesResponse {
  success: boolean;
  message?: string;
  count: number;
  limit: number;
  offset: number;
  user_id?: string;
  memories: RuntimeMemory[];
}

/**
 * Response payload for fetching one persisted memory.
 */
export interface GetRuntimeMemoryResponse {
  success: boolean;
  message?: string;
  memory: RuntimeMemory;
}

/**
 * Query options for listing persisted runtime memories.
 */
export interface ListRuntimeMemoriesOptions {
  userId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

/**
 * List persisted memories from the runtimes API.
 *
 * Non-admin callers are automatically scoped to their own personal account by
 * the backend, even when ``userId`` is omitted.
 */
export const listRuntimeMemories = async (
  token: string,
  options: ListRuntimeMemoriesOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<ListRuntimeMemoriesResponse> => {
  validateToken(token);

  const query = new URLSearchParams();
  if (options.userId?.trim()) {
    query.set('user_id', options.userId.trim());
  }
  if (options.agentId?.trim()) {
    query.set('agent_id', options.agentId.trim());
  }
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    query.set(
      'limit',
      String(Math.max(1, Math.min(1000, Math.floor(options.limit)))),
    );
  }
  if (typeof options.offset === 'number' && Number.isFinite(options.offset)) {
    query.set('offset', String(Math.max(0, Math.floor(options.offset))));
  }

  const qs = query.toString();
  const response = await requestDatalayerAPI<
    Partial<ListRuntimeMemoriesResponse>
  >({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/memories${qs ? `?${qs}` : ''}`,
    method: 'GET',
    token,
  });

  return {
    success: Boolean(response?.success),
    message: response?.message,
    count: Number(response?.count ?? 0),
    limit: Number(response?.limit ?? options.limit ?? 100),
    offset: Number(response?.offset ?? options.offset ?? 0),
    user_id: response?.user_id,
    memories: Array.isArray(response?.memories) ? response.memories : [],
  };
};

/**
 * Fetch one persisted memory by id from the runtimes API.
 */
export const getRuntimeMemory = async (
  token: string,
  memoryId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<GetRuntimeMemoryResponse> => {
  validateToken(token);
  validateRequiredString(memoryId, 'Memory id');

  const response = await requestDatalayerAPI<Partial<GetRuntimeMemoryResponse>>(
    {
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/memories/${encodeURIComponent(memoryId)}`,
      method: 'GET',
      token,
    },
  );

  return {
    success: Boolean(response?.success),
    message: response?.message,
    memory: response?.memory as RuntimeMemory,
  };
};

/**
 * Resume a paused runtime by restoring from a checkpoint (async).
 *
 * Returns immediately with a 202 Accepted response.  The actual restore
 * process runs in the background.  Use the returned `checkpoint_id` to
 * poll for status.
 *
 * @param token - Authentication token
 * @param runtimeName - The uid of the runtime to resume
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @param body - Optional body with agent_spec_id and restore options
 * @returns Promise resolving with the checkpoint ID for status tracking
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If the uid is missing or invalid
 */
export const resumeRuntime = async (
  token: string,
  runtimeName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  body?: ResumeRuntimeBody,
): Promise<PauseResumeResponse> => {
  validateToken(token);
  validateRequiredString(runtimeName, 'Runtime uid');

  return await requestDatalayerAPI<PauseResumeResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtimes/${encodeURIComponent(runtimeName)}/resume`,
    method: 'POST',
    token,
    ...(body ? { body } : {}),
  });
};
