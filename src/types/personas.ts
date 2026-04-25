/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for a Persona.
 *
 * A Persona is a lightweight identity built on top of an agent spec —
 * it bundles a name, a description and a set of tags that describe the
 * role and tone of the underlying agent.
 */
export interface PersonaSpec {
  /** Unique persona identifier (e.g., 'tutor', 'sentinel') */
  id: string;
  /** Persona spec version */
  version: string;
  /** Display name of the persona */
  name: string;
  /** Short persona description */
  description: string;
  /** Categorization tags */
  tags: string[];
  /** Icon identifier */
  icon?: string;
  /** Emoji representation */
  emoji?: string;
  /** Optional reference to the underlying agent spec id */
  agent?: string;
}
