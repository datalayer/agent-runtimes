/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The light around the closed chat's button: two halos that breathe on
 * cycles of their own, behind the button and out of the way of the pointer
 * and of screen readers — on by default in the floating chat, and off when
 * its host asks.
 */

import * as React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ButtonGlow } from './ButtonGlow';

const halos = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-button-glow]'));

describe('ButtonGlow', () => {
  it('draws a breath and an aura, hidden from assistive technology', () => {
    const { container } = render(<ButtonGlow />);
    expect(halos(container).map(halo => halo.dataset.buttonGlow)).toEqual([
      'breath',
      'aura',
    ]);
    for (const halo of halos(container)) {
      expect(halo.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('breathes on two cycles of different lengths, and stays out of the pointer’s way', () => {
    const { container } = render(<ButtonGlow color="rgb(255, 0, 128)" />);
    const [breath, aura] = halos(container).map(halo =>
      window.getComputedStyle(halo),
    );
    expect(breath.animation).toContain('3.4s');
    expect(aura.animation).toContain('5.3s');
    for (const style of [breath, aura]) {
      expect(style.pointerEvents).toBe('none');
      expect(style.backgroundColor).toBe('rgb(255, 0, 128)');
    }
  });
});

describe('the floating chat’s button', () => {
  // Read as source: the floating chat mounts the whole chat stack, and what
  // matters here is the prop and what it gates.
  const source = readFileSync(
    join(__dirname, '..', 'ChatFloating.tsx'),
    'utf8',
  );

  it('glows by default, and not when its host says so', () => {
    expect(source).toMatch(/buttonGlow\?: boolean;/);
    expect(source).toMatch(/buttonGlow = true,/);
    expect(source).toMatch(
      /\{buttonGlow && <ButtonGlow color=\{brandColor\} \/>\}/,
    );
  });

  it('keeps the light behind the button', () => {
    expect(source).toMatch(/isolation: 'isolate',/);
  });
});
