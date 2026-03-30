# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Memory Catalog.

Predefined memory backend configurations that can be used by agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from enum import Enum
from typing import Optional

from agent_runtimes.types import MemorySpec

# ============================================================================
# Memories Enum
# ============================================================================


class Memories(str, Enum):
    """Enumeration of available memory backends."""

    EPHEMERAL = "ephemeral"
    MEM0 = "mem0"
    MEMU = "memu"
    SIMPLEMEM = "simplemem"


# ============================================================================
# Memory Definitions
# ============================================================================

EPHEMERAL_MEMORY_0_0_1 = MemorySpec(
    id="ephemeral",
    version="0.0.1",
    name="Ephemeral Memory",
    description="Simple in-process memory that lives and dies with the agent. Stores facts, preferences, and context in a local dictionary during the agent session. When the agent terminates, all memory is lost. Best suited for short-lived tasks, stateless assistants, and development/testing.",
    persistence="none",
    scope="agent",
    backend="in-memory",
    icon="zap",
    emoji="⚡",
)

MEM0_MEMORY_0_0_1 = MemorySpec(
    id="mem0",
    version="0.0.1",
    name="Mem0 Memory",
    description="Universal memory layer powered by Mem0 (mem-zero). Enhances AI agents with an intelligent, persistent memory that remembers user preferences, adapts to individual needs, and continuously learns over time. Supports multi-level memory (User, Session, Agent state) with semantic search, automatic fact extraction, and conflict resolution. 26% more accurate than OpenAI Memory on the LOCOMO benchmark with 90% fewer tokens.",
    persistence="permanent",
    scope="user",
    backend="mem0",
    icon="brain",
    emoji="🧠",
)

MEMU_MEMORY_0_0_1 = MemorySpec(
    id="memu",
    version="0.0.1",
    name="memU Proactive Memory",
    description="Proactive memory framework built for 24/7 always-on agents. Continuously captures and understands user intent, enabling agents that can anticipate needs and act proactively. Organizes memory as a hierarchical file system (categories → items → resources) with auto-categorization, cross-references, and pattern detection. Reduces LLM token cost by caching insights and avoiding redundant calls. 92% average accuracy on the LoCoMo benchmark.",
    persistence="permanent",
    scope="user",
    backend="memu",
    icon="eye",
    emoji="👁️",
)

SIMPLEMEM_MEMORY_0_0_1 = MemorySpec(
    id="simplemem",
    version="0.0.1",
    name="SimpleMem Lifelong Memory",
    description="Efficient lifelong memory framework based on semantic lossless compression. Maximizes information density and token utilization through a three-stage pipeline: Semantic Structured Compression, Online Semantic Synthesis, and Intent-Aware Retrieval Planning. Achieves 43.24% F1 score on LoCoMo (26.4% above Mem0) with 30x fewer tokens than full-context methods. Supports cross-session memory with 64% improvement over Claude-Mem.",
    persistence="cross-session",
    scope="agent",
    backend="lancedb",
    icon="archive",
    emoji="🗜️",
)


# ============================================================================
# Memory Catalog
# ============================================================================

MEMORY_CATALOGUE: dict[str, MemorySpec] = {
    "ephemeral": EPHEMERAL_MEMORY_0_0_1,
    "mem0": MEM0_MEMORY_0_0_1,
    "memu": MEMU_MEMORY_0_0_1,
    "simplemem": SIMPLEMEM_MEMORY_0_0_1,
}


DEFAULT_MEMORY: str = "ephemeral"


def get_memory(memory_id: str) -> Optional[MemorySpec]:
    """
    Get a memory specification by ID (accepts both bare and versioned refs).

    Args:
        memory_id: The unique identifier of the memory backend.

    Returns:
        The MemorySpec, or None if not found.
    """
    mem = MEMORY_CATALOGUE.get(memory_id)
    if mem is not None:
        return mem
    base, _, ver = memory_id.rpartition(':')
    if base and '.' in ver:
        return MEMORY_CATALOGUE.get(base)
    return None


def get_default_memory() -> Optional[MemorySpec]:
    """
    Get the default memory backend.

    Returns:
        The default MemorySpec, or None if no default is set.
    """
    return MEMORY_CATALOGUE.get(DEFAULT_MEMORY)


def list_memories() -> list[MemorySpec]:
    """
    List all available memory backends.

    Returns:
        List of all MemorySpec specifications.
    """
    return list(MEMORY_CATALOGUE.values())
