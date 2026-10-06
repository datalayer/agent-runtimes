/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `<datalayer-app>`'s attributes, read without a DOM (LOOP D-07, D-08,
 * D-11, T-13): the four modes and the chat each floats in, what the host may
 * override and in what order, the snippet the *Ship* tab copies, and the
 * theme the element carries inside.
 */

import { describe, expect, it } from 'vitest';
import {
  getThemeConfig,
  loopAccentStyles,
  loopControlsCss,
  loopFontFamily,
  loopThemeStyles,
} from '@datalayer/primer-addons';
import { emptyAppspec } from '../apps/appspec';
import {
  EMBED_OBSERVED_ATTRIBUTES,
  EmbedAttributeError,
  checkedFont,
  embedLookOf,
  embedSnippetOf,
  floatingViewOf,
  inlineHeightOf,
} from '../embed/embedConfig';
import {
  embedShadowCss,
  embedThemeOverrides,
  embedThemeStyles,
} from '../embed/embedTheme';

const app = (() => {
  const spec = emptyAppspec('chat');
  spec.interface.accent = 'sky';
  spec.deployment = { embedded: { mode: 'assistant', origins: [] } };
  return spec;
})();

describe('the four modes', () => {
  it('float the chat as a popup, a panel or the assistant; inline floats nothing', () => {
    expect(floatingViewOf('bubble')).toBe('floating-small');
    expect(floatingViewOf('panel')).toBe('panel');
    expect(floatingViewOf('assistant')).toBe('assistant');
    expect(floatingViewOf('inline')).toBeUndefined();
  });

  it('are the Appspec’s unless the host says otherwise, then inline', () => {
    expect(embedLookOf({ attributes: {} }, app).mode).toBe('assistant');
    expect(embedLookOf({ attributes: { mode: 'panel' } }, app).mode).toBe(
      'panel',
    );
    expect(embedLookOf({ attributes: {} }, emptyAppspec()).mode).toBe('inline');
  });

  it('refuse a mode that is not one, in a sentence', () => {
    expect(() => embedLookOf({ attributes: { mode: 'popup' } }, app)).toThrow(
      new EmbedAttributeError(
        'datalayer-app: "popup" is not a mode; it is inline, bubble, panel or assistant.',
      ),
    );
  });
});

describe('what the host overrides', () => {
  it('is the accent, the face and the mode: attribute, then CSS variable, then the application', () => {
    expect(embedLookOf({ attributes: {} }, app)).toEqual({
      mode: 'assistant',
      accent: 'sky',
      colorMode: 'auto',
      font: '',
      variant: 'loop',
    });
    expect(
      embedLookOf(
        {
          attributes: {},
          variables: { accent: 'rose', theme: 'dark', font: 'Georgia, serif' },
        },
        app,
      ),
    ).toMatchObject({
      accent: 'rose',
      colorMode: 'dark',
      font: 'Georgia, serif',
    });
    expect(
      embedLookOf(
        {
          attributes: { accent: 'violet', theme: 'light', font: 'Inter' },
          variables: { accent: 'rose', theme: 'dark', font: 'Georgia, serif' },
        },
        app,
      ),
    ).toMatchObject({ accent: 'violet', colorMode: 'light', font: 'Inter' });
  });

  it('is the theme the application names (T-30), its mode below the host’s', () => {
    const themed = {
      ...app,
      interface: {
        ...app.interface,
        theme: { variant: 'earth', mode: 'dark' },
      },
    } as typeof app;
    expect(embedLookOf({ attributes: {} }, themed)).toMatchObject({
      variant: 'earth',
      colorMode: 'dark',
    });
    expect(
      embedLookOf({ attributes: { theme: 'light' } }, themed),
    ).toMatchObject({ variant: 'earth', colorMode: 'light' });
  });

  it('refuses an accent that is not one of the six, and a font that is not a family', () => {
    expect(() => embedLookOf({ attributes: { accent: 'red' } }, app)).toThrow(
      /"red" is not an accent; it is green, rose, sky, lime, sun or violet/,
    );
    expect(() => checkedFont('x; } body { display: none')).toThrow(
      EmbedAttributeError,
    );
    expect(() => checkedFont('url(https://evil)')).toThrow(EmbedAttributeError);
    expect(checkedFont(' "Helvetica Neue", Arial, sans-serif ')).toBe(
      '"Helvetica Neue", Arial, sans-serif',
    );
  });

  it('gives an inline application a height, never less than a usable one', () => {
    expect(inlineHeightOf(null)).toBe(640);
    expect(inlineHeightOf('900')).toBe(900);
    expect(inlineHeightOf('20')).toBe(640);
  });

  it('watches every attribute it reads', () => {
    expect(EMBED_OBSERVED_ATTRIBUTES).toEqual(
      expect.arrayContaining([
        'app',
        'origin',
        'token',
        'spec',
        'mode',
        'accent',
        'theme',
        'font',
        'server',
        'api',
        'height',
      ]),
    );
  });
});

