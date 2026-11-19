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
  ui: [
    { plugin: 'bank-reconciliation', renderer: 'a2ui' },
    { plugin: 'trial-balance' },
    { plugin: 'vat-summary' },
  ],
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

export const DATALAYER_EMAIL_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'datalayer-email',
  version: '0.0.1',
  name: 'Email Skill',
  description:
    "Send the person whose agent this is one email — a summary, a report, a draft they asked for — through Datalayer's mailer, to them alone, a few a day",
  module: 'datalayer_skills.skills.email',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['datalayer-skills>=0.6.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills>=0.6.0"',
    note: 'Standard library only; the runtime sends the mail (agent-runtimes 1.6.65, IAM 1.1.124).',
  },
  tags: ['email', 'mail', 'datalayer'],
  icon: '@primer/octicons-react:mail',
  emoji: '✉️',
  enabled: true,
};

export const DINING_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'dining',
  version: '0.0.1',
  name: 'Dining Skill',
  description:
    "Restaurants, sights, activities and stops along a route that fit the travellers' tastes, diet and budget, placed in the trip's days with their travel times and map links",
  module: 'datalayer_skills.skills.dining',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['datalayer-skills>=0.5.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills>=0.5.0"',
    note: 'Instructions alone: no dependencies of its own.',
  },
  tags: ['travel', 'dining', 'restaurants', 'activities'],
  icon: '@primer/octicons-react:flame',
  emoji: '🍽️',
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

export const FARE_AND_STAY_COMPARISON_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'fare-and-stay-comparison',
  version: '0.0.1',
  name: 'Fare and Stay Comparison Skill',
  description:
    'Compare flights by route, fare, baggage, connections and travel time, and stays by location, price, amenities and cancellation terms, with one recommendation and the booking links',
  module: 'datalayer_skills.skills.fare_and_stay_comparison',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['datalayer-skills>=0.5.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills>=0.5.0"',
    note: 'Instructions alone: no dependencies of its own.',
  },
  tags: ['travel', 'flights', 'accommodation', 'comparison'],
  icon: '@primer/octicons-react:arrow-switch',
  emoji: '⚖️',
  enabled: true,
  ui: [{ plugin: 'trip-options', renderer: 'a2ui' }, { plugin: 'trip-budget' }],
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

export const IMAGE_STOCK_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'image-stock',
  version: '0.0.1',
  name: 'Stock Image Skill',
  description:
    'Stock photos searched on Unsplash, Pexels, Pixabay and Freepik (the ones the person has a key for), the credit line each asks for, and a photo downloaded into the workspace',
  module: 'datalayer_skills.skills.image_stock',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [
    'UNSPLASH_ACCESS_KEY:0.0.1',
    'PEXELS_API_KEY:0.0.1',
    'PIXABAY_API_KEY:0.0.1',
    'FREEPIK_API_KEY:0.0.1',
    'UNSPLASH_TIER:0.0.1',
  ],
  anyOfEnvVars: [
    'UNSPLASH_ACCESS_KEY:0.0.1',
    'PEXELS_API_KEY:0.0.1',
    'PIXABAY_API_KEY:0.0.1',
    'FREEPIK_API_KEY:0.0.1',
  ],
  dependencies: ['datalayer-skills>=0.7.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills>=0.7.0"',
    note: "Standard library only. One provider's key is enough; agent-skills 1.5.0 or later keeps it out without any.",
  },
  tags: ['image', 'photo', 'stock', 'media'],
  icon: '@primer/octicons-react:image',
  emoji: '📷',
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

export const TRAVEL_PLANNING_SKILL_SPEC_0_0_1: SkillSpec = {
  id: 'travel-planning',
  version: '0.0.1',
  name: 'Travel Planning Skill',
  description:
    'Plan a trip end to end — dates, destinations, travellers, preferences and budget first, then three trip options, each with its transport, stay, daily schedule, travel times, a map link, a budget with its total and the booking links',
  module: 'datalayer_skills.skills.travel_planning',
  package: undefined,
  method: undefined,
  path: undefined,
  requiredEnvVars: [],
  optionalEnvVars: [],
  dependencies: ['datalayer-skills>=0.5.0'],
  install: {
    type: 'python',
    command: 'pip install "datalayer-skills>=0.5.0"',
    note: 'Instructions alone: no dependencies of its own.',
  },
  tags: ['travel', 'planning', 'itinerary', 'budget'],
  icon: '@primer/octicons-react:milestone',
  emoji: '🧭',
  enabled: true,
  ui: [
    { plugin: 'trip-itinerary' },
    { plugin: 'trip-budget' },
    { plugin: 'trip-summary' },
  ],
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
  'datalayer-email': DATALAYER_EMAIL_SKILL_SPEC_0_0_1,
  dining: DINING_SKILL_SPEC_0_0_1,
  events: EVENTS_SKILL_SPEC_0_0_1,
  'fare-and-stay-comparison': FARE_AND_STAY_COMPARISON_SKILL_SPEC_0_0_1,
  github: GITHUB_SKILL_SPEC_0_0_1,
  'image-stock': IMAGE_STOCK_SKILL_SPEC_0_0_1,
  image: IMAGE_SKILL_SPEC_0_0_1,
  jokes: JOKES_SKILL_SPEC_0_0_1,
  pdf: PDF_SKILL_SPEC_0_0_1,
  'text-summarizer': TEXT_SUMMARIZER_SKILL_SPEC_0_0_1,
  'travel-planning': TRAVEL_PLANNING_SKILL_SPEC_0_0_1,
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
