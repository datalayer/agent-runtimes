/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Skill Catalog
 *
 * Predefined skill configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  module: string;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  dependencies: string[];
  tags: string[];
  enabled: boolean;
}

// ============================================================================
// Skill Definitions
// ============================================================================

export const CRAWL_SKILL_SPEC: SkillSpec = {
  id: 'crawl',
  name: 'Web Crawl Skill',
  description: 'Web crawling and content extraction capabilities',
  module: 'agent_skills.crawl',
  requiredEnvVars: ['TAVILY_API_KEY'],
  optionalEnvVars: [],
  dependencies: ['requests>=2.31.0', 'beautifulsoup4>=4.12.0'],
  tags: ['web', 'crawl', 'scraping'],
  enabled: true,
};

export const GITHUB_SKILL_SPEC: SkillSpec = {
  id: 'github',
  name: 'GitHub Skill',
  description: 'GitHub repository management and code operations',
  module: 'agent_skills.github',
  requiredEnvVars: ['GITHUB_TOKEN'],
  optionalEnvVars: [],
  dependencies: ['PyGithub>=2.1.0'],
  tags: ['github', 'git', 'code'],
  enabled: true,
};

export const PDF_SKILL_SPEC: SkillSpec = {
  id: 'pdf',
  name: 'PDF Processing Skill',
  description: 'PDF document reading, parsing, and extraction',
  module: 'agent_skills.pdf',
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['PyPDF2>=3.0.0', 'pdfplumber>=0.10.0'],
  tags: ['pdf', 'documents', 'extraction'],
  enabled: true,
};

// ============================================================================
// Skill Catalog
// ============================================================================

export const SKILL_CATALOG: Record<string, SkillSpec> = {
  crawl: CRAWL_SKILL_SPEC,
  github: GITHUB_SKILL_SPEC,
  pdf: PDF_SKILL_SPEC,
};

export function getSkillSpecs(): SkillSpec[] {
  return Object.values(SKILL_CATALOG);
}

export function getSkillSpec(skillId: string): SkillSpec | undefined {
  return SKILL_CATALOG[skillId];
}
