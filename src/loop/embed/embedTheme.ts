/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `loop` theme, carried inside the embed (LOOP T-13, D-11).
 *
 * The element draws the application in a shadow root: the host's styles do
 * not reach in, and the application's do not reach out. The theme travels
 * with it as CSS custom properties, set on the theme provider's own element
 * inside that root — the `loop` theme's, with the application's accent over
 * it — and the theme's own stylesheet (its controls as pills, T-09) is
 * written into the root, scoped to that element, since a stylesheet in the
 * host's `<head>` does not cross into a shadow tree.
 *
 * What a host may change is three things, and nothing else needs changing
 * for it to look at home: the accent, the face and the mode. The face is
 * swapped wherever the theme names its own (`loopFontFamily`): the body, the
 * font stacks and every font shorthand.
 *
 * @module loop/embed/embedTheme
 */

import type { CSSProperties } from 'react';
import {
  getThemeConfig,
  loopFontFamily,
  scopeThemeCss,
  THEME_SCOPE_ATTRIBUTE,
  themeAccentVars,
  type ThemeStyles,
} from '@datalayer/primer-addons';
import type { AppAccent, AppThemeVariant } from '../../types/agentspecs';
import type { ThemeOverrides } from '../../types/chat';

/** One mode's properties, with the theme's face replaced by the host's. */
function withFace(
  styles: Record<string, unknown>,
  font: string,
  own: string,
): Record<string, unknown> {
  if (!font || !own) {
    return styles;
  }
  return Object.fromEntries(
    Object.entries(styles).map(([name, value]) => [
      name,
      typeof value === 'string' ? value.split(own).join(font) : value,
    ]),
  );
}

/** The face a theme names in a mode: `loop`'s own, or the theme's `fontFamily`. */
function faceOf(
  variant: AppThemeVariant,
  styles: Record<string, unknown>,
): string {
  if (variant === 'loop') {
    return loopFontFamily;
  }
  return typeof styles.fontFamily === 'string' ? styles.fontFamily : '';
}

/**
 * The accent over a theme, whichever theme (T-05, T-30; every theme since
 * 2026-10-07); none when neither the application nor the host names one —
 * the theme's own colours.
 */
const accentOver = (
  accent: AppAccent | undefined,
  which: 'light' | 'dark',
): Record<string, string> => (accent ? themeAccentVars(accent, which) : {});

/**
 * The theme as the embed wears it — `loop`, or the one the application
 * names (T-30) — with the application's accent over it in both modes
 * (T-05), and the host's face when it named one.
 */
export function embedThemeStyles({
  accent,
  font = '',
  variant = 'loop',
}: {
  accent?: AppAccent;
  font?: string;
  variant?: AppThemeVariant;
}): ThemeStyles {
  const base = getThemeConfig(variant).themeStyles;
  const mode = (which: 'light' | 'dark') => {
    const theme = base[which] as Record<string, unknown>;
    return withFace(
      { ...theme, ...accentOver(accent, which) },
      font,
      faceOf(variant, theme),
    ) as CSSProperties;
  };
  return {
    ...base,
    light: mode('light'),
    dark: mode('dark'),
  };
}

/**
 * The same accent and face laid over the conversation's own theme (T-05,
 * D-11): the chat sets its theme again inside it, which would put the
 * theme's colours and face back over what the embed set around it. The
 * accent's properties in each mode (over any theme), and, when the host
 * named a face, every property of the theme that names its own.
 */
export function embedThemeOverrides({
  accent,
  font = '',
  variant = 'loop',
}: {
  accent?: AppAccent;
  font?: string;
  variant?: AppThemeVariant;
}): ThemeOverrides {
  const base = getThemeConfig(variant).themeStyles;
  const mode = (which: 'light' | 'dark'): Record<string, string> => {
    const theme = base[which] as Record<string, unknown>;
    const faced = Object.fromEntries(
      Object.entries(withFace(theme, font, faceOf(variant, theme))).filter(
        ([name, value]) => typeof value === 'string' && value !== theme[name],
      ),
    ) as Record<string, string>;
    return { ...faced, ...accentOver(accent, which) };
  };
  return { light: mode('light'), dark: mode('dark') };
}

/**
 * The element's own stylesheet, written into its shadow root.
 *
 * `all: initial` on the host: nothing the host page sets — a font, a colour,
 * a line height, a text alignment — is inherited by the application. The
 * theme's custom properties are set again inside, on the provider's element,
 * so a host's variable of the same name never reaches what the application
 * draws. A floating mode takes no room in the page: what it draws is fixed to
 * the viewport.
 *
 * With the theme's own stylesheet, scoped to the provider's element in this
 * root.
 */
export function embedShadowCss(themeCss?: string): string {
  const own = `
:host {
  all: initial;
  display: block;
  position: relative;
  width: 100%;
}
:host([hidden]) {
  display: none;
}
:host(:not([data-embed-mode="inline"])) {
  width: 0;
  height: 0;
}
.datalayer-app-root,
.datalayer-app-portal {
  font-family: var(--fontStack-sansSerif, system-ui, sans-serif);
}
.datalayer-app-said {
  font: 14px/1.5 system-ui, sans-serif;
  padding: 12px 16px;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  color: #1f2328;
  background: #ffffff;
}
iframe.datalayer-app-frame {
  display: block;
  width: 100%;
  border: 0;
  min-height: 240px;
}
`;
  return themeCss
    ? `${own}\n${scopeThemeCss(themeCss, [`[${THEME_SCOPE_ATTRIBUTE}]`])}`
    : own;
}
