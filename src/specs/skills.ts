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

import type { SkillSpec } from '../types';

// ============================================================================
// Skill Definitions
// ============================================================================

export const CRAWL_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'crawl',
  version: '0.0.1',
  name: 'Web Crawl Skill',
  description: 'Web crawling and content extraction capabilities',
  module: 'agent_skills.crawl',
  requiredEnvVars: ['TAVILY_API_KEY:0.0.1'],
  optionalEnvVars: [],
  dependencies: ['requests>=2.31.0', 'beautifulsoup4>=4.12.0'],
  tags: ['web', 'crawl', 'scraping'],
  icon: 'globe',
  emoji: '🌐',
  enabled: true,
};

export const EVENTS_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'events',
  version: '0.0.1',
  name: 'Events Skill',
  description: 'Event generation, enrichment, and lifecycle orchestration',
  module: 'agent_skills.events',
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['httpx>=0.27.0'],
  tags: ['events', 'orchestration', 'automation'],
  icon: 'bell',
  emoji: '📅',
  enabled: true,
};

export const GITHUB_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'github',
  version: '0.0.1',
  name: 'GitHub Skill',
  description: 'GitHub repository management and code operations',
  module: 'agent_skills.github',
  requiredEnvVars: ['GITHUB_TOKEN:0.0.1'],
  optionalEnvVars: [],
  dependencies: ['PyGithub>=2.1.0'],
  tags: ['github', 'git', 'code'],
  icon: 'mark-github',
  emoji: '🐙',
  enabled: true,
};

export const PDF_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'pdf',
  version: '0.0.1',
  name: 'PDF Processing Skill',
  description: 'PDF document reading, parsing, and extraction',
  module: 'agent_skills.pdf',
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['PyPDF2>=3.0.0', 'pdfplumber>=0.10.0'],
  tags: ['pdf', 'documents', 'extraction'],
  icon: 'file',
  emoji: '📄',
  enabled: true,
};

// ============================================================================
// Skill Catalog
// ============================================================================

export const SKILL_CATALOG: Record<string, SkillSpec> = {
  crawl: CRAWL_SKILL_SPEC_0_0_1,
  events: EVENTS_SKILL_SPEC_0_0_1,
  github: GITHUB_SKILL_SPEC_0_0_1,
  pdf: PDF_SKILL_SPEC_0_0_1,
};

export function getSkillSpecs(): SkillSpec[] {
  return Object.values(SKILL_CATALOG);
}

function resolveSkillId(skillId: string): string {
  if (skillId in SKILL_CATALOG) return skillId;
  const idx = skillId.lastIndexOf(':');
  if (idx > 0) {
    const base = skillId.slice(0, idx);
    if (base in SKILL_CATALOG) return base;
  }
  return skillId;
}

export function getSkillSpec(skillId: string): SkillSpec | undefined {
  return SKILL_CATALOG[resolveSkillId(skillId)];
}
