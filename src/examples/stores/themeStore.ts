/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type ThemeVariant,
  type ColorMode,
  themeConfigs,
} from '@datalayer/primer-addons';

export type { ThemeVariant, ColorMode };

export interface ThemeState {
  /** Current color mode (light, dark, or auto = follow OS). */
  colorMode: ColorMode;
  /** Current theme variant. */
  theme: ThemeVariant;
  /** Cycle through light → dark → auto. */
  toggleColorMode: () => void;
  /** Set a specific color mode. */
  setColorMode: (mode: ColorMode) => void;
  /**
   * Set the active theme variant.
   * @param applyDefaultColorMode When true (default), also switches the
   *   color mode to the theme's configured default.
   */
  setTheme: (theme: ThemeVariant, applyDefaultColorMode?: boolean) => void;
}

/**
 * Zustand store for theme preferences in the examples app.
 * Persisted to localStorage under 'agent-runtimes-theme' key.
 */
export const useExampleThemeStore = create<ThemeState>()(
  persist(
    set => ({
      colorMode: 'light' as ColorMode,
      theme: 'datalayer' as ThemeVariant,
      toggleColorMode: () =>
        set(state => {
          const cycle: Record<ColorMode, ColorMode> = {
            light: 'dark',
            dark: 'auto',
            auto: 'light',
          };
          return { colorMode: cycle[state.colorMode] };
        }),
      setColorMode: (mode: ColorMode) => set({ colorMode: mode }),
      setTheme: (theme: ThemeVariant, applyDefaultColorMode = true) =>
        set(() => {
          const next: Partial<ThemeState> = { theme };
          if (applyDefaultColorMode) {
            next.colorMode = themeConfigs[theme].defaultColorMode;
          }
          return next;
        }),
    }),
    {
      name: 'agent-runtimes-theme',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        colorMode: state.colorMode,
        theme: state.theme,
      }),
    },
  ),
);
