/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's characters, tested for contrast on the page (LOOP T-25), as
 * the `loop` theme's faces are (T-15, primer-addons'
 * `theme/__tests__/loopContrast.test.ts`): the same WCAG measure, applied to
 * each character's key parts in each mode — its edge against the page, its
 * eyes against what they sit on — on the light page and on the dark one.
 *
 * The threshold is **3 to 1**, WCAG 2.x's for graphics and the parts of an
 * interface one must see to understand them (SC 1.4.11, non-text contrast),
 * and not T-15's 4.5 to 1, which is for body text. The page is the theme's
 * canvas (`loopColors.white`, `loopColors.black`) and every accent's stage,
 * the background an application's page lays behind its chat.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  themeAccentNames,
  themeAccents,
  loopColors,
} from '@datalayer/primer-addons/lib/theme';
import {
  ASSISTANT_CHARACTERS,
  type AssistantColorMode,
} from '../assistant/characters';
import { AssistantStage } from '../assistant/AssistantStage';

/** The relative luminance of an sRGB colour, as WCAG 2.x defines it (T-15). */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(
    at => parseInt(value.slice(at, at + 2), 16) / 255,
  );
  const linear = channels.map(c =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** The contrast ratio of two colours, 1 to 21. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG 2.x SC 1.4.11: graphics and the parts of an interface, 3 to 1. */
const NON_TEXT = 3;

const MODES: AssistantColorMode[] = ['light', 'dark'];

/** The pages a character stands on, in each mode. */
const PAGES: Record<AssistantColorMode, string[]> = {
  light: [
    loopColors.white,
    ...themeAccentNames.map(name => themeAccents[name].stage.light),
  ],
  dark: [
    loopColors.black,
    ...themeAccentNames.map(name => themeAccents[name].stage.dark),
  ],
};

const lowest = (colour: string, against: string[]) =>
  Math.min(...against.map(other => contrast(colour, other)));

describe("Datalayer's characters, on the page", () => {
  it('measures as WCAG does', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#949494', '#FFFFFF')).toBeCloseTo(3.03, 2);
  });

  for (const character of ASSISTANT_CHARACTERS) {
    for (const mode of MODES) {
      describe(`${character.name}, ${mode}`, () => {
        const key = character.keyColours?.[mode];

        it('names its key colours', () => {
          expect(key).toBeDefined();
          expect(key!.edges.length).toBeGreaterThan(0);
        });

        it('draws its edge at 3 to 1 or more against the page', () => {
          for (const edge of key!.edges) {
            expect(
              lowest(edge, PAGES[mode]),
              `${character.name}'s edge ${edge} on the ${mode} page`,
            ).toBeGreaterThanOrEqual(NON_TEXT);
          }
        });

        it('draws its eyes to be seen', () => {
          const { eye } = key!;
          // The pupil on the white of the eye.
          expect(contrast(eye.pupil, eye.white)).toBeGreaterThanOrEqual(
            NON_TEXT,
          );
          // The eye against what it sits on: its white or its ring.
          const behind = eye.on === 'page' ? PAGES[mode] : [eye.on];
          expect(
            Math.max(lowest(eye.white, behind), lowest(eye.ring, behind)),
            `${character.name}'s eyes on the ${mode} ${eye.on === 'page' ? 'page' : 'face'}`,
          ).toBeGreaterThanOrEqual(NON_TEXT);
        });

        it('draws with those colours', () => {
          const markup = renderToStaticMarkup(
            <character.Drawing size={88} mode={mode} />,
          ).toUpperCase();
          expect(markup).toContain(
            `DATA-ASSISTANT-MODE="${mode.toUpperCase()}"`,
          );
          for (const colour of [
            ...key!.edges,
            key!.eye.white,
            key!.eye.ring,
            key!.eye.pupil,
          ]) {
            expect(markup).toContain(colour.toUpperCase());
          }
        });
      });
    }
  }

  it('has a dark drawing of its own, not the light one on black', () => {
    for (const character of ASSISTANT_CHARACTERS) {
      const light = renderToStaticMarkup(
        <character.Drawing size={88} mode="light" />,
      ).replace(/data-assistant-mode="light"/, '');
      const dark = renderToStaticMarkup(
        <character.Drawing size={88} mode="dark" />,
      ).replace(/data-assistant-mode="dark"/, '');
      expect(dark, character.name).not.toBe(light);
    }
  });
});

describe('the floating assistant draws for the chat’s colour mode', () => {
  const mounted: Array<() => void> = [];
  afterEach(() => {
    mounted.splice(0).forEach(unmount => unmount());
    document.body.innerHTML = '';
  });

  for (const mode of MODES) {
    it(`the ${mode} drawing in a ${mode} chat`, async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <ThemeProvider colorMode={mode}>
            <AssistantStage
              character="cat"
              state="idle"
              place={{ left: 10, top: 10 }}
              stageRef={createRef<HTMLDivElement>()}
              onDragStart={() => {}}
              open={false}
              onToggle={() => {}}
              onDismiss={() => {}}
            />
          </ThemeProvider>,
        );
      });
      mounted.push(() => act(() => root.unmount()));
      expect(
        container
          .querySelector('svg[aria-label="Cat"]')
          ?.getAttribute('data-assistant-mode'),
      ).toBe(mode);
    });
  }
});
