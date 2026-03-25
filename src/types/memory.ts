/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for a memory backend.
 */
export interface MemorySpec {
  /** Unique memory identifier (e.g., 'ephemeral', 'mem0') */
  id: string;
  /** Version */
  version: string;
  /** Display name for the memory backend */
  name: string;
  /** Memory backend description */
  description: string;
  /** Persistence level: none, session, cross-session, permanent */
  persistence: string;
  /** Memory scope: agent, team, repository, user, global */
  scope: string;
  /** Storage backend identifier */
  backend: string;
  /** Icon identifier */
  icon: string;
  /** Emoji representation */
  emoji: string;
}
