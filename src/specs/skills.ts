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

export const ACCOUNTING_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'accounting',
  version: '0.0.1',
  name: 'Accounting Skill',
  description:
    'Accounting analysis workflows for reconciliation, close, variance, and audit-ready summaries',
  module: 'datalayer_skills.skills.accounting',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['pandas>=2.0.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills[skills]"',
    note: "datalayer-skills with every skill's dependencies; the runtime image installs it the same way.",
  },
  tags: ['accounting', 'finance', 'reconciliation', 'close'],
  icon: '@primer/octicons-react:book',
  emoji: '🧮',
  enabled: true,
};

export const CRAWL_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'crawl',
  version: '0.0.1',
  name: 'Web Crawl Skill',
  description: 'Web crawling and content extraction capabilities',
  module: 'datalayer_skills.skills.crawl',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: ['TAVILY_API_KEY:0.0.1'],
  optionalEnvVars: [],
  dependencies: ['requests>=2.31.0', 'beautifulsoup4>=4.12.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills[skills]"',
    note: "datalayer-skills with every skill's dependencies; the runtime image installs it the same way.",
  },
  tags: ['web', 'crawl', 'scraping'],
  icon: '@primer/octicons-react:globe',
  emoji: '🌐',
  enabled: true,
};

export const EVENTS_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'events',
  version: '0.0.1',
  name: 'Events Skill',
  description: 'Event generation, enrichment, and lifecycle orchestration',
  module: 'datalayer_skills.skills.events',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['httpx>=0.27.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills[skills]"',
    note: "datalayer-skills with every skill's dependencies; the runtime image installs it the same way.",
  },
  tags: ['events', 'orchestration', 'automation'],
  icon: '@primer/octicons-react:calendar',
  emoji: '📅',
  enabled: true,
};

export const GITHUB_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'github',
  version: '0.0.1',
  name: 'GitHub Skill',
  description: 'GitHub repository management and code operations',
  module: 'datalayer_skills.skills.github',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: ['GITHUB_TOKEN:0.0.1'],
  optionalEnvVars: [],
  dependencies: ['PyGithub>=2.1.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills[skills]"',
    note: "datalayer-skills with every skill's dependencies; the runtime image installs it the same way.",
  },
  tags: ['github', 'git', 'code'],
  icon: '@datalayer/icons-react:github-mark',
  emoji: '🐙',
  enabled: true,
};

export const IMAGE_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'image',
  version: '0.0.1',
  name: 'Image Skills',
  description:
    'Snapshots of web pages and video frames; images read, resized, cropped, converted, optimized and thumbnailed',
  module: 'datalayer_skills.skills.image',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['Pillow>=10.0', 'playwright>=1.45'],
  install: {
    type: 'python',
    command:
      'pip install "datalayer-skills[skills]" && python -m playwright install chromium',
    note: 'Chromium for its page snapshots; the runtime image carries it.',
  },
  tags: ['image', 'snapshot', 'media'],
  icon: '@primer/octicons-react:image',
  emoji: '🖼️',
  enabled: true,
};

export const JOKES_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'jokes',
  version: '0.0.1',
  name: 'Jokes Skill',
  description:
    'One joke on request, by topic or at random, from a small bundled list.',
  module: 'agent_skills.skills.jokes',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: [],
  install: {
    type: 'python',
    command: 'pip install agent-skills',
    note: 'No dependencies of its own.',
  },
  tags: ['fun', 'humor', 'demo'],
  icon: '@primer/octicons-react:smiley',
  emoji: '😄',
  enabled: true,
};

export const PDF_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'pdf',
  version: '0.0.1',
  name: 'PDF Processing Skill',
  description: 'PDF document reading, parsing, and extraction',
  module: 'datalayer_skills.skills.pdf',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['pypdf>=4.0', 'pdf2image>=1.17', 'Pillow>=10.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills[skills]"',
    note: "datalayer-skills with every skill's dependencies; the runtime image installs it the same way.",
  },
  tags: ['pdf', 'documents', 'extraction'],
  icon: '@primer/octicons-react:file',
  emoji: '📄',
  enabled: true,
};

export const TEXT_SUMMARIZER_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'text-summarizer',
  version: '0.0.1',
  name: 'Text Summarizer Skill',
  description:
    'Summarize text content using extractive and abstractive techniques. Use when the user asks for summaries, key points, or condensed versions of documents.',
  module: undefined,
  package: 'datalayer_skills.skills.text_summarizer',
  method: 'summarize_text',
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['datalayer-skills>=0.3.0'],
  install: {
    type: 'python',
    command: 'pip install datalayer-skills',
    note: 'No dependencies of its own.',
  },
  tags: ['nlp', 'summarization', 'text-processing'],
  icon: '@primer/octicons-react:note',
  emoji: '📝',
  enabled: true,
};

export const VIDEO_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'video',
  version: '0.0.1',
  name: 'Video Skills',
  description:
    'Recordings of web pages; videos read, trimmed, zoomed in and out on a point, transcoded, optimized, framed and turned to GIF',
  module: 'datalayer_skills.skills.video',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['imageio-ffmpeg>=0.5', 'playwright>=1.45'],
  install: {
    type: 'python',
    command:
      'pip install "datalayer-skills[skills]" && python -m playwright install chromium',
    note: 'Chromium for its recordings, and ffmpeg (imageio-ffmpeg brings one); the runtime image carries both.',
  },
  tags: ['video', 'recording', 'media'],
  icon: '@primer/octicons-react:video',
  emoji: '🎬',
  enabled: true,
};

// ============================================================================
// Skill Catalog
// ============================================================================

export const SKILLS_CATALOG: Record<string, SkillSpec> = {
  accounting: ACCOUNTING_SKILL_SPEC_0_0_1,
  crawl: CRAWL_SKILL_SPEC_0_0_1,
  events: EVENTS_SKILL_SPEC_0_0_1,
  github: GITHUB_SKILL_SPEC_0_0_1,
  image: IMAGE_SKILL_SPEC_0_0_1,
  jokes: JOKES_SKILL_SPEC_0_0_1,
  pdf: PDF_SKILL_SPEC_0_0_1,
  'text-summarizer': TEXT_SUMMARIZER_SKILL_SPEC_0_0_1,
  video: VIDEO_SKILL_SPEC_0_0_1,
};

export function getSkillSpecs(): SkillSpec[] {
  return Object.values(SKILLS_CATALOG);
}

function resolveSkillId(skillId: string): string {
  if (skillId in SKILLS_CATALOG) return skillId;
  const idx = skillId.lastIndexOf(':');
  if (idx > 0) {
    const base = skillId.slice(0, idx);
    if (base in SKILLS_CATALOG) return base;
  }
  return skillId;
}

export function getSkillSpec(skillId: string): SkillSpec | undefined {
  return SKILLS_CATALOG[resolveSkillId(skillId)];
}
