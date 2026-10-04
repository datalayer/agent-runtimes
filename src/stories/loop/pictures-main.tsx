/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page the pictures are taken of (LOOP T-16): one reference screen, or
 * one state of the floating assistant, in one theme and one mode, chosen by
 * the address — `html/pictures.html?screen=approval&theme=loop&mode=dark`,
 * or `?assistant=thinking&mode=light`.
 *
 * It sets `data-pictures-ready` on the document once the fonts are in and two
 * frames have painted, which is what the capture waits for.
 *
 * @module stories/loop/pictures-main
 */

const globals = globalThis as Record<string, unknown>;
if (globals['__webpack_public_path__'] === undefined) {
  globals['__webpack_public_path__'] = '';
}

import { useEffect } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import type { ThemeVariant } from '@datalayer/primer-addons';
import {
  ASSISTANT_PICTURES,
  AssistantScreen,
  REFERENCE_SCREEN_COMPONENTS,
  REFERENCE_SCREENS,
  REFERENCE_THEMES,
  ReferenceTheme,
  type AssistantPicture,
  type ReferenceMode,
  type ReferenceScreen,
} from './ReferenceScreens';

import '../../../style/primer-primitives.css';

const params = new URLSearchParams(window.location.search);
const theme = (
  REFERENCE_THEMES.includes(params.get('theme') as ThemeVariant)
    ? params.get('theme')
    : 'loop'
) as ThemeVariant;
const mode: ReferenceMode = params.get('mode') === 'dark' ? 'dark' : 'light';
const screen = params.get('screen') as ReferenceScreen | null;
const assistant = params.get('assistant') as AssistantPicture | null;

function Ready(): null {
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) {
            document.documentElement.setAttribute('data-pictures-ready', '');
          }
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

function Page(): JSX.Element {
  if (assistant && ASSISTANT_PICTURES.includes(assistant)) {
    return (
      <ReferenceTheme theme={theme} mode={mode}>
        <AssistantScreen picture={assistant} />
        <Ready />
      </ReferenceTheme>
    );
  }
  const name =
    screen && REFERENCE_SCREENS.includes(screen) ? screen : 'conversation';
  const Screen = REFERENCE_SCREEN_COMPONENTS[name];
  return (
    <ReferenceTheme theme={theme} mode={mode}>
      <Screen />
      <Ready />
    </ReferenceTheme>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Page />);
}
