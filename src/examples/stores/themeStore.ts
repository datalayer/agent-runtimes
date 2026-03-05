/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  createThemeStore,
  type ThemeVariant,
  type ColorMode,
  type ThemeState,
} from '@datalayer/primer-addons';

export type { ThemeVariant, ColorMode, ThemeState };

/**
 * Zustand store for theme preferences in the examples app.
 * Persisted to localStorage under 'agent-runtimes-theme' key.
 * Delegates to the shared `createThemeStore` factory from primer-addons.
 */
export const useExampleThemeStore: ReturnType<typeof createThemeStore> =
  createThemeStore('agent-runtimes-theme', {
    colorMode: 'light',
    theme: 'datalayer',
  });
