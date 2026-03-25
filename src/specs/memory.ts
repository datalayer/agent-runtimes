/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Memory Catalog
 *
 * Predefined memory backend configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

// ============================================================================
// MemorySpec Type
// ============================================================================

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

// ============================================================================
// Memories Enum
// ============================================================================

export const Memories = {
  EPHEMERAL: 'ephemeral',
  MEM0: 'mem0',
  MEMU: 'memu',
  SIMPLEMEM: 'simplemem',
} as const;

export type MemoryId = (typeof Memories)[keyof typeof Memories];

// ============================================================================
// Memory Definitions
// ============================================================================

export const EPHEMERAL_MEMORY_0_0_1: MemorySpec = {
  id: 'ephemeral',
  version: '0.0.1',
  name: 'Ephemeral Memory',
  description:
    'Simple in-process memory that lives and dies with the agent. Stores facts, preferences, and context in a local dictionary during the agent session. When the agent terminates, all memory is lost. Best suited for short-lived tasks, stateless assistants, and development/testing.',
  persistence: 'none',
  scope: 'agent',
  backend: 'in-memory',
  icon: 'zap',
  emoji: '⚡',
};

export const MEM0_MEMORY_0_0_1: MemorySpec = {
  id: 'mem0',
  version: '0.0.1',
  name: 'Mem0 Memory',
  description:
    'Universal memory layer powered by Mem0 (mem-zero). Enhances AI agents with an intelligent, persistent memory that remembers user preferences, adapts to individual needs, and continuously learns over time. Supports multi-level memory (User, Session, Agent state) with semantic search, automatic fact extraction, and conflict resolution. 26% more accurate than OpenAI Memory on the LOCOMO benchmark with 90% fewer tokens.',
  persistence: 'permanent',
  scope: 'user',
  backend: 'mem0',
  icon: 'brain',
  emoji: '🧠',
};

export const MEMU_MEMORY_0_0_1: MemorySpec = {
  id: 'memu',
  version: '0.0.1',
  name: 'memU Proactive Memory',
  description:
    'Proactive memory framework built for 24/7 always-on agents. Continuously captures and understands user intent, enabling agents that can anticipate needs and act proactively. Organizes memory as a hierarchical file system (categories → items → resources) with auto-categorization, cross-references, and pattern detection. Reduces LLM token cost by caching insights and avoiding redundant calls. 92% average accuracy on the LoCoMo benchmark.',
  persistence: 'permanent',
  scope: 'user',
  backend: 'memu',
  icon: 'eye',
  emoji: '👁️',
};

export const SIMPLEMEM_MEMORY_0_0_1: MemorySpec = {
  id: 'simplemem',
  version: '0.0.1',
  name: 'SimpleMem Lifelong Memory',
  description:
    'Efficient lifelong memory framework based on semantic lossless compression. Maximizes information density and token utilization through a three-stage pipeline: Semantic Structured Compression, Online Semantic Synthesis, and Intent-Aware Retrieval Planning. Achieves 43.24% F1 score on LoCoMo (26.4% above Mem0) with 30x fewer tokens than full-context methods. Supports cross-session memory with 64% improvement over Claude-Mem.',
  persistence: 'cross-session',
  scope: 'agent',
  backend: 'lancedb',
  icon: 'archive',
  emoji: '🗜️',
};

// ============================================================================
// Memory Catalog
// ============================================================================

export const MEMORY_CATALOGUE: Record<string, MemorySpec> = {
  ephemeral: EPHEMERAL_MEMORY_0_0_1,
  mem0: MEM0_MEMORY_0_0_1,
  memu: MEMU_MEMORY_0_0_1,
  simplemem: SIMPLEMEM_MEMORY_0_0_1,
};

export const DEFAULT_MEMORY: MemoryId = Memories.EPHEMERAL;

function resolveMemoryId(memoryId: string): string {
  if (memoryId in MEMORY_CATALOGUE) return memoryId;
  const idx = memoryId.lastIndexOf(':');
  if (idx > 0) {
    const base = memoryId.slice(0, idx);
    if (base in MEMORY_CATALOGUE) return base;
  }
  return memoryId;
}

/**
 * Get a memory specification by ID.
 */
export function getMemory(memoryId: string): MemorySpec | undefined {
  return MEMORY_CATALOGUE[resolveMemoryId(memoryId)];
}

/**
 * Get the default memory backend.
 */
export function getDefaultMemory(): MemorySpec | undefined {
  return MEMORY_CATALOGUE[DEFAULT_MEMORY];
}

/**
 * List all available memory backends.
 */
export function listMemories(): MemorySpec[] {
  return Object.values(MEMORY_CATALOGUE);
}
