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

/*
 * Primer announces state changes — a toggle switching, a menu opening —
 * through a `live-region` custom element it expects the page to define. jsdom
 * defines no custom elements, so the lookup finds a plain `HTMLElement` and
 * calling `announceFromElement` on it throws.
 *
 * Registered as a real element rather than stubbed on the instance, because
 * Primer creates one on demand and any instance it makes has to answer.
 */
if (
  typeof customElements !== 'undefined' &&
  !customElements.get('live-region')
) {
  customElements.define(
    'live-region',
    class extends HTMLElement {
      // Both return a cancellable handle, because Primer keeps what they
      // return and cancels it when the announcing component unmounts. A
      // no-op that returns nothing throws there instead — on teardown, which
      // is a confusing place to find a missing test shim.
      announce() {
        return { cancel() {} };
      }
      announceFromElement() {
        return { cancel() {} };
      }
    },
  );
}

// `@jupyterlab/notebook` subclasses `window.IntersectionObserver` at module
// scope (its windowing), and `@jupyterlab/ui-components` observes sizes:
// jsdom has neither, so every suite that imports a chat or a computer page
// through them failed to load (*Class extends value undefined*). Observers
// that never fire: nothing under test scrolls or resizes here.
if (typeof window !== 'undefined') {
  class IdleObserver {
    constructor(_callback: unknown, _options?: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
  }
  if (typeof window.IntersectionObserver !== 'function') {
    window.IntersectionObserver =
      IdleObserver as unknown as typeof window.IntersectionObserver;
    globalThis.IntersectionObserver = window.IntersectionObserver;
  }
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver =
      IdleObserver as unknown as typeof window.ResizeObserver;
    globalThis.ResizeObserver = window.ResizeObserver;
  }
}

// `@datalayer/jupyter-react`'s ipywidgets embed reads webpack's public path
// at module scope; vitest is not webpack, so it is the empty one here.
if (
  typeof (globalThis as { __webpack_public_path__?: string })
    .__webpack_public_path__ === 'undefined'
) {
  (globalThis as { __webpack_public_path__?: string }).__webpack_public_path__ =
    '';
}

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