describe('the snippet', () => {
  it('is one script tag and one element', () => {
    expect(
      embedSnippetOf({
        origin: 'https://datalayer.app/',
        app: '01M',
        mode: 'assistant',
      }),
    ).toBe(
      '<script src="https://datalayer.app/embed/datalayer-app.js" async></script>\n' +
        '<datalayer-app app="01M" origin="https://datalayer.app" mode="assistant"></datalayer-app>',
    );
  });

  it('carries a private application’s token, and the host’s look, escaped', () => {
    const snippet = embedSnippetOf({
      origin: 'https://datalayer.app',
      app: '01M',
      token: 'eyJ"<x>',
      accent: 'sun',
      theme: 'dark',
      font: '"Helvetica Neue", sans-serif',
    });
    expect(snippet).toContain(' accent="sun" theme="dark"');
    expect(snippet).toContain(' font="&quot;Helvetica Neue&quot;, sans-serif"');
    expect(snippet).toContain(' token="eyJ&quot;&lt;x&gt;"');
  });
});

describe('the theme inside the element', () => {
  it('is the loop theme with the application’s accent, in both modes', () => {
    const styles = embedThemeStyles({ accent: 'violet' }) as {
      light: Record<string, string>;
      dark: Record<string, string>;
      css?: string;
    };
    expect(styles.light).toMatchObject(loopAccentStyles('violet', 'light'));
    expect(styles.dark).toMatchObject(loopAccentStyles('violet', 'dark'));
    expect(styles.css).toBe(loopThemeStyles.css);
  });

  it('is the theme the application names, without loop’s accent over it (T-30)', () => {
    const styles = embedThemeStyles({ accent: 'violet', variant: 'earth' }) as {
      light: Record<string, string>;
      css?: string;
    };
    const earth = getThemeConfig('earth').themeStyles;
    expect(styles.light).toEqual(earth.light);
    expect(styles.css).toBe(earth.css);
    expect(embedThemeOverrides({ accent: 'violet', variant: 'earth' })).toEqual(
      { light: {}, dark: {} },
    );
  });

  it('takes the host’s face wherever the theme names its own', () => {
    const styles = embedThemeStyles({
      accent: 'green',
      font: 'Georgia, serif',
    }) as { light: Record<string, string> };
    const values = Object.values(styles.light).filter(
      value => typeof value === 'string',
    );
    expect(values.some(value => value.includes(loopFontFamily))).toBe(false);
    expect(styles.light['--fontStack-sansSerif']).toBe('Georgia, serif');
    expect(styles.light['--text-title-shorthand-medium']).toContain(
      'Georgia, serif',
    );
  });

  it('resets what the host page would pass down, and scopes the theme’s controls to its element', () => {
    const css = embedShadowCss(loopThemeStyles.css);
    expect(css).toContain(':host {\n  all: initial;');
    expect(css).toContain(
      '@scope ([data-datalayer-theme-scope]) to ([data-datalayer-theme-scope]:not([data-datalayer-theme-scope]))',
    );
    expect(css).toContain(loopControlsCss.trim().split('\n')[0]);
    // A floating mode takes no room in the page.
    expect(css).toContain(':host(:not([data-embed-mode="inline"]))');
  });
});
