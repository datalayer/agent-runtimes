/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export interface StoredRuntime {
  runtimeId: string;
  podName: string;
  ingress: string;
  token: string;
  timestamp: number;
  notebookPath?: string;
  environment?: string;
}

const RUNTIME_PREFIX = 'runtime_';
const MAX_RUNTIME_AGE = 60 * 60 * 1000; // 1 hour

/**
 * Store runtime information for reuse
 */
export function storeRuntime(
  key: string,
  runtime: Omit<StoredRuntime, 'timestamp'>,
): void {
  const data: StoredRuntime = {
    ...runtime,
    timestamp: Date.now(),
  };
  localStorage.setItem(`${RUNTIME_PREFIX}${key}`, JSON.stringify(data));
}

/**
 * Retrieve stored runtime information
 */
export function getStoredRuntime(key: string): StoredRuntime | null {
  try {
    const item = localStorage.getItem(`${RUNTIME_PREFIX}${key}`);
    if (!item) return null;

    const runtime = JSON.parse(item) as StoredRuntime;

    // Check if runtime is too old
    const age = Date.now() - runtime.timestamp;
    if (age > MAX_RUNTIME_AGE) {
      removeStoredRuntime(key);
      return null;
    }

    return runtime;
  } catch (err) {
    console.error('Failed to parse stored runtime:', err);
    removeStoredRuntime(key);
    return null;
  }
}

/**
 * Remove stored runtime information
 */
export function removeStoredRuntime(key: string): void {
  localStorage.removeItem(`${RUNTIME_PREFIX}${key}`);
}

/**
 * Get all stored runtimes
 */
export function getAllStoredRuntimes(): Record<string, StoredRuntime> {
  const runtimes: Record<string, StoredRuntime> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(RUNTIME_PREFIX)) {
      try {
        const runtimeKey = key.replace(RUNTIME_PREFIX, '');
        const runtime = getStoredRuntime(runtimeKey);
        if (runtime) {
          runtimes[runtimeKey] = runtime;
        }
      } catch (err) {
        // Skip invalid entries
      }
    }
  }

  return runtimes;
}

/**
 * Clear all stored runtimes
 */
export function clearAllStoredRuntimes(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(RUNTIME_PREFIX)) {
      keys.push(key);
    }
  }

  keys.forEach(key => localStorage.removeItem(key));
}

/**
 * Clean up old runtimes
 */
export function cleanupOldRuntimes(): void {
  const runtimes = getAllStoredRuntimes();
  const now = Date.now();

  Object.entries(runtimes).forEach(([key, runtime]) => {
    const age = now - runtime.timestamp;
    if (age > MAX_RUNTIME_AGE) {
      removeStoredRuntime(key);
      console.log(`Cleaned up old runtime: ${key}`);
    }
  });
}
