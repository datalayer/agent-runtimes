/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Snapshot domain model for the Datalayer Client.
 *
 * @module models/CodeSandboxSnapshotDTO
 */

import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { RuntimeDTO } from './RuntimeDTO';
import { snapshots } from '../api/runtimes';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a runthime snapshot of a runtime's state and files.
 * @interface CodeSandboxSnapshotData
 */
export interface CodeSandboxSnapshotData {
  /** Unique identifier for the snapshot */
  uid: string;
  /** Name of the snapshot */
  name: string;
  /** Optional description of the snapshot */
  description?: string;
  /** Name of the environment used by the runtime */
  environment: string;
  /** Metadata associated with the snapshot */
  metadata?: {
    version?: string;
    language_info?: any;
    [key: string]: any;
  };
  /** Size of the snapshot in bytes */
  size?: number;
  /** Format of the snapshot */
  format?: string;
  /** Format version of the snapshot */
  format_version?: string;
  /** Status of the snapshot */
  status?: string;
  /** ISO 8601 timestamp when the snapshot was last updated */
  updated_at: string;
  /** List of files included in the snapshot */
  files?: any[]; // Simplified - SandboxSnapshotFile type removed
}

/**
 * Stable public interface for Snapshot data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface CodeSandboxSnapshotJSON {
  /** Unique identifier for the snapshot */
  uid: string;
  /** Name of the snapshot */
  name: string;
  /** Optional description of the snapshot */
  description?: string;
  /** Name of the environment used by the runtime */
  environment: string;
  /** ISO 8601 timestamp when the snapshot was last updated */
  updatedAt: string;
}

/**
 * Request payload for creating a code sandbox snapshot
 * @interface CreateCodeSandboxSnapshotRequest
 */
export interface CreateCodeSandboxSnapshotRequest {
  /** Pod name of the runtime to snapshot */
  pod_name: string;
  /** Name for the snapshot */
  name: string;
  /** Description of the snapshot */
  description: string;
  /** Whether to stop the runtime after creating snapshot */
  stop: boolean;
}

/**
 * Response for getting a specific code snapshot snapshot
 * @interface GetCodeSandboxSnapshotResponse
 */
export interface GetCodeSandboxSnapshotResponse {
  /** Indicates if the request was successful */
  success: boolean;
  /** Response message */
  message: string;
  /** The snapshot details */
  snapshot: CodeSandboxSnapshotData;
}

/**
 * Response for creating a code sandbox snapshot
 * @interface CreateCodeSandboxSnapshotResponse
 */
export interface CreateCodeSandboxSnapshotResponse {
  /** Indicates if the request was successful */
  success: boolean;
  /** Response message */
  message: string;
  /** The created snapshot details */
  snapshot: CodeSandboxSnapshotData;
}

/**
 * Response from listing code sandbox snapshots
 * @interface ListCodeSandboxSnapshotsResponse
 */
export interface ListCodeSandboxSnapshotsResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response message from the server */
  message: string;
  /** Array of code sandbox snapshots */
  snapshots: CodeSandboxSnapshotData[];
}

/**
 * Snapshot domain model that wraps API responses with convenient methods.
 * Provides code sandbox snapshot management with data refresh and lifecycle operations.
 *
 * @example
 * ```typescript
 * const snapshot = await runtime.createSnapshot('my-checkpoint');
 * const runtime = await snapshot.restore();
 * ```
 */
export class CodeSandboxSnapshotDTO {
  protected _data: CodeSandboxSnapshotData;
  private _client: DatalayerClient;
  private _deleted: boolean = false;

  /**
   * Create a Code Sandbox Snapshot instance.
   *
   * @param data - Snapshot data from API
   * @param client - Client instance
   */
  constructor(data: CodeSandboxSnapshotData, client: DatalayerClient) {
    this._data = data;
    this._client = client;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Check if this snapshot has been deleted and throw error if so.
   * @throws Error if deleted
   */
  private _checkDeleted(): void {
    if (this._deleted) {
      throw new Error(
        `Snapshot ${this._data.uid} has been deleted and no longer exists`,
      );
    }
  }

  // ========================================================================
  // Static Properties (set at creation, never change)
  // ========================================================================

  /** Unique identifier for the snapshot. */
  get uid(): string {
    this._checkDeleted();
    return this._data.uid;
  }

  /** Name of the snapshot. */
  get name(): string {
    this._checkDeleted();
    return this._data.name;
  }

  /** Description of the snapshot. */
  get description(): string {
    this._checkDeleted();
    return this._data.description || '';
  }

  /** Name of the environment used by the runtime. */
  get environment(): string {
    this._checkDeleted();
    return this._data.environment;
  }

  /** When the snapshot was last updated. */
  get updatedAt(): Date {
    this._checkDeleted();
    return new Date(this._data.updated_at);
  }

  // ========================================================================
  // Action Methods
  // ========================================================================

  /**
   * Delete this snapshot permanently.
   * After deletion, subsequent calls to dynamic methods will throw errors.
   */
  async delete(): Promise<void> {
    this._checkDeleted();
    const token = (this._client as any).getToken();
    const runtimesUrl = (this._client as any).getRuntimesUrl();
    await snapshots.deleteSnapshot(token, this.uid, runtimesUrl);
    this._deleted = true;
  }

  /**
   * Create a code sandbox from this snapshot (restore functionality).
   *
   * @param minutesLimit - Time limit in minutes for the restored runtime
   * @returns Created Runtime instance
   */
  async restore(minutesLimit: number): Promise<RuntimeDTO> {
    this._checkDeleted();
    return await (this._client as any).createRuntime({
      environmentName: this.environment,
      type: 'notebook',
      givenName: `Restored from ${this.name}`,
      minutesLimit: minutesLimit,
      fromSnapshotId: this.uid,
    });
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get code snapshot snapshot data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   * Note: Returns current cached state - call getStatus() first if you need fresh data.
   *
   * @returns Core code snapshot snapshot data with camelCase properties
   */
  toJSON(): CodeSandboxSnapshotJSON {
    this._checkDeleted();
    const obj = {
      uid: this.uid,
      name: this.name,
      description: this.description,
      environment: this.environment,
      updatedAt: this.updatedAt.toISOString(),
    };
    validateJSON(obj, 'Snapshot');
    return obj;
  }

  /**
   * Get the raw snapshot data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   *
   * @returns Raw snapshot data from API
   */
  rawData(): CodeSandboxSnapshotData {
    this._checkDeleted();
    return this._data;
  }

  /** String representation of the snapshot. */
  toString(): string {
    this._checkDeleted();
    return `Snapshot(${this.uid}, ${this.name})`;
  }
}
