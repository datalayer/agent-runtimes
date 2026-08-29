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

import React, { useEffect } from 'react';
import {
  Box,
  DatalayerThemeProvider,
  type IDatalayerThemeProviderProps,
  themeConfigs,
  useThemeStore as usePrimerThemeStore,
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

  // <Chat> and other components read the shared primer-addons singleton
  // `useThemeStore` (key 'datalayer-theme', which defaults to matrix/dark),
  // not the examples' `useExampleThemeStore`. Mirror the selected theme into
  // the singleton so the chat main view follows the picker.
  useEffect(() => {
    usePrimerThemeStore.setState({ theme: themeVariant, colorMode });
  }, [themeVariant, colorMode]);

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

/**
 * Give the notebook the container's height, however deep it sits.
 *
 * `DatalayerThemeProvider` renders Primer's `BaseStyles` and `JupyterReactTheme`
 * renders a `div`, and neither has a height of its own. A `<Notebook
 * height="100%">` inside them resolves against `auto` and collapses to nothing
 * — present in the DOM, zero pixels tall, sitting at the bottom of the column.
 *
 * Sizing those wrappers by counting levels (`& > div > div`) was the first
 * attempt and it is the wrong shape: it breaks the moment either provider adds
 * or removes an element. Taking the notebook out of the flow instead makes the
 * chain irrelevant — an absolutely positioned box resolves against the nearest
 * *positioned* ancestor, which is the one wrapper here that is ours.
 *
 * `!important` because `Notebook` sets `position` and `height` in an inline
 * `style`, which no stylesheet rule can otherwise outrank.
 */
const FILL_CONTAINER = {
  position: 'relative',
  height: '100%',
  minHeight: 0,
  '& #dla-Jupyter-Notebook': {
    position: 'absolute !important',
    top: '0 !important',
    right: '0 !important',
    bottom: '0 !important',
    left: '0 !important',
  },
} as const;

export const ThemedJupyterProvider: React.FC<
  React.PropsWithChildren<{
    useJupyterReactTheme?: boolean;
    /**
     * Make the notebook fill this provider's container.
     *
     * Needed by any example whose notebook is sized `height="100%"` and whose
     * sizing container is outside this provider. See {@link FILL_CONTAINER}.
     */
    fullHeight?: boolean;
  }>
> = ({ children, useJupyterReactTheme = true, fullHeight = false }) => {
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

  const themed = (
    <ThemedProvider>
      {useJupyterReactTheme ? (
        // `ThemedProvider` (DatalayerThemeProvider) already applies Primer
        // BaseStyles with the branded theme font. Disable the inner BaseStyles
        // so Jupyter examples inherit that font instead of Primer's default.
        <JupyterReactTheme
          colormode={colorMode}
          backgroundColor={backgroundColor}
          useBaseStyles={false}
        >
          {children}
        </JupyterReactTheme>
      ) : (
        children
      )}
    </ThemedProvider>
  );

  return fullHeight ? <Box sx={FILL_CONTAINER}>{themed}</Box> : themed;
};
