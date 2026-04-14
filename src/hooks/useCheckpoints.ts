/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent checkpoint hooks.
 *
 * Includes query hooks for listing checkpoints and mutation hooks
 * for pause, resume, and checkpoint lifecycle operations.
 *
 * @module hooks/useCheckpoints
 */

import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useIAMStore } from '@datalayer/core/lib/state';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { agentQueryKeys, AGENT_QUERY_OPTIONS } from './useAgentRuntimes';
import type {
  CheckpointMode,
  AgentStatus,
  AgentConnection,
  CheckpointRecord,
} from '../types';

/**
 * Checkpoint data returned by the runtime-checkpoints API.
 */
export type CheckpointData = {
  id: string;
  name: string;
  description: string;
  runtime_uid: string;
  agent_spec_id: string;
  agentspec: Record<string, unknown>;
  metadata: Record<string, unknown>;
  checkpoint_mode?: 'criu' | 'light';
  messages?: string[];
  status: string;
  status_message: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// Parameter types for pause / resume / checkpoint mutations
// ═══════════════════════════════════════════════════════════════════════════

export type PauseAgentParams = {
  podName: string;
  mode?: CheckpointMode;
  agentSpecId?: string;
  agentSpec?: Record<string, any>;
  messages?: string[];
};

export type ResumeAgentParams = {
  podName: string;
  agentSpecId?: string;
  mode?: CheckpointMode;
  checkpointId?: string;
};

export type CheckpointAgentParams = {
  podName: string;
  name?: string;
  mode?: CheckpointMode;
  agentSpecId?: string;
  agentSpec?: Record<string, any>;
  messages?: string[];
};

export type TerminateAgentParams = {
  podName: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// Query hooks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all runtime checkpoints for the current user.
 *
 * Calls ``GET /api/runtimes/v1/runtime-checkpoints`` and returns
 * the list of checkpoint records in visible states.
 */
export function useCheckpointsQuery() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const { user } = useIAMStore();

  return useQuery({
    queryKey: agentQueryKeys.checkpoints.lists(),
    queryFn: async () => {
      const resp = await requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtime-checkpoints`,
        method: 'GET',
      });
      if (resp.success && resp.checkpoints) {
        return resp.checkpoints as CheckpointData[];
      }
      return [] as CheckpointData[];
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: 15000,
    enabled: !!user,
  });
}

/**
 * Hook to refresh the checkpoints list.
 */
export function useRefreshCheckpoints() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: agentQueryKeys.checkpoints.all(),
    });
  };
}

/**
 * Hook to delete a paused agent runtime.
 *
 * Paused agents have no K8s pod — their state lives entirely in Solr
 * checkpoint records. This calls the dedicated
 * ``DELETE /runtimes/{podName}/paused`` endpoint which removes those
 * Solr records.
 */
export function useDeletePausedAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podName: string) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}/paused`,
        method: 'DELETE',
      });
    },
    onSuccess: (_data, podName) => {
      queryClient.cancelQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.removeQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

/**
 * Hook to resume a paused agent runtime via checkpoint restore.
 */
export function useResumePausedAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podName: string) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}/resume`,
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutation hooks (pause / resume / checkpoint)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to pause an agent runtime (creates a checkpoint).
 *
 * Calls ``POST .../pause`` then polls ``waitForCheckpointStatus``
 * until the checkpoint reaches ``paused`` or ``failed``.
 * On success, both runtimes and checkpoints queries are invalidated.
 */
export function usePauseAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PauseAgentParams) => {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const runtimesRunUrl =
        coreStore.getState().configuration?.runtimesRunUrl || '';
      const { pauseRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');

      const mode = params.mode || 'light';
      const resp = await pauseRuntime(token, params.podName, runtimesRunUrl, {
        agent_spec_id: params.agentSpecId,
        checkpoint_mode: mode,
        ...(params.messages && mode === 'light'
          ? { messages: params.messages }
          : {}),
        ...(params.agentSpec ? { agentspec: params.agentSpec } : {}),
      });

      if (resp.checkpoint_id) {
        const { waitForCheckpointStatus } =
          await import('@datalayer/core/lib/api/runtimes/checkpoints');
        const ckpt = await waitForCheckpointStatus(
          token,
          params.podName,
          resp.checkpoint_id,
          ['paused', 'failed'],
          runtimesRunUrl,
        );
        if (ckpt.status === 'failed') {
          throw new Error(
            `Checkpoint ${resp.checkpoint_id} failed during ${mode.toUpperCase()} pause`,
          );
        }
      }

      return resp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

/**
 * Hook to resume a paused agent runtime from a checkpoint.
 *
 * Calls ``POST .../resume`` then invalidates both runtimes and
 * checkpoints queries so the UI reflects the new state.
 */
export function useResumeAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ResumeAgentParams) => {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const runtimesRunUrl =
        coreStore.getState().configuration?.runtimesRunUrl || '';
      const { resumeRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');

      return resumeRuntime(token, params.podName, runtimesRunUrl, {
        agent_spec_id: params.agentSpecId,
        ...(params.mode ? { checkpoint_mode: params.mode } : {}),
        ...(params.checkpointId ? { checkpoint_id: params.checkpointId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

/**
 * Hook to create a named checkpoint (pause → wait → stay paused).
 *
 * Unlike ``usePauseAgent`` which is intended for a full pause lifecycle,
 * this hook creates a named checkpoint record for later restore.
 */
export function useCheckpointAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CheckpointAgentParams) => {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const runtimesRunUrl =
        coreStore.getState().configuration?.runtimesRunUrl || '';
      const { pauseRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');
      const { waitForCheckpointStatus } =
        await import('@datalayer/core/lib/api/runtimes/checkpoints');

      const mode = params.mode || 'criu';
      const pauseResp = await pauseRuntime(
        token,
        params.podName,
        runtimesRunUrl,
        {
          name: params.name || `checkpoint-${Date.now()}`,
          description: `${mode.toUpperCase()} checkpoint for ${params.agentSpecId}`,
          checkpoint_mode: mode,
          ...(params.messages && mode === 'light'
            ? { messages: params.messages }
            : {}),
          agent_spec_id: params.agentSpecId,
          agentspec: params.agentSpec || {},
        },
      );

      const checkpointId = pauseResp.checkpoint_id;
      if (!checkpointId) {
        throw new Error('Pause did not return a checkpoint_id');
      }

      const ckpt = await waitForCheckpointStatus(
        token,
        params.podName,
        checkpointId,
        ['paused', 'failed'],
        runtimesRunUrl,
      );
      if (ckpt.status === 'failed') {
        throw new Error(
          `Checkpoint ${checkpointId} failed during ${mode.toUpperCase()} pause`,
        );
      }

      return { ...pauseResp, checkpoint: ckpt };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Terminate mutation hook
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to terminate an agent runtime (delete it).
 */
export function useTerminateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TerminateAgentParams) => {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const runtimesRunUrl =
        coreStore.getState().configuration?.runtimesRunUrl || '';
      const { deleteRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');
      return deleteRuntime(token, params.podName, runtimesRunUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent lifecycle hook
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for {@link useAgentLifecycle}.
 */
export interface AgentLifecycleOptions {
  /** Agent spec ID (identifies the agent for lifecycle management) */
  agentSpecId?: string;
  /** Full agent spec object (persisted with checkpoints) */
  agentSpec?: Record<string, any>;
  /** Current runtime connection from the agent store */
  runtime: AgentConnection | null;
  /** Callback to connect to a new runtime pod */
  connectToRuntime: (opts: {
    podName: string;
    environmentName: string;
    jupyterBaseUrl?: string;
  }) => void;
  /** Callback to disconnect from the runtime */
  disconnect: () => void;
  /** Callback to launch a new runtime */
  launchRuntime: () => Promise<AgentConnection>;
  /**
   * Callback fired when the hook needs to signal
   * that the agent should be re-created on a (possibly new) pod.
   */
  onResetAgentCreation?: () => void;
}

/**
 * Return type for {@link useAgentLifecycle}.
 */
export interface AgentLifecycleReturn {
  /** Pause the agent (checkpoint-mode aware) */
  pause: (mode?: CheckpointMode, messages?: string[]) => Promise<void>;
  /** Resume a paused agent (checkpoint restore) */
  resume: (
    mode?: CheckpointMode,
    checkpointId?: string,
    podName?: string,
  ) => Promise<void>;
  /** Terminate the agent (delete runtime) */
  terminate: () => Promise<void>;
  /** Create a named checkpoint (pause → wait → stay paused) */
  checkpoint: (
    name?: string,
    mode?: CheckpointMode,
    messages?: string[],
  ) => Promise<void>;
  /** Refresh the checkpoints list */
  refreshCheckpoints: () => void;
  /** List of persisted checkpoints */
  checkpoints: CheckpointRecord[];
  /** Lifecycle status */
  status: AgentStatus;
  /** Lifecycle error */
  error: string | null;
  /** Update the lifecycle status directly */
  setStatus: (status: AgentStatus) => void;
  /** Update the lifecycle error directly */
  setError: (error: string | null) => void;
}

/**
 * High-level hook that manages the full agent lifecycle:
 * pause, resume, checkpoint, terminate, and status tracking.
 *
 * Designed to be composed inside `useAgents` or used standalone
 * by advanced consumers who need direct access.
 */
export function useAgentLifecycle(
  options: AgentLifecycleOptions,
): AgentLifecycleReturn {
  const {
    agentSpecId,
    agentSpec,
    runtime,
    connectToRuntime,
    disconnect,
    launchRuntime,
    onResetAgentCreation,
  } = options;

  // Local lifecycle state
  const [lifecycleStatus, setLifecycleStatus] = useState<AgentStatus>('idle');
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  // Mutation hooks
  const pauseAgentMutation = usePauseAgent();
  const resumeAgentMutation = useResumeAgent();
  const checkpointAgentMutation = useCheckpointAgent();
  const terminateAgentMutation = useTerminateAgent();
  const checkpointsQuery = useCheckpointsQuery();
  const refreshCheckpointsList = useRefreshCheckpoints();

  // ─── Pause ──────────────────────────────────────────────────────────

  const pause = useCallback(
    async (mode: CheckpointMode = 'light', messages?: string[]) => {
      if (!runtime) {
        setLifecycleError('No runtime to pause');
        return;
      }
      if (lifecycleStatus === 'resumed') {
        setLifecycleError('Resumed agents cannot be paused');
        return;
      }
      try {
        await pauseAgentMutation.mutateAsync({
          podName: runtime.podName,
          mode,
          agentSpecId,
          agentSpec,
          messages,
        });
        setLifecycleStatus('paused');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLifecycleError(msg);
      }
    },
    [runtime, lifecycleStatus, agentSpecId, agentSpec, pauseAgentMutation],
  );

  // ─── Resume ─────────────────────────────────────────────────────────

  const resume = useCallback(
    async (
      mode: CheckpointMode = 'criu',
      checkpointId?: string,
      podName?: string,
    ) => {
      setLifecycleStatus('resuming');
      setLifecycleError(null);
      try {
        const checkpoints = checkpointsQuery.data || [];
        const targetPodName =
          podName ||
          runtime?.podName ||
          (checkpointId
            ? checkpoints.find(
                (c: { id: string; runtime_uid: string }) =>
                  c.id === checkpointId,
              )?.runtime_uid
            : undefined);
        if (targetPodName) {
          await resumeAgentMutation.mutateAsync({
            podName: targetPodName,
            agentSpecId,
            mode,
            checkpointId,
          });

          // Refresh and rebind runtime connection so downstream calls
          // target the restored runtime URL.
          try {
            const { iamStore, coreStore } =
              await import('@datalayer/core/lib/state');
            const token = iamStore.getState().token || '';
            const runtimesRunUrl =
              coreStore.getState().configuration?.runtimesRunUrl || '';
            const { listRuntimes } =
              await import('@datalayer/core/lib/api/runtimes/runtimes');
            const runtimesResponse = await listRuntimes(token, runtimesRunUrl);
            const runtimes = runtimesResponse.runtimes || [];
            const aiAgentRuntimes = runtimes.filter(rt => {
              if (rt.environment_name !== 'ai-agents-env') {
                return false;
              }
              if (!agentSpecId) {
                return true;
              }
              const runtimeAgentSpecId = (rt as { agent_spec_id?: string })
                .agent_spec_id;
              return runtimeAgentSpecId === agentSpecId;
            });
            const latestRuntime = aiAgentRuntimes.slice().sort((a, b) => {
              const aTs = Number(a.started_at || 0);
              const bTs = Number(b.started_at || 0);
              return bTs - aTs;
            })[0];
            if (latestRuntime?.pod_name && latestRuntime?.ingress) {
              connectToRuntime({
                podName: latestRuntime.pod_name,
                environmentName: latestRuntime.environment_name,
                jupyterBaseUrl: latestRuntime.ingress,
              });
            }
          } catch (refreshError) {
            console.warn(
              'Failed to refresh runtime binding after resume:',
              refreshError,
            );
          }

          onResetAgentCreation?.();
          setLifecycleStatus('resumed');
        } else {
          await launchRuntime();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLifecycleError(msg);
        setLifecycleStatus('error');
      }
    },
    [
      runtime,
      checkpointsQuery.data,
      agentSpecId,
      resumeAgentMutation,
      launchRuntime,
      connectToRuntime,
      onResetAgentCreation,
    ],
  );

  // ─── Checkpoint ─────────────────────────────────────────────────────

  const checkpoint = useCallback(
    async (
      name?: string,
      mode: CheckpointMode = 'criu',
      messages?: string[],
    ) => {
      if (!runtime) {
        setLifecycleError('No runtime to checkpoint');
        return;
      }
      try {
        await checkpointAgentMutation.mutateAsync({
          podName: runtime.podName,
          name,
          mode,
          agentSpecId,
          agentSpec,
          messages,
        });
        setLifecycleStatus('paused');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLifecycleError(msg);
      }
    },
    [runtime, agentSpecId, agentSpec, checkpointAgentMutation],
  );

  // ─── Terminate ──────────────────────────────────────────────────────

  const terminate = useCallback(async () => {
    if (!runtime) {
      disconnect();
      setLifecycleStatus('idle');
      return;
    }
    try {
      await terminateAgentMutation.mutateAsync({
        podName: runtime.podName,
      });
      disconnect();
      setLifecycleStatus('idle');
      setLifecycleError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLifecycleError(msg);
    }
  }, [runtime, terminateAgentMutation, disconnect]);

  // ─── Refresh Checkpoints ────────────────────────────────────────────

  const refreshCheckpoints = useCallback(() => {
    refreshCheckpointsList();
  }, [refreshCheckpointsList]);

  return {
    pause,
    resume,
    terminate,
    checkpoint,
    refreshCheckpoints,
    checkpoints: (checkpointsQuery.data || []) as CheckpointRecord[],
    status: lifecycleStatus,
    error: lifecycleError,
    setStatus: setLifecycleStatus,
    setError: setLifecycleError,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Composite hook
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Composite hook for checkpoint operations.
 *
 * Provides query access (list + refresh) and mutation hooks
 * for pause, resume, and checkpoint lifecycle.
 */
export function useCheckpoints() {
  const checkpointsQuery = useCheckpointsQuery();
  const refresh = useRefreshCheckpoints();
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();
  const checkpointAgent = useCheckpointAgent();

  return useMemo(
    () => ({
      checkpointsQuery,
      refresh,
      pauseAgent,
      resumeAgent,
      checkpointAgent,
    }),
    [checkpointsQuery, refresh, pauseAgent, resumeAgent, checkpointAgent],
  );
}
