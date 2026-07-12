/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * API client functions for the agents backend.
 *
 * Provides functions to create, list, and manage agents
 * via the agent-runtimes REST API.
 *
 * @module api
 */

// Agents Service API (agents, notifications, etc.)
// Tool approvals are intentionally NOT exposed over REST here — all
// approval interactions flow over the websocket stream; see
// `hooks/useToolApprovals` and `components/ToolApprovalBanner`.
export * as agents from './agents';
export * as context from './context';
export * as evals from './evals';
export * as events from './events';
export * as notifications from './notifications';
export * as output from './output';
export * from '../runtimes';

import { iamStore } from '@datalayer/core/lib/state';
import { listEnvironments } from './runtimes/environments';
import {
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
} from './runtimes/snapshots';
import type { ListEnvironmentsResponse } from '../models/EnvironmentDTO';
import type {
  CreateCodeSandboxSnapshotRequest,
  CodeSandboxSnapshotData,
} from '../models/CodeSandboxSnapshotDTO';
import {
  asCodeSandboxSnapshot,
  type ICodeSandboxSnapshot,
} from '../models/CodeSandboxSnapshot';

function resolveToken(token?: string): string {
  const resolved = token ?? iamStore.getState()?.token;
  if (!resolved) {
    throw new Error('Authentication token is required');
  }
  return resolved;
}

export async function getEnvironments(
  token?: string,
  baseUrl?: string,
): Promise<ListEnvironmentsResponse['environments']> {
  const response = await listEnvironments(resolveToken(token), baseUrl);
  return (response.environments ?? []).map(environment => ({
    ...environment,
    burningRate:
      (environment as any).burningRate ?? (environment as any).burning_rate,
  }));
}

export async function getSandboxSnapshots(
  token?: string,
  baseUrl?: string,
): Promise<ICodeSandboxSnapshot[]> {
  const response = await listSnapshots(resolveToken(token), baseUrl);
  return (response.snapshots ?? []).map(snapshot =>
    asCodeSandboxSnapshot(snapshot as any),
  );
}

export async function createSandboxSnapshot(
  data: CreateCodeSandboxSnapshotRequest | Record<string, any>,
  token?: string,
  baseUrl?: string,
): Promise<CodeSandboxSnapshotData | Record<string, any>> {
  // Legacy browser snapshots pass a rich object (connection, metadata, callbacks)
  // that is handled client-side. Keep compatibility by returning early.
  if (!('pod_name' in data)) {
    return data;
  }
  const response = await createSnapshot(
    resolveToken(token),
    data as CreateCodeSandboxSnapshotRequest,
    baseUrl,
  );
  return response.snapshot;
}

export async function deleteCodeSandboxSnapshot(
  snapshotId: string,
  token?: string,
  baseUrl?: string,
): Promise<void> {
  return deleteSnapshot(resolveToken(token), snapshotId, baseUrl);
}

export async function exportCodeSandboxSnapshot(
  ..._args: any[]
): Promise<never> {
  throw new Error(
    'exportCodeSandboxSnapshot is not implemented in @datalayer/agent-runtimes/api yet.',
  );
}

export async function updateCodeSandboxSnapshot(
  ..._args: any[]
): Promise<never> {
  throw new Error(
    'updateCodeSandboxSnapshot is not implemented in @datalayer/agent-runtimes/api yet.',
  );
}

export async function uploadCodeSandboxSnapshot(
  ..._args: any[]
): Promise<never> {
  throw new Error(
    'uploadCodeSandboxSnapshot is not implemented in @datalayer/agent-runtimes/api yet.',
  );
}

// Re-export core API endpoints for IAM/plans/account features.
export * from '@datalayer/core/lib/api';
