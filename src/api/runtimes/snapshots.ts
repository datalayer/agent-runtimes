/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Code Sandbox snapshots API functions for the Datalayer platform.
 *
 * Provides functions for managing code sandbox snapshots (saved runtime states).
 *
 * @module api/runtimes/snapshots
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  CreateCodeSandboxSnapshotRequest,
  ListCodeSandboxSnapshotsResponse,
  GetCodeSandboxSnapshotResponse,
  CreateCodeSandboxSnapshotResponse,
} from '../../models/CodeSandboxSnapshotDTO';
import {
  validateToken,
  validateRequiredString,
} from '@datalayer/core/lib/api/utils/validation';

/**
 * Create a snapshot of a runtime instance.
 * @param token - Authentication token
 * @param data - Snapshot creation configuration
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the created snapshot response
 * @throws {Error} If authentication token is missing or invalid
 */
export const createSnapshot = async (
  token: string,
  data: CreateCodeSandboxSnapshotRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<CreateCodeSandboxSnapshotResponse> => {
  validateToken(token);

  return requestDatalayerAPI<CreateCodeSandboxSnapshotResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/sandbox-snapshots`,
    method: 'POST',
    token,
    body: data,
  });
};

/**
 * List all code sandbox snapshots.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to list of snapshots
 * @throws {Error} If authentication token is missing or invalid
 */
export const listSnapshots = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<ListCodeSandboxSnapshotsResponse> => {
  validateToken(token);

  return requestDatalayerAPI<ListCodeSandboxSnapshotsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/sandbox-snapshots`,
    method: 'GET',
    token,
  });
};

/**
 * Get details for a specific code sandbox snapshot.
 * @param token - Authentication token
 * @param snapshotId - The unique identifier of the snapshot
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to snapshot details wrapped in response
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If snapshot ID is missing or invalid
 */
export const getSnapshot = async (
  token: string,
  snapshotId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<GetCodeSandboxSnapshotResponse> => {
  validateToken(token);
  validateRequiredString(snapshotId, 'Snapshot ID');

  return requestDatalayerAPI<GetCodeSandboxSnapshotResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/sandbox-snapshots/${snapshotId}`,
    method: 'GET',
    token,
  });
};

/**
 * Delete a code sandbox snapshot.
 * @param token - Authentication token
 * @param snapshotId - The unique identifier of the snapshot to delete
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving when deletion is complete
 * @throws {Error} If authentication token is missing or invalid
 * @throws {Error} If snapshot ID is missing or invalid
 */
export const deleteSnapshot = async (
  token: string,
  snapshotId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<void> => {
  validateToken(token);
  validateRequiredString(snapshotId, 'Snapshot ID');

  return requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/sandbox-snapshots/${snapshotId}`,
    method: 'DELETE',
    token,
  });
};
