/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  themeConfigs,
  type ColorMode,
  type ThemeState,
  type ThemeVariant,
} from '@datalayer/primer-addons';

const STORAGE_KEY = 'agent-runtimes-agent-node-theme';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const colorModeCycle: Record<ColorMode, ColorMode> = {
  light: 'dark',
  dark: 'auto',
  auto: 'light',
};

const normalizeThemeVariant = (value: unknown): ThemeVariant => {
  // Backward compatibility: "ocean" maps to the Earth theme variant.
  if (value === 'ocean') {
    return 'earth';
  }
  if (
    value === 'datalayer' ||
    value === 'spatial' ||
    value === 'lovely' ||
    value === 'matrix' ||
    value === 'earth'
  ) {
    return value;
  }
  return 'earth';
};

const cookieStorage = {
  getItem: (name: string): string | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    const encodedName = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split('; ');
    for (const part of parts) {
      if (part.startsWith(encodedName)) {
        return decodeURIComponent(part.slice(encodedName.length));
      }
    }
    return null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  },
  removeItem: (name: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; samesite=lax`;
  },
};

export const useAgentNodeThemeStore: UseBoundStore<StoreApi<ThemeState>> =
  create<ThemeState>()(
    persist(
      set => ({
        // "ocean dark" default: Earth theme (ocean palette) + dark mode.
        colorMode: 'dark',
        theme: 'earth',
        activeVariant: null,
        variants: {},

        toggleColorMode: () =>
          set(state => {
            const next = colorModeCycle[state.colorMode];
            if (state.activeVariant && state.variants[state.activeVariant]) {
              return {
                colorMode: next,
                variants: {
                  ...state.variants,
                  [state.activeVariant]: {
                    ...state.variants[state.activeVariant],
                    colorMode: next,
                  },
                },
              };
            }
            return { colorMode: next };
          }),

        setColorMode: (mode: ColorMode) =>
          set(state => {
            if (state.activeVariant && state.variants[state.activeVariant]) {
              return {
                colorMode: mode,
                variants: {
                  ...state.variants,
                  [state.activeVariant]: {
                    ...state.variants[state.activeVariant],
                    colorMode: mode,
                  },
                },
              };
            }
            return { colorMode: mode };
          }),

        setTheme: (theme: ThemeVariant, applyDefaultColorMode = true) =>
          set(state => {
            const normalizedTheme = normalizeThemeVariant(theme);
            const nextColorMode = applyDefaultColorMode
              ? themeConfigs[normalizedTheme].defaultColorMode
              : state.colorMode;
            if (state.activeVariant && state.variants[state.activeVariant]) {
              return {
                theme: normalizedTheme,
                colorMode: nextColorMode,
                variants: {
                  ...state.variants,
                  [state.activeVariant]: {
                    theme: normalizedTheme,
                    colorMode: nextColorMode,
                  },
                },
              };
            }
            return { theme: normalizedTheme, colorMode: nextColorMode };
          }),

        registerVariants: defs =>
          set(state => {
            const merged = { ...state.variants };
            for (const [key, val] of Object.entries(defs)) {
              if (!merged[key]) {
                merged[key] = val;
              }
            }
            return { variants: merged };
          }),

        setVariant: variant =>
          set(state => {
            const variantState = state.variants[variant];
            if (!variantState) {
              return { activeVariant: variant };
            }
            return {
              activeVariant: variant,
              theme: normalizeThemeVariant(variantState.theme),
              colorMode: variantState.colorMode,
            };
          }),
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => cookieStorage),
        partialize: state => ({
          colorMode: state.colorMode,
          theme: state.theme,
          activeVariant: state.activeVariant,
          variants: state.variants,
        }),
        merge: (persisted, current) => {
          const persistedState = (persisted ?? {}) as Partial<ThemeState>;
          const persistedTheme = normalizeThemeVariant(persistedState.theme);
          return {
            ...current,
            ...persistedState,
            theme: persistedTheme,
            variants: {
              ...current.variants,
              ...(persistedState.variants ?? {}),
            },
          };
        },
      },
    ),
  );
