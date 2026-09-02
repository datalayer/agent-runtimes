/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Test setup for unit tests
// Add any global test configuration here

import '@testing-library/jest-dom/vitest';

// Define webpack globals that are expected by some dependencies
(global as any).__webpack_public_path__ = '';

// Native FormData and fetch should work in Node.js 20+

// Define other globals that might be needed
(global as any).global = globalThis;

/*
 * Primer announces through `@primer/live-region-element`, whose `<live-region>`
 * custom element it expects the document to define.
 *
 * jsdom defines no custom elements, and the package's Node build — the one
 * Vitest loads, because Primer is externalised and Node takes the `node` export
 * condition — assumes the element is already there. Primer therefore finds a
 * plain `HTMLElement`, `announceFromElement` is undefined, and every
 * announcement throws. Tests that assert a clean console then fail on an error
 * raised nowhere near what they are testing.
 *
 * Nothing here has a screen reader, so the element only has to exist and do
 * nothing. Defined rather than mocked so Primer's own code path runs unchanged.
 */
if (
  typeof customElements !== 'undefined' &&
  !customElements.get('live-region')
) {
  class LiveRegionStub extends HTMLElement {
    // Both announce methods hand back a handle Primer keeps and cancels when
    // the announcement is superseded, so returning nothing moves the failure
    // rather than removing it.
    announce() {
      return { cancel() {} };
    }
    announceFromElement() {
      return { cancel() {} };
    }
    clear() {}
    getMessage() {
      return '';
    }
  }
  customElements.define('live-region', LiveRegionStub);
}

// Mock DragEvent and other DOM APIs not available in jsdom
class MockDragEvent extends Event {
  dataTransfer: DataTransfer | null = null;
  constructor(type: string, init?: DragEventInit) {
    super(type, init);
    this.dataTransfer = init?.dataTransfer || null;
  }
}

// Mock DataTransfer if not available
class MockDataTransfer {
  dropEffect: string = 'none';
  effectAllowed: string = 'uninitialized';
  files: FileList = [] as any;
  items: DataTransferItemList = [] as any;
  types: string[] = [];

  clearData(format?: string): void {}
  getData(format: string): string {
    return '';
  }
  setData(format: string, data: string): void {}
  setDragImage(image: Element, x: number, y: number): void {}
}

// Add missing DOM APIs to global scope
(global as any).DragEvent = MockDragEvent;
(global as any).DataTransfer = MockDataTransfer;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock Simple-related modules to prevent import errors
import { vi } from 'vitest';

vi.mock('@datalayer/jupyter-react', () => ({
  createLiteServiceManager: async () => ({
    sessions: {
      startNew: async () => ({
        kernel: {
          id: 'test-kernel',
          requestExecute: () => ({ done: Promise.resolve(), onIOPub: null }),
          shutdown: async () => {},
        },
      }),
    },
  }),
  jupyterReactStore: {
    getState: () => ({ setServiceManager: () => {} }),
  },
  useJupyter: () => ({
    defaultKernel: null,
    serviceManager: null,
  }),
  JupyterReactTheme: ({ children }: { children: React.ReactNode }) => children,
  Notebook: () => null,
  NotebookToolbar: () => null,
  CellSidebarExtension: class CellSidebarExtension {},
  CellSidebarButton: () => null,
  notebookStore: { getState: () => ({}) },
  DefaultExecutor: class DefaultExecutor {},
  notebookToolDefinitions: {},
  notebookToolOperations: {},
  CollaborationProviderBase: class CollaborationProviderBase {},
  CollaborationStatus: {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
  },
  // Reads JupyterLab's page config off the document. `AgentNotebook` and
  // `AgentDocument` call it at module scope, so the mock has to answer even
  // for a test that never renders either.
  loadJupyterConfig: () => ({}),
}));

vi.mock('@jupyter/web-components', () => ({}));

vi.mock('@jupyter/ydoc', () => ({
  YNotebook: class YNotebook {},
}));

vi.mock('y-websocket', () => ({
  WebsocketProvider: class WebsocketProvider {
    constructor() {}
    connect() {}
    disconnect() {}
    destroy() {}
  },
}));
