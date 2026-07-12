/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  agentRuntimeStore,
  useChatStore,
  useConversationStore,
} from '../../stores';

/**
 * Tear down server-side agents created by examples and wipe in-process agent
 * state so a fresh example / runtime target boots with a clean slate.
 *
 * Deletes agents cached in sessionStorage under `agent-runtimes:agentId:<base>`
 * (all of them, or only the given `agentId` when provided), then resets the
 * chat, conversation and runtime stores and drops the persisted slice.
 *
 * @param agentBaseUrl - Base URL of the agent-runtimes server the agents live on.
 * @param token - Optional bearer token for authenticated deletes.
 * @param agentId - Optional specific agent id to tear down (defaults to all cached).
 */
export async function teardownExampleAgents(
  agentBaseUrl: string,
  token: string | undefined,
  agentId?: string,
): Promise<void> {
  // Collect the cached agent-id keys to delete.
  const agentIdKeys: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('agent-runtimes:agentId:')) {
        if (!agentId || sessionStorage.getItem(key) === agentId) {
          agentIdKeys.push(key);
        }
      }
    }
  } catch {
    // sessionStorage unavailable; skip agent deletion.
  }

  const idsToDelete = new Set<string>();
  if (agentId) {
    idsToDelete.add(agentId);
  }
  for (const key of agentIdKeys) {
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) idsToDelete.add(cached);
    } catch {
      /* ignore */
    }
  }

  await Promise.all(
    [...idsToDelete].map(async id => {
      try {
        await fetch(`${agentBaseUrl}/api/v1/agents/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Best-effort teardown: ignore network / 404 errors.
      }
    }),
  );

  for (const key of agentIdKeys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  // Wipe every piece of in-process agent state so the next boot is clean.
  useChatStore.getState().reset();
  useConversationStore.getState().clearAll();
  agentRuntimeStore.getState().reset();

  // Drop the persisted slice so nothing rehydrates a previous agent state.
  try {
    localStorage.removeItem('agent-runtimes-storage');
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
}
