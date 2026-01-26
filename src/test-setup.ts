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
  useJupyter: () => ({
    defaultKernel: null,
    serviceManager: null,
  }),
  JupyterReactTheme: ({ children }: { children: React.ReactNode }) => children,
  CollaborationProviderBase: class CollaborationProviderBase {},
  CollaborationStatus: {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
  },
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
