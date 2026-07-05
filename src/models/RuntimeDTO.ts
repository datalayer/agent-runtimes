/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtime domain model for the Datalayer Client.
 *
 * @module models/RuntimeDTO
 */

import { updateRuntime } from '../api/runtimes/runtimes';
import type { AgentRuntimesClient as DatalayerClient } from '../client/AgentRuntimesClient';
import { CodeSandboxSnapshotDTO } from './CodeSandboxSnapshotDTO';
import { validateJSON } from '@datalayer/core/lib/api/utils/validation';

/**
 * Represents a running instance of a computing environment.
 * @interface RuntimeData
 */
export interface RuntimeData {
  /** Kubernetes pod name for the runtime instance */
  pod_name: string;
  /** Unique identifier for the runtime */
  uid: string;
  /** Name of the environment this runtime is based on */
  environment_name: string;
  /** Title of the environment for display */
  environment_title: string;
  /** Type of runtime - notebook, terminal, or job */
  type: string;
  /** Credits consumed per second */
  burning_rate: number;
  /** User-friendly name for the runtime */
  given_name: string;
  /** Authentication token for accessing the runtime */
  token: string;
  /** Ingress URL for accessing the runtime */
  ingress: string;
  /** ISO 8601 timestamp of when the runtime started */
  started_at: string;
  /** ISO 8601 timestamp of when the runtime will expire */
  expired_at: string;
}

/**
 * Stable public interface for Runtime data.
 * This is the contract that Client consumers can rely on.
 * The raw API may change, but this interface remains stable.
 */
export interface RuntimeJSON {
  /** ulid for the runtime */
  uid: string;
  /** Kubernetes pod name for the runtime instance */
  podName: string;
  /** User-friendly name for the runtime */
  givenName: string;
  /** Name of the environment this runtime is based on */
  environmentName: string;
  /** Title of the environment for display */
  environmentTitle: string;
  /** Type of runtime - notebook, terminal, or job */
  type: string;
  /** Credits consumed per second */
  burningRate: number;
  /** Credits allocated/available to this runtime */
  ingress: string;
  /** Authentication token for accessing the runtime */
  token: string;
  /** When the runtime was started */
  startedAt: string;
  /** When the runtime will expire */
  expiredAt: string;
}

/**
 * Request payload for creating a new runtime
 * @interface CreateRuntimeRequest
 */
export interface CreateRuntimeRequest {
  /** Name of the environment to use */
  environment_name: string;
  /** Type of runtime (e.g., 'notebook', 'terminal', 'job') */
  type?: 'notebook' | 'terminal' | 'job';
  /** Optional given name for the runtime */
  given_name?: string;
  /** Maximum credits this runtime can consume */
  credits_limit?: number;
  /** Optional capabilities for the runtime */
  capabilities?: string[];
  /** Optional source to create runtime from (e.g., snapshot ID) */
  from?: string;
}

/**
 * Response from creating a new runtime
 * @interface CreateRuntimeResponse
 */
export interface CreateRuntimeResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response message from the server */
  message: string;
  /** The created runtime instance */
  runtime: RuntimeData;
}

/**
 * Response from listing runtimes
 * @interface ListRuntimesResponse
 */
export interface ListRuntimesResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response message from the server */
  message: string;
  /** Array of runtime instances */
  runtimes: RuntimeData[];
}

/**
 * Runtime domain model that wraps API responses with convenient methods.
 * Provides state management and lifecycle operations for computational runtimes.
 *
 * @example
 * ```typescript
 * const runtime = await client.createRuntime({ environment_name: 'python-cpu' });
 * await runtime.waitUntilReady();
 * ```
 */
export class RuntimeDTO {
  /** @internal */
  _data: RuntimeData;
  private _client: DatalayerClient;
  private _deleted: boolean = false;

