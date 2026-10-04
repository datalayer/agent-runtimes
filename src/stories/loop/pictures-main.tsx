/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page the pictures are taken of (LOOP T-16): one reference screen, or
 * one state of the floating assistant, in one theme and one mode, chosen by
 * the address — `html/pictures.html?screen=approval&theme=loop&mode=dark`,
 * or `?assistant=thinking&mode=light`, or a character idle,
 * `?character=wizard&mode=dark` (Datalayer's, or the owl a plugin contributes).
 *
 * It sets `data-pictures-ready` on the document once the fonts are in — Inter
 * in its two weights, served by this page (T-04) — and two frames have
 * painted, which is what the capture waits for.
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
  CHARACTER_PICTURES,
  CharacterScreen,
  type CharacterPicture,
  REFERENCE_SCREEN_COMPONENTS,
  REFERENCE_SCREENS,
  REFERENCE_THEMES,
  ReferenceTheme,
  type AssistantPicture,
  type ReferenceMode,
  type ReferenceScreen,
} from './ReferenceScreens';

import '../../../style/primer-primitives.css';
// The `loop` theme's face (LOOP T-04): Inter and its metric-matched fallback,
// served by this page's own Vite, as the landing serves them from its build.
import '@datalayer/primer-addons/style/loop-face.css';

const params = new URLSearchParams(window.location.search);
const theme = (
  REFERENCE_THEMES.includes(params.get('theme') as ThemeVariant)
    ? params.get('theme')
    : 'loop'
) as ThemeVariant;
const mode: ReferenceMode = params.get('mode') === 'dark' ? 'dark' : 'light';
const screen = params.get('screen') as ReferenceScreen | null;
const assistant = params.get('assistant') as AssistantPicture | null;
const character = params.get('character') as CharacterPicture | null;

function Ready(): null {
  useEffect(() => {
    let cancelled = false;
    // Inter is fetched only once text asks for it: ask for both weights, so
    // that the picture is never taken in the fallback.
    void Promise.all([
      document.fonts.load('400 14px "Inter Variable"'),
      document.fonts.load('600 14px "Inter Variable"'),
    ])
      .then(() => document.fonts.ready)
      .then(() => {
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
  if (character && CHARACTER_PICTURES.includes(character)) {
    return (
      <ReferenceTheme theme={theme} mode={mode}>
        <CharacterScreen character={character} ready={<Ready />} />
      </ReferenceTheme>
    );
  }
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
