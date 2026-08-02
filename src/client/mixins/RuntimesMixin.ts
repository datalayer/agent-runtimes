/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtimes mixin for managing computational environments and runtime instances.
 * @module client/mixins/RuntimesMixin
 */

import * as environments from '../../api/runtimes/environments';
import * as runtimes from '../../api/runtimes/runtimes';
import * as snapshots from '../../api/runtimes/snapshots';
import type { CreateRuntimeRequest } from '../../models/RuntimeDTO';
import type { CreateCodeSandboxSnapshotRequest } from '../../models/CodeSandboxSnapshotDTO';
import type {
  RuntimeMemory,
  ListRuntimeMemoriesOptions,
} from '../../api/runtimes/runtimes';
import type { Constructor } from '@datalayer/core/lib/client/utils/mixins';
import { EnvironmentDTO } from '../../models/EnvironmentDTO';
import { RuntimeDTO } from '../../models/RuntimeDTO';
import { CodeSandboxSnapshotDTO } from '../../models/CodeSandboxSnapshotDTO';
import { HealthCheck } from '@datalayer/core/lib/models/HealthCheck';

/** Options for ensuring a runtime is available. */
export interface EnsureRuntimeOptions {
  /** Name of the environment to use */
  environmentName?: string;
  /** Maximum credits to allocate */
  creditsLimit?: number;
  /** Whether to wait for runtime to be ready */
  waitForReady?: boolean;
  /** Maximum time to wait for ready state (ms) */
  maxWaitTime?: number;
  /** Whether to reuse existing suitable runtime */
  reuseExisting?: boolean;
  /** Snapshot ID to create runtime from */
  snapshotId?: string;
}

