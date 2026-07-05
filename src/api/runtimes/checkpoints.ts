/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtime checkpoints API functions for the Datalayer platform.
 *
 * Provides functions for managing CRIU full-pod checkpoints.
 * These are distinct from code sandbox snapshots (Jupyter sandbox snapshots).
 *
 * @module api/runtimes/checkpoints
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  validateToken,
  validateRequiredString,
} from '@datalayer/core/lib/api/utils/validation';

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * A single runtime checkpoint record.
 */
export interface RuntimeCheckpointData {
  /** Unique identifier (ULID) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Checkpoint description */
  description: string;
  /** Runtime that was checkpointed */
  runtime_uid: string;
  /** Agentspec identifier (e.g. "mocks/monitor-sales-kpis") */
  agent_spec_id: string;
  /** Full agentspec payload */
  agentspec: Record<string, any>;
  /** Additional metadata */
  metadata: Record<string, any>;
  /** Checkpoint mode: criu (full) or light (history-only) */
  checkpoint_mode?: 'criu' | 'light';
  /** Lightweight checkpoint message history */
  messages?: string[];
  /** Status: requested | created | failed | deleted */
  status: string;
  /** Human-readable details about the current status (e.g. error message) */
  status_message?: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

/**
 * Request payload for creating a checkpoint.
 */
export interface CreateRuntimeCheckpointRequest {
  /** Runtime UID of the runtime that was checkpointed */
  runtime_uid: string;
  /** Human-readable name */
  name?: string;
  /** Checkpoint description */
  description?: string;
  /** Agentspec identifier */
  agentspec_id?: string;
  /** Full agentspec payload to persist */
  agentspec?: Record<string, any>;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response for listing checkpoints.
 */
export interface ListRuntimeCheckpointsResponse {
  success: boolean;
  message: string;
  checkpoints: RuntimeCheckpointData[];
}

/**
 * Response for getting a single checkpoint.
 */
export interface GetRuntimeCheckpointResponse {
  success: boolean;
  message: string;
  checkpoint: RuntimeCheckpointData;
}

/**
 * Response for creating a checkpoint.
 */
export interface CreateRuntimeCheckpointResponse {
  success: boolean;
  message: string;
  checkpoint: RuntimeCheckpointData;
}

// ─── API Functions ─────────────────────────────────────────────────────────

/**
 * List runtime checkpoints for a specific runtime.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the runtimes API
 * @param runtimeUid - Runtime UID to list checkpoints for
 * @returns Promise resolving to list of checkpoints
 */
export const listCheckpoints = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  runtimeUid?: string,
): Promise<ListRuntimeCheckpointsResponse> => {
  validateToken(token);

  if (!runtimeUid) {
    throw new Error('runtimeUid is required to list checkpoints');
  }

  return requestDatalayerAPI<ListRuntimeCheckpointsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtime-checkpoints/${encodeURIComponent(runtimeUid)}`,
    method: 'GET',
    token,
  });
};

/**
 * Get a single runtime checkpoint by ID.
 * @param token - Authentication token
 * @param runtimeUid - The runtime UID
 * @param checkpointId - The checkpoint ID (ULID)
 * @param baseUrl - Base URL for the runtimes API
 * @returns Promise resolving to checkpoint details
 */
export const getCheckpoint = async (
  token: string,
  runtimeUid: string,
  checkpointId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<GetRuntimeCheckpointResponse> => {
  validateToken(token);
  validateRequiredString(runtimeUid, 'Runtime UID');
  validateRequiredString(checkpointId, 'Checkpoint ID');

  return requestDatalayerAPI<GetRuntimeCheckpointResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtime-checkpoints/${encodeURIComponent(runtimeUid)}/${checkpointId}`,
    method: 'GET',
    token,
  });
};

/**
 * Create a checkpoint record (after a CRIU checkpoint has been taken).
 * @param token - Authentication token
 * @param data - Checkpoint creation payload (runtime_uid, agentspec, etc.)
 * @param baseUrl - Base URL for the runtimes API
 * @returns Promise resolving to the created checkpoint
 */
export const createCheckpoint = async (
  token: string,
  data: CreateRuntimeCheckpointRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<CreateRuntimeCheckpointResponse> => {
  validateToken(token);

  return requestDatalayerAPI<CreateRuntimeCheckpointResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtime-checkpoints`,
    method: 'POST',
    token,
    body: data,
  });
};

/**
 * Poll a checkpoint until it reaches one of the target statuses.
 *
 * Useful for waiting until an async pause (status "paused")
 * completes before proceeding.  Checkpoint status stays "paused"
 * during resume — only the agent runtime status transitions.
 *
 * @param token - Authentication token
 * @param runtimeUid - The runtime UID that owns the checkpoint
 * @param checkpointId - The checkpoint ID (ULID) to poll
 * @param targetStatuses - Set of statuses that signal completion (e.g. ["paused", "failed"])
 * @param baseUrl - Base URL for the runtimes API
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 * @param timeoutMs - Maximum wait time in milliseconds (default: 600000 = 10 min)
 * @returns Promise resolving to the checkpoint data once a target status is reached
 * @throws {Error} If polling times out or the request fails
 */
export const waitForCheckpointStatus = async (
  token: string,
  runtimeUid: string,
  checkpointId: string,
  targetStatuses: string[],
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  intervalMs: number = 2000,
  timeoutMs: number = 600_000,
): Promise<RuntimeCheckpointData> => {
  validateToken(token);
  validateRequiredString(runtimeUid, 'Runtime UID');
  validateRequiredString(checkpointId, 'Checkpoint ID');

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const resp = await getCheckpoint(token, runtimeUid, checkpointId, baseUrl);
    if (targetStatuses.includes(resp.checkpoint.status)) {
      return resp.checkpoint;
    }
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Checkpoint ${checkpointId} did not reach status [${targetStatuses.join(', ')}] within ${timeoutMs / 1000}s`,
  );
};

/**
 * Delete a runtime checkpoint.
 * @param token - Authentication token
 * @param runtimeUid - The runtime UID that owns the checkpoint
 * @param checkpointId - The checkpoint ID (ULID) to delete
 * @param baseUrl - Base URL for the runtimes API
 * @returns Promise resolving when deletion is complete
 */
export const deleteCheckpoint = async (
  token: string,
  runtimeUid: string,
  checkpointId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<void> => {
  validateToken(token);
  validateRequiredString(runtimeUid, 'Runtime UID');
  validateRequiredString(checkpointId, 'Checkpoint ID');

  return requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/runtime-checkpoints/${encodeURIComponent(runtimeUid)}/${checkpointId}`,
    method: 'DELETE',
    token,
  });
};