  /**
   * Create a Runtime instance.
   *
   * @param data - Runtime data from API
   * @param client - Client instance
   */
  constructor(data: RuntimeData, client: DatalayerClient) {
    this._data = data;
    this._client = client;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Check if this runtime has been deleted and throw error if so.
   * @throws Error if deleted
   */
  private _checkDeleted(): void {
    if (this._deleted) {
      throw new Error(
        `Runtime ${this._data.pod_name} has been deleted and no longer exists`,
      );
    }
  }

  // ========================================================================
  // Static Properties (set at creation, never change)
  // ========================================================================

  /** Kubernetes pod name for the runtime instance. */
  get podName(): string {
    this._checkDeleted();
    return this._data.pod_name;
  }

  /** Unique identifier for the runtime. */
  get uid(): string {
    this._checkDeleted();
    return this._data.uid;
  }

  /** Name of the environment this runtime is based on. */
  get environmentName(): string {
    this._checkDeleted();
    return this._data.environment_name;
  }

  /** Ingress URL for accessing the runtime. */
  get ingress(): string {
    this._checkDeleted();
    return this._data.ingress;
  }

  /** Authentication token for accessing the runtime. */
  get token(): string {
    this._checkDeleted();
    return this._data.token;
  }

  /** Credits consumed per second. */
  get burningRate(): number {
    this._checkDeleted();
    return this._data.burning_rate;
  }

  /** User-friendly name for the runtime. */
  get givenName(): string {
    this._checkDeleted();
    return this._data.given_name;
  }

  /** Type of runtime (notebook, terminal, or job). */
  get type(): string {
    this._checkDeleted();
    return this._data.type;
  }

  /** When the runtime started. */
  get startedAt(): Date {
    this._checkDeleted();
    return new Date(Number(this._data.started_at) * 1000);
  }

  /** When the runtime will expire. */
  get expiredAt(): Date {
    this._checkDeleted();
    return new Date(Number(this._data.expired_at) * 1000);
  }

  /** Environment title for display. */
  get environmentTitle(): string {
    this._checkDeleted();
    return this._data.environment_title || '';
  }

  // ========================================================================
  // Action Methods
  // ========================================================================

  /**
   * Delete this runtime permanently.
   * After deletion, subsequent calls to dynamic methods will throw errors.
   */
  async delete(): Promise<void> {
    await this._client.deleteRuntime(this.podName);
    this._deleted = true;
  }

  /**
   * Update runtime from a snapshot.
   *
   * @param from - Snapshot identifier to restore from
   * @returns Updated Runtime instance
   */
  async update(from: string): Promise<RuntimeDTO> {
    this._checkDeleted();
    const updated = await updateRuntime(
      (this._client as any).getToken(),
      this.podName,
      from,
      (this._client as any).getRuntimesRunUrl(),
    );
    return new RuntimeDTO(updated, this._client);
  }

  /**
   * Create a snapshot of this runtime.
   *
   * @param name - Name for the snapshot
   * @param description - Optional description
   * @param stop - Whether to stop runtime after snapshotting
   * @returns Created Snapshot instance
   */
  async createSnapshot(
    name: string,
    description?: string,
    stop?: boolean,
  ): Promise<CodeSandboxSnapshotDTO> {
    this._checkDeleted();
    return await (this._client as any).createSnapshot(
      this.podName,
      name,
      description,
      stop,
    );
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get runtime data in camelCase format.
   * Returns only the core fields that consumers need.
   * This provides a stable interface regardless of API changes.
   * Returns the current cached state - call getState() first if you need fresh data.
   *
   * @returns Core runtime data with camelCase properties
   */
  toJSON(): RuntimeJSON {
    this._checkDeleted();

    // Safely convert dates to ISO strings, handling invalid dates
    const safeToISO = (date: Date): string => {
      try {
        const iso = date.toISOString();
        return iso;
      } catch {
        // If date is invalid, return empty string or current time
        return new Date().toISOString();
      }
    };

    const obj = {
      // Core identifiers
      uid: this.uid,
      podName: this.podName,
      givenName: this.givenName,

      // Environment info
      environmentName: this.environmentName,
      environmentTitle: this.environmentTitle,

      // State and type
      type: this.type,

      // Burning
      burningRate: this.burningRate,

      // URLs and tokens
      // FIXME: Consider renaming? jupyterServerUrl and jupyterServerToken
      ingress: this.ingress,
      token: this.token,

      // Timing
      startedAt: safeToISO(this.startedAt),
      expiredAt: safeToISO(this.expiredAt),
    };
    validateJSON(obj, 'Runtime');
    return obj;
  }

  /**
   * Get the raw runtime data exactly as received from the API.
   * This preserves the original snake_case naming from the API response.
   * Returns the current cached state - call getState() first if you need fresh data.
   *
   * @returns Raw runtime data from API
   */
  rawData(): RuntimeData {
    this._checkDeleted();
    return this._data;
  }

  /** String representation of the runtime. */
  toString(): string {
    this._checkDeleted();
    return `Runtime(${this.podName}, ${this.environmentName})`;
  }
}
