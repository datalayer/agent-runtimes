/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Project domain model for the Datalayer Client.
 *
 * Projects are spaces with variant='project' that can have attached agents.
 * This is a standalone model (no inheritance from SpaceDTO) to avoid
 * circular dependency issues in the module graph.
 *
 * @module models/ProjectDTO
 */

import type { SpaceData } from './SpaceDTO';

/**
 * Stable public interface for Project data.
 */
export interface ProjectJSON {
  uid: string;
  id: string;
  handle: string;
  name: string;
  description: string;
  variant: string;
  isPublic: boolean;
  createdAt: string;
  attachedAgentPodName: string | null;
  attachedAgentSpecId: string | null;
  attachedAgentGivenName: string | null;
  hasAgent: boolean;
}

/**
 * Default items (notebook UID and document UID) for a project.
 */
export interface ProjectDefaultItems {
  defaultNotebookUid: string | null;
  defaultDocumentUid: string | null;
}

/**
 * Project domain model wrapping raw space data with project-specific accessors.
 *
 * @example
 * ```typescript
 * const projects = await client.getProjects();
 * const project = projects[0];
 * console.log(project.hasAgent); // false
 * await client.assignAgent(project.uid, 'my-agent-pod');
 * ```
 */
export class ProjectDTO {
  private _data: SpaceData;
  private _deleted = false;
  private _createdAt: Date;

  constructor(data: SpaceData) {
    this._data = data;
    // Cache creation date at construction to ensure stable value
    this._createdAt = data.creation_ts_dt
      ? new Date(data.creation_ts_dt)
      : new Date();
  }

  /** Unique identifier for the project. */
  get uid(): string {
    this._checkDeleted();
    return this._data.uid;
  }

  /** Internal numeric/string ID from the backend. Falls back to UID when not present. SDK client methods accept `uid` directly. */
  get id(): string {
    this._checkDeleted();
    return this._data.id ?? this._data.uid;
  }

  /** URL-friendly handle. */
  get handle(): string {
    this._checkDeleted();
    return this._data.handle_s;
  }

  /** Project name. */
  get name(): string {
    this._checkDeleted();
    return this._data.name_t;
  }

  /** Project description. */
  get description(): string {
    this._checkDeleted();
    return this._data.description_t ?? '';
  }

  /** Space variant (should be 'project'). */
  get variant(): string {
    this._checkDeleted();
    return this._data.variant_s;
  }

  /** Whether the project is public. */
  get isPublic(): boolean {
    this._checkDeleted();
    return this._data.public_b ?? false;
  }

  /** Creation date (stable across calls). */
  get createdAt(): Date {
    this._checkDeleted();
    return this._createdAt;
  }

  /** Attached agent runtime pod name, if any. */
  get attachedAgentPodName(): string | undefined {
    this._checkDeleted();
    return this._data.attached_agent_pod_name_s || undefined;
  }

  /** Attached agentspec ID (e.g., 'data-acquisition'), if any. */
  get attachedAgentSpecId(): string | undefined {
    this._checkDeleted();
    return this._data.attached_agent_spec_id_s || undefined;
  }

  /** Human-readable name of the attached agent runtime, if any. */
  get attachedAgentGivenName(): string | undefined {
    this._checkDeleted();
    return this._data.attached_agent_given_name_s || undefined;
  }

  /** Whether an agent is currently attached to this project. */
  get hasAgent(): boolean {
    this._checkDeleted();
    return !!this._data.attached_agent_pod_name_s;
  }

  /** Mark this project as deleted. */
  markDeleted(): void {
    this._deleted = true;
  }

  /** Whether this project has been deleted. */
  get isDeleted(): boolean {
    return this._deleted;
  }

  /**
   * Get project data in camelCase format.
   * @returns Project data with camelCase properties
   */
  toJSON(): ProjectJSON {
    this._checkDeleted();
    return {
      uid: this.uid,
      id: this.id,
      handle: this.handle,
      name: this.name,
      description: this.description,
      variant: this.variant,
      isPublic: this.isPublic,
      createdAt: this.createdAt.toISOString(),
      attachedAgentPodName: this.attachedAgentPodName ?? null,
      attachedAgentSpecId: this.attachedAgentSpecId ?? null,
      attachedAgentGivenName: this.attachedAgentGivenName ?? null,
      hasAgent: this.hasAgent,
    };
  }

  /** Get raw space data as received from the API. */
  rawData(): SpaceData {
    this._checkDeleted();
    return this._data;
  }

  /** String representation of the project. */
  toString(): string {
    this._checkDeleted();
    return `Project(${this._data.uid}, ${this._data.name_t})`;
  }

  private _checkDeleted(): void {
    if (this._deleted) {
      throw new Error(
        `Project ${this._data.uid} has been deleted and no longer exists`,
      );
    }
  }
}
