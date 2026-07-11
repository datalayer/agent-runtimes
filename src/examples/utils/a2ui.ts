/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  basicCatalog,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import {
  themeConfigs,
  type ColorMode,
  type ThemeVariant,
} from '@datalayer/primer-addons';
import { useExampleThemeStore } from './themeStore';

export type A2uiProcessor = MessageProcessor<ReactComponentImplementation>;
export type A2uiSurfaceModel = SurfaceModel<ReactComponentImplementation>;

function resolveColorMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'dark') {
    return 'dark';
  }
  if (mode === 'light') {
    return 'light';
  }
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

function createA2uiTheme(themeVariant: ThemeVariant, colorMode: ColorMode) {
  const cfg = themeConfigs[themeVariant];
  const resolvedMode = resolveColorMode(colorMode);
  const modeStyles =
    resolvedMode === 'dark' ? cfg.themeStyles.dark : cfg.themeStyles.light;
  const vars = modeStyles as Record<string, string>;

  return {
    mode: resolvedMode,
    '--a2ui-color-primary': cfg.brandColor,
    '--a2ui-color-primary-hover': vars['--button-primary-bgColor-hover'],
    '--a2ui-color-on-primary': vars['--button-primary-fgColor-rest'],
    '--a2ui-color-secondary': vars['--button-default-bgColor-rest'],
    '--a2ui-color-secondary-hover': vars['--button-default-bgColor-hover'],
    '--a2ui-color-on-secondary': vars['--button-default-fgColor-rest'],
    '--a2ui-color-background': vars['--bgColor-default'],
    '--a2ui-color-surface': vars['--bgColor-muted'],
    '--a2ui-color-on-background': vars['--fgColor-default'],
    '--a2ui-color-on-surface': vars['--fgColor-default'],
    '--a2ui-color-border': vars['--borderColor-default'],
    '--a2ui-color-border-hover': vars['--borderColor-emphasis'],
    '--a2ui-text-caption-color': vars['--fgColor-muted'],
    '--a2ui-border-radius': '12px',
    '--a2ui-card-border-radius': '14px',
    '--a2ui-card-box-shadow':
      resolvedMode === 'dark'
        ? '0 8px 24px rgba(1, 4, 9, 0.55)'
        : '0 8px 20px rgba(31, 35, 40, 0.08)',
  } as Record<string, unknown>;
}

export function useA2uiProcessor(
  onAction?: (action: A2uiClientAction) => void,
) {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const a2uiTheme = useMemo(
    () => createA2uiTheme(themeVariant, colorMode),
    [themeVariant, colorMode],
  );

  // The A2UI basic catalog renders purely from inherited `--a2ui-*` CSS custom
  // properties; it does not read `createSurface.theme`. Expose the computed
  // theme as an inline style so callers can apply it to the surface container
  // and have theme/color-mode changes cascade live to the rendered content.
  const themeStyle = useMemo(() => {
    const { mode, ...vars } = a2uiTheme as { mode: 'light' | 'dark' } & Record<
      string,
      unknown
    >;
    return { colorScheme: mode, ...vars } as CSSProperties;
  }, [a2uiTheme]);

  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>(
        [basicCatalog],
        onAction,
      ),
    [onAction],
  );

  const [surfaces, setSurfaces] = useState<A2uiSurfaceModel[]>(() =>
    Array.from(processor.model.surfacesMap.values()),
  );

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated(surface => {
      setSurfaces(prev => [...prev, surface]);
    });
    const deletedSub = processor.onSurfaceDeleted(id => {
      setSurfaces(prev => prev.filter(surface => surface.id !== id));
    });
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  const processMessages = useCallback(
    (messages: A2uiMessage[]) => {
      const themedMessages = messages.map(message => {
        const msg = message as A2uiMessage & {
          createSurface?: {
            theme?: Record<string, unknown>;
          };
        };
        if (!msg.createSurface) {
          return message;
        }
        return {
          ...msg,
          createSurface: {
            ...msg.createSurface,
            theme: {
              ...a2uiTheme,
              ...(msg.createSurface.theme ?? {}),
            },
          },
        } as A2uiMessage;
      });

      processor.processMessages(themedMessages);
    },
    [processor, a2uiTheme],
  );

  const resetSurfaces = useCallback(() => {
    Array.from(processor.model.surfacesMap.keys()).forEach(id => {
      processor.model.deleteSurface(id);
    });
  }, [processor]);

  return {
    processor,
    surfaces,
    processMessages,
    resetSurfaces,
    themeStyle,
  };
}

export function createSceneMessages(args: {
  surfaceId: string;
  components: Array<Record<string, unknown>>;
  value?: Record<string, unknown>;
  path?: string;
  theme?: Record<string, unknown>;
  sendDataModel?: boolean;
}): A2uiMessage[] {
  const {
    surfaceId,
    components,
    value,
    path = '/',
    theme,
    sendDataModel = true,
  } = args;

  const messages: A2uiMessage[] = [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: basicCatalog.id,
        theme,
        sendDataModel,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components,
      },
    },
  ];

  if (value !== undefined) {
    messages.push({
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path,
        value,
      },
    });
  }

  return messages;
}
