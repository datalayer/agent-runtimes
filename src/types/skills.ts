/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for an agent skill.
 *
 * Simplified version of the full Skill type from agent-skills,
 * containing only the fields needed for agent specification.
 */
export interface AgentSkillSpec {
  /** Unique skill identifier */
  id: string;
  /** Display name for the skill */
  name: string;
  /** Skill description */
  description: string;
  /** Skill version */
  version: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Environment variables required by this skill (e.g., API keys) */
  requiredEnvVars?: string[];
}
