/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Runtimes client: extends the core Datalayer client (IAM / plans) with
 * runtime and workspace/content (Spacer) capabilities.
 *
 * @module client/AgentRuntimesClient
 */

import {
  DatalayerCoreClient,
  type DatalayerClientConfig,
} from '@datalayer/core/lib/client';
import type { HealthCheck } from '@datalayer/core/lib/models/HealthCheck';
import { RuntimesMixin } from './mixins/RuntimesMixin';
import { SpacerMixin } from './mixins/SpacerMixin';
import type { RuntimeDTO } from '../models/RuntimeDTO';
import type { EnvironmentDTO } from '../models/EnvironmentDTO';
import type { CodeSandboxSnapshotDTO } from '../models/CodeSandboxSnapshotDTO';
import type { SpaceDTO, UpdateSpaceRequest } from '../models/SpaceDTO';
import type { NotebookDTO } from '../models/NotebookDTO';
import type { LexicalDTO } from '../models/LexicalDTO';
import type { ProjectDTO, ProjectDefaultItems } from '../models/ProjectDTO';

// Apply the runtime + content mixins on top of the core client.
const AgentRuntimesClientWithMixins = SpacerMixin(
  RuntimesMixin(DatalayerCoreClient),
);

/**
 * Full Datalayer client for agent runtimes: identity/plans (from core) plus
 * runtime and workspace/content operations.
 *
 * @example
 * ```typescript
 * const client = new AgentRuntimesClient({ token: 'your-token' });
 * const user = await client.whoami();
 * const runtime = await client.createRuntime('env', 'notebook', 'name', 10);
 * ```
 */
export class AgentRuntimesClient extends AgentRuntimesClientWithMixins {
  /**
   * Create an AgentRuntimesClient instance.
   *
   * @param config - Client configuration options.
   */
  constructor(config: DatalayerClientConfig) {
    super(config);
  }
}

// Interface declaration so TypeScript surfaces the mixin methods on the class.
// The IAM/plans methods are inherited from DatalayerCoreClient.
export interface AgentRuntimesClient extends DatalayerCoreClient {
  // Runtime Methods
  listEnvironments(): Promise<EnvironmentDTO[]>;
  ensureRuntime(
    environmentName?: string,
    creditsLimit?: number,
    waitForReady?: boolean,
    maxWaitTime?: number,
    reuseExisting?: boolean,
    snapshotId?: string,
  ): Promise<RuntimeDTO>;
  createRuntime(
    environmentName: string,
    type: 'notebook' | 'terminal' | 'job',
    givenName: string,
    minutesLimit: number,
    fromSnapshotId?: string,
  ): Promise<RuntimeDTO>;
  listRuntimes(): Promise<RuntimeDTO[]>;
  getRuntime(podName: string): Promise<RuntimeDTO>;
  deleteRuntime(podName: string): Promise<void>;
  terminateAllRuntimes(): Promise<PromiseSettledResult<void>[]>;
  createSnapshot(
    podName: string,
    name: string,
    description: string,
    stop?: boolean,
  ): Promise<CodeSandboxSnapshotDTO>;
  listSnapshots(): Promise<CodeSandboxSnapshotDTO[]>;
  getSnapshot(id: string): Promise<CodeSandboxSnapshotDTO>;
  deleteSnapshot(id: string): Promise<void>;
  checkRuntimesHealth(): Promise<HealthCheck>;

  // Spacer Methods
  getMySpaces(): Promise<SpaceDTO[]>;
  createSpace(
    name: string,
    description: string,
    variant: string,
    spaceHandle: string,
    organizationId: string,
    seedSpaceId: string,
    isPublic: boolean,
  ): Promise<SpaceDTO>;
  createNotebook(
    spaceId: string,
    name: string,
    description: string,
    file?: File | Blob,
  ): Promise<NotebookDTO>;
  getNotebook(id: string): Promise<NotebookDTO>;
  updateNotebook(
    id: string,
    name?: string,
    description?: string,
  ): Promise<NotebookDTO>;
  createLexical(
    spaceId: string,
    name: string,
    description: string,
    file?: File | Blob,
  ): Promise<LexicalDTO>;
  getLexical(id: string): Promise<LexicalDTO>;
  updateLexical(
    id: string,
    name?: string,
    description?: string,
  ): Promise<LexicalDTO>;
  getSpaceItems(spaceId: string): Promise<(NotebookDTO | LexicalDTO)[]>;
  getSpaceItem(itemId: string): Promise<NotebookDTO | LexicalDTO>;
  deleteSpaceItem(itemId: string): Promise<void>;
  getCollaborationSessionId(documentId: string): Promise<string>;
  getContent(itemId: string): Promise<any>;
  checkSpacerHealth(): Promise<HealthCheck>;
  getSpace(uid: string): Promise<SpaceDTO>;
  updateSpace(uid: string, data: UpdateSpaceRequest): Promise<SpaceDTO>;
  updateUserSpace(
    uid: string,
    userId: string,
    data: UpdateSpaceRequest,
  ): Promise<SpaceDTO>;
  deleteSpace(uid: string): Promise<void>;
  makeSpacePublic(uid: string): Promise<SpaceDTO>;
  makeSpacePrivate(uid: string): Promise<SpaceDTO>;
  exportSpace(uid: string): Promise<any>;
  cloneNotebook(id: string): Promise<NotebookDTO>;
  cloneLexical(id: string): Promise<LexicalDTO>;
  getProjects(): Promise<ProjectDTO[]>;
  getProject(uid: string): Promise<ProjectDTO>;
  createProject(name: string, description?: string): Promise<ProjectDTO>;
  updateProject(uid: string, data: UpdateSpaceRequest): Promise<ProjectDTO>;
  renameProject(
    uid: string,
    newName: string,
    description?: string,
  ): Promise<ProjectDTO>;
  getProjectDefaultItems(uid: string): Promise<ProjectDefaultItems>;
}
