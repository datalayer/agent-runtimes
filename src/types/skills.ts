/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for a skill.
 */
export interface SkillSpec {
  /** Unique skill identifier */
  id: string;
  /** Skill version */
  version: string;
  /** Display name for the skill */
  name: string;
  /** Skill description */
  description: string;
  /** Python module path */
  module?: string;
  /** Environment variables required by this skill */
  requiredEnvVars: string[];
  /** Optional environment variables */
  optionalEnvVars?: string[];
  /** Python package dependencies */
  dependencies?: string[];
  /** Tags for categorization */
  tags: string[];
  /** Icon identifier */
  icon?: string;
  /** Emoji identifier */
  emoji?: string;
  /** Whether the skill is enabled */
  enabled: boolean;
}

/**
 * Simplified skill reference used in AgentSpec.
 *
 * @deprecated Use SkillSpec instead.
 */
export type AgentSkillSpec = SkillSpec;
