/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Central registry of Jupyter `ServiceManager`s connected to agent runtime
 * sandbox pods, keyed by pod name.
 *
 * Multiple surfaces (files/terminal panel, ephemeral notebook, ephemeral
 * document, ...) each open their own `ServiceManager` against the same
 * sandbox ingress. When the runtime pod is terminated (or paused), every one
 * of those managers must be disposed IMMEDIATELY, otherwise their background
 * pollers (kernelspecs / sessions / users) keep hammering the dead ingress
 * and produce endless CORS / ERR_FAILED noise.
 *
 * Every component that creates a manager against a sandbox pod registers it
 * here; the runtime delete/pause mutations call
 * {@link disposeSandboxServiceManagers} so teardown is centralized instead of
 * relying on each component reacting to (possibly lagging) query cache
 * updates.
 */

import type { ServiceManager } from '@jupyterlab/services';
import { disposeServiceManager } from '@datalayer/jupyter-react';

const sandboxManagersByRuntime = new Map<
  string,
  Set<ServiceManager.IManager>
>();

/**
 * Register a `ServiceManager` connected to a sandbox pod.
 *
 * @returns An unregister function to call when the component disposes the
 *   manager itself (cleanup). Unregistering does NOT dispose the manager.
 */
export function registerSandboxServiceManager(
  runtimeName: string,
  manager: ServiceManager.IManager,
): () => void {
  const normalized = String(runtimeName || '').trim();
  if (!normalized || !manager) {
    return () => {};
  }
  let managers = sandboxManagersByRuntime.get(normalized);
  if (!managers) {
    managers = new Set();
    sandboxManagersByRuntime.set(normalized, managers);
  }
  managers.add(manager);
  return () => {
    const registered = sandboxManagersByRuntime.get(normalized);
    if (registered) {
      registered.delete(manager);
      if (registered.size === 0) {
        sandboxManagersByRuntime.delete(normalized);
      }
    }
  };
}

/**
 * Dispose (and unregister) every `ServiceManager` registered against a
 * sandbox pod. Safe to call multiple times — `disposeServiceManager` is
 * idempotent, and disposed managers are dropped from the registry.
 */
export function disposeSandboxServiceManagers(runtimeName: string): void {
  const normalized = String(runtimeName || '').trim();
  if (!normalized) {
    return;
  }
  const managers = sandboxManagersByRuntime.get(normalized);
  if (!managers) {
    return;
  }
  sandboxManagersByRuntime.delete(normalized);
  managers.forEach(manager => {
    try {
      disposeServiceManager(manager);
    } catch (error) {
      console.warn(
        `[sandboxServiceManagers] Failed disposing service manager for pod ${normalized}`,
        error,
      );
    }
  });
}