/** Runtimes mixin providing computational environment and runtime management. */
export function RuntimesMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    // ========================================================================
    // Helper Functions
    // ========================================================================

    _extractRuntimePodName(
      runtimePodNameOrInstance: string | RuntimeDTO,
    ): string {
      return typeof runtimePodNameOrInstance === 'string'
        ? runtimePodNameOrInstance
        : runtimePodNameOrInstance.podName;
    }

    _extractSnapshotId(
      snapshotIdOrInstance: string | CodeSandboxSnapshotDTO,
    ): string {
      return typeof snapshotIdOrInstance === 'string'
        ? snapshotIdOrInstance
        : snapshotIdOrInstance.uid;
    }
    // ========================================================================
    // Environments
    // ========================================================================

    /**
     * List all available computational environments.
     * @returns Array of Environment model instances
     */
    async listEnvironments(): Promise<EnvironmentDTO[]> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await environments.listEnvironments(token, runtimesUrl);
      // Save for later use after first call
      (this as any).environments = response.environments.map(
        env => new EnvironmentDTO(env, this as any),
      );
      return (this as any).environments;
    }

    // ========================================================================
    // Runtimes
    // ========================================================================

    /**
     * Create a new computational runtime.
     * @param environmentName - Name of the environment to use
     * @param type - Type of runtime
     * @param givenName - User-friendly name for the runtime
     * @param creditsLimit - Credits limit
     * @returns Created runtime
     */
    async createRuntime(
      environmentName: string,
      type: 'notebook' | 'terminal' | 'job',
      givenName: string,
      minutesLimit: number,
      fromSnapshotId?: string,
    ): Promise<RuntimeDTO> {
      if (!(this as any).environments) {
        await this.listEnvironments();
      }

      if ((this as any).environments) {
        const env = (this as any).environments.find(
          (e: EnvironmentDTO) => e.name === environmentName,
        );
        if (!env) {
          throw new Error(
            `Environment "${environmentName}" not found. Available environments: ${(this as any).environments.map((e: EnvironmentDTO) => e.name).join(', ')}`,
          );
        } else {
          const token = (this as any).getToken();
          const runtimesUrl = (this as any).getRuntimesUrl();
          const creditsLimit = (this as any).calculateCreditsFromMinutes(
            minutesLimit,
            env.burningRate,
          );

          const data: CreateRuntimeRequest = {
            environment: {
              name: environmentName,
            },
            type,
            given_name: givenName,
            credits_limit: creditsLimit,
            from: fromSnapshotId,
          };

          const response = await runtimes.createRuntime(
            token,
            data,
            runtimesUrl,
          );
          return new RuntimeDTO(response.runtime, this as any);
        }
      } else {
        throw new Error('Environments not loaded');
      }
    }

    /**
     * List all runtimes.
     * @returns Array of runtimes
     */
    async listRuntimes(): Promise<RuntimeDTO[]> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await runtimes.listRuntimes(token, runtimesUrl);
      return response.runtimes.map(r => new RuntimeDTO(r, this as any));
    }

    /**
     * Get details for a specific runtime by pod name.
     * @param podName - Runtime pod name
     * @returns Runtime details
     */
    async getRuntime(podName: string): Promise<RuntimeDTO> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const runtimeData = await runtimes.getRuntime(
        token,
        podName,
        runtimesUrl,
      );
      return new RuntimeDTO(runtimeData, this as any);
    }

    /**
     * Delete a runtime permanently.
     * @param podName - Runtime pod name
     */
    async deleteRuntime(podName: string): Promise<void> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      await runtimes.deleteRuntime(token, podName, runtimesUrl);
    }

    /**
     * List persisted memories for the authenticated caller.
     *
     * Backend scoping rules apply: non-admin callers are limited to their own
     * personal account.
     */
    async listRuntimeMemories(
      options: ListRuntimeMemoriesOptions = {},
    ): Promise<RuntimeMemory[]> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await runtimes.listRuntimeMemories(
        token,
        options,
        runtimesUrl,
      );
      return response.memories;
    }

    /**
     * Fetch one persisted memory by id.
     */
    async getRuntimeMemory(memoryId: string): Promise<RuntimeMemory> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await runtimes.getRuntimeMemory(
        token,
        memoryId,
        runtimesUrl,
      );
      return response.memory;
    }

    /**
     * Terminate all runtimes.
     * Lists all runtimes and deletes them in parallel.
     * @returns Array of results for each deletion (fulfilled or rejected)
     */
    async terminateAllRuntimes(): Promise<PromiseSettledResult<void>[]> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();

      // List all runtimes
      const response = await runtimes.listRuntimes(token, runtimesUrl);

      // Delete all runtimes in parallel
      const deletePromises = response.runtimes.map(runtime =>
        runtimes.deleteRuntime(token, runtime.pod_name, runtimesUrl),
      );

      return Promise.allSettled(deletePromises);
    }

    // ========================================================================
    // Snapshots
    // ========================================================================

    /**
     * Create a snapshot of a runtime.
     * @param podName - Pod name of the runtime to snapshot
     * @param name - Name for the snapshot
     * @param description - Description of the snapshot
     * @param stop - Whether to stop the runtime after creating snapshot (defaults to false)
     * @returns Created snapshot
     */
    async createSnapshot(
      podName: string,
      name: string,
      description: string,
      stop: boolean = false,
    ): Promise<CodeSandboxSnapshotDTO> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();

      const data: CreateCodeSandboxSnapshotRequest = {
        pod_name: podName,
        name,
        description,
        stop,
      };

      const response = await snapshots.createSnapshot(token, data, runtimesUrl);
      return new CodeSandboxSnapshotDTO(response.snapshot, this as any);
    }

    /**
     * List all code sandbox snapshots.
     * @returns Array of snapshots
     */
    async listSnapshots(): Promise<CodeSandboxSnapshotDTO[]> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await snapshots.listSnapshots(token, runtimesUrl);
      return response.snapshots.map(
        s => new CodeSandboxSnapshotDTO(s, this as any),
      );
    }

    /**
     * Get details for a specific snapshot by ID.
     * @param id - Snapshot ID
     * @returns Snapshot details
     */
    async getSnapshot(id: string): Promise<CodeSandboxSnapshotDTO> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      const response = await snapshots.getSnapshot(token, id, runtimesUrl);
      return new CodeSandboxSnapshotDTO(response.snapshot, this as any);
    }

    /**
     * Delete a snapshot permanently.
     * @param id - Snapshot ID
     */
    async deleteSnapshot(id: string): Promise<void> {
      const token = (this as any).getToken();
      const runtimesUrl = (this as any).getRuntimesUrl();
      await snapshots.deleteSnapshot(token, id, runtimesUrl);
    }

    // ========================================================================
    // Service Health Checks
    // ========================================================================

    /**
     * Check the health status of the Runtimes service.
     * @returns Health check result with status and response time
     */
    async checkRuntimesHealth(): Promise<HealthCheck> {
      const startTime = Date.now();
      const errors: string[] = [];
      let status = 'unknown';
      let healthy = false;

      try {
        // Test basic connectivity by listing environments (lightweight operation)
        const environments = await this.listEnvironments();
        const responseTime = Date.now() - startTime;

        if (Array.isArray(environments)) {
          healthy = true;
          status = 'operational';
        } else {
          status = 'degraded';
          errors.push('Unexpected response format from environments endpoint');
        }

        return new HealthCheck(
          {
            healthy,
            status,
            responseTime,
            errors,
            timestamp: new Date(),
          },
          this as any,
        );
      } catch (error) {
        const responseTime = Date.now() - startTime;
        status = 'down';
        errors.push(`Service unreachable: ${error}`);

        return new HealthCheck(
          {
            healthy: false,
            status,
            responseTime,
            errors,
            timestamp: new Date(),
          },
          this as any,
        );
      }
    }
  };
}
