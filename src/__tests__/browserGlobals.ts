/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Browser globals jsdom does not provide.
 *
 * A setup file rather than a few lines at the top of a test, because ES module
 * imports are evaluated before any statement in the importing module: a stub
 * written beside the imports runs after the module that needed it has already
 * thrown.
 *
 * None of this says anything about the code under test. It is the environment
 * being smaller than a browser, so it is shared by every suite that renders
 * rather than copied into each.
 */

// This file runs in both environments these suites use — `node` for the plain
// tests, `jsdom` for the ones that render — so every stub is guarded on the
// thing it builds from actually existing.

// `@datalayer/jupyter-lexical` and the chat's drag-and-drop reference this at
// module scope.
if (
  typeof Event === 'function' &&
  typeof (globalThis as { DragEvent?: unknown }).DragEvent === 'undefined'
) {
  (globalThis as { DragEvent?: unknown }).DragEvent = class extends Event {};
}

// React only allows `act` to flush effects when told it is in a test
// environment; without this every render warns even though it worked.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Primer's theme reads this on mount.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
