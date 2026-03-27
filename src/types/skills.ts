/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Skill information from backend
 */
export interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  has_scripts?: boolean;
  has_resources?: boolean;
}

/**
 * Skills response from backend
 */
export interface SkillsResponse {
  skills: SkillInfo[];
  total: number;
  skills_path?: string;
}

/**
 * Specification for a skill.
 *
 * Supports three variants:
 * - Variant 1 (name-based): Uses `module` to discover and load a skill
 *   from a Python module path (e.g. `agent_skills.events`).
 * - Variant 2 (package-based): Uses `package` and `method` to reference
 *   a callable in an installable Python package.  Attributes such as
 *   `license`, `compatibility`, `allowedTools`, and `skillMetadata`
 *   are discovered at runtime from the `SKILL.md` packaged inside the
 *   Python package — they should NOT be duplicated in the YAML spec.
 * - Variant 3 (path-based): Uses `path` to load a local skill directory
 *   containing `SKILL.md` (relative to the configured skills folder).
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
  /** Python module path for name-based discovery (variant 1) */
  module?: string;
  /** Python package containing the skill implementation (variant 2) */
  package?: string;
  /** Callable/function name in the package (variant 2) */
  method?: string;
  /** Path to a local skill directory or SKILL.md file (variant 3) */
  path?: string;
  /** License name or reference (agentskills.io spec) */
  license?: string;
  /** Environment requirements (agentskills.io spec) */
  compatibility?: string;
  /** Pre-approved tools the skill may use (agentskills.io spec) */
  allowedTools?: string[];
  /** Arbitrary key-value metadata (agentskills.io spec) */
  skillMetadata?: Record<string, string>;
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
