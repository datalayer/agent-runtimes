/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Theme-aware wrappers for example components.
 *
 * These are drop-in replacements for `DatalayerThemeProvider` and
 * `JupyterReactTheme` that automatically read theme / color-mode
 * from the shared `useExampleThemeStore`.
 *
 * Usage: replace
 *   import { DatalayerThemeProvider } from '@datalayer/primer-addons';
 * with
 *   import { ThemedProvider } from './stores/themedProvider';
 *
 * and swap `<DatalayerThemeProvider>` → `<ThemedProvider>`.
 */

import React from 'react';
import {
  DatalayerThemeProvider,
  type IDatalayerThemeProviderProps,
  themeConfigs,
} from '@datalayer/primer-addons';
import { JupyterReactTheme } from '@datalayer/jupyter-react';
import { useExampleThemeStore } from './themeStore';

/**
 * Drop-in replacement for `<DatalayerThemeProvider>`.
 * Reads theme/colorMode from the example theme store and
 * forwards them to the real provider. Any explicit props
 * (colorMode, theme, themeStyles) are still respected as overrides.
 */
export const ThemedProvider: React.FC<
  React.PropsWithChildren<Omit<IDatalayerThemeProviderProps, 'ref'>>
> = ({ children, ...rest }) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const cfg = themeConfigs[themeVariant];

  return (
    <DatalayerThemeProvider
      colorMode={rest.colorMode ?? colorMode}
      theme={rest.theme ?? cfg.primerTheme}
      themeStyles={rest.themeStyles ?? cfg.themeStyles}
      {...rest}
    >
      {children}
    </DatalayerThemeProvider>
  );
};

/**
 * Drop-in replacement for `<JupyterReactTheme>`.
 * Wraps children in `ThemedProvider` so Jupyter components also
 * pick up the selected theme/color-mode.
 *
 * The wrapper automatically derives `colormode` and `backgroundColor`
 * from the shared theme store so every Jupyter component inherits
 * the correct palette — mirroring the pattern used by
 * `ProjectNotebookEditor`.
 *
 * @param useJupyterReactTheme - When `true`, wraps children in
 *   `<JupyterReactTheme>` inside the themed provider. Defaults to `true`.
 */
/**
 * Hook that returns the `brandColor` for the currently selected theme.
 * Use this in example components to pass a dynamic brand color to
 * `<ChatFloating>` or any other component that accepts a `brandColor` prop.
 */
export const useThemeBrandColor = (): string => {
  const { theme: themeVariant } = useExampleThemeStore();
  return themeConfigs[themeVariant].brandColor;
};

export const ThemedJupyterProvider: React.FC<
  React.PropsWithChildren<{ useJupyterReactTheme?: boolean }>
> = ({ children, useJupyterReactTheme = true }) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const cfg = themeConfigs[themeVariant];

  // Resolve 'auto' to an actual mode so we can pick the right style set.
  const resolvedMode: 'light' | 'dark' =
    colorMode === 'auto'
      ? typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : colorMode === 'dark'
        ? 'dark'
        : 'light';

  // Extract the canvas background from the theme's CSS-var overrides.
  const modeStyles =
    resolvedMode === 'dark' ? cfg.themeStyles.dark : cfg.themeStyles.light;
  const backgroundColor = (modeStyles as Record<string, string>)[
    '--bgColor-default'
  ];

  return (
    <ThemedProvider>
      {useJupyterReactTheme ? (
        <JupyterReactTheme
          colormode={colorMode}
          backgroundColor={backgroundColor}
        >
          {children}
        </JupyterReactTheme>
      ) : (
        children
      )}
    </ThemedProvider>
  );
};
