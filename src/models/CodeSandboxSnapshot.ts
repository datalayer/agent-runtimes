/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Code Sandbox snapshot from API.
 */
export interface IAPICodeSandboxSnapshot {
  /**
   * Snapshot UID
   */
  uid: string;
  /**
   * Snapshot name
   */
  name: string;
  /**
   * Snapshot description
   */
  description: string;
  /**
   * Snapshot environment
   */
  environment: string;
  /**
   * Snapshot metadata
   */
  metadata: Record<string, any>;
  /**
   * Snapshot size in bytes
   */
  size: number;
  /**
   * Latest update time of the snapshot
   */
  updated_at: string;
  /**
   * Snapshot format
   */
  format: string;
  /**
   * Snapshot format version
   */
  format_version: string;
  /**
   * Snapshot status
   */
  status: string;
}

/**
 * Code Sandbox snapshot model.
 */
export interface ICodeSandboxSnapshot {
  /**
   * Snapshot UID
   */
  id: string;
  /**
   * Snapshot name
   */
  name: string;
  /**
   * Snapshot description
   */
  description: string;
  /**
   * Snapshot environment
   */
  environment: string;
  /**
   * Snapshot metadata
   */
  metadata: Record<string, any>;
  /**
   * Snapshot size in bytes
   */
  size: number;
  /**
   * Latest update time of the snapshot
   */
  updatedAt: Date;
  /**
   * Snapshot format
   */
  format: string;
  /**
   * Snapshot format version
   */
  formatVersion: string;
  /**
  
   * Snapshot status
   */
  status: string;
}

export function asCodeSandboxSnapshot(
  s: IAPICodeSandboxSnapshot,
): ICodeSandboxSnapshot {
  const { uid, updated_at, format_version, ...others } = s;
  return {
    ...others,
    id: uid,
    updatedAt: new Date(updated_at),
    formatVersion: format_version,
  };
}
