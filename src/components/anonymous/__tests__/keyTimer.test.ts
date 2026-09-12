/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When the trial clock raises its voice.
 *
 * Three steps, and each is a *share* of the key rather than a number of
 * seconds — because the service decides how long it signs one for. Absolute
 * thresholds break in both directions: a sixty-second key warns from its first
 * tick and is shouting for its whole existence, and a ten-minute key says
 * nothing until it is nearly gone. A quarter left means the same thing at
 * every length, which is what makes the defaults defensible.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(__dirname, '..', 'AnonymousKeyTimer.tsx'),
  'utf8',
);

/** The tone the component would pick, as it picks it. */
function toneFor(
  fraction: number,
  { warnAt = 0.25, dangerAt = 0.1, pulseAt = 0.05 } = {},
): { tone: string; pulsing: boolean } {
  return {
    pulsing: fraction <= pulseAt,
    tone:
      fraction <= dangerAt
        ? 'danger.fg'
        : fraction <= warnAt
          ? 'attention.fg'
          : 'fg.muted',
  };
}

describe('the defaults', () => {
  it('are proportions, not durations', () => {
    // The rule this file exists for. A number of milliseconds here would be an
    // opinion about how long the service signs keys for, which is not this
    // component's to hold.
    expect(SOURCE).toContain('const DEFAULT_WARN_AT = 0.25');
    expect(SOURCE).toContain('const DEFAULT_DANGER_AT = 0.1');
    expect(SOURCE).toContain('const DEFAULT_PULSE_AT = 0.05');
    expect(SOURCE).not.toContain('Math.min(60_000');
  });

  it('are quiet for the first three quarters', () => {
    for (const fraction of [1, 0.8, 0.5, 0.26]) {
      expect(toneFor(fraction).tone, String(fraction)).toBe('fg.muted');
      expect(toneFor(fraction).pulsing).toBe(false);
    }
  });

  it('warn at a quarter left, and only warn', () => {
    for (const fraction of [0.25, 0.2, 0.11]) {
      expect(toneFor(fraction).tone, String(fraction)).toBe('attention.fg');
      expect(toneFor(fraction).pulsing).toBe(false);
    }
  });

  it('turn to danger at a tenth, still without moving', () => {
    for (const fraction of [0.1, 0.08, 0.051]) {
      expect(toneFor(fraction).tone, String(fraction)).toBe('danger.fg');
      expect(toneFor(fraction).pulsing).toBe(false);
    }
  });

  it('fade only at the last twentieth', () => {
    // Movement is the one step that costs the reader something, so it is spent
    // last — after two colours have plainly not been noticed.
    for (const fraction of [0.05, 0.01, 0]) {
      expect(toneFor(fraction).pulsing, String(fraction)).toBe(true);
      expect(toneFor(fraction).tone).toBe('danger.fg');
    }
  });

  it('mean the same thing at every key length', () => {
    // The point of proportions: a minute and ten minutes behave alike.
    expect(toneFor((60_000 * 0.25) / 60_000).tone).toBe('attention.fg');
    expect(toneFor((600_000 * 0.25) / 600_000).tone).toBe('attention.fg');
  });
});

describe('overriding them', () => {
  it('lets a host move each step independently', () => {
    const loud = { warnAt: 0.9, dangerAt: 0.6, pulseAt: 0.3 };
    expect(toneFor(0.95, loud).tone).toBe('fg.muted');
    expect(toneFor(0.7, loud).tone).toBe('attention.fg');
    expect(toneFor(0.4, loud).tone).toBe('danger.fg');
    expect(toneFor(0.4, loud).pulsing).toBe(false);
    expect(toneFor(0.2, loud).pulsing).toBe(true);
  });

  it('exposes all three as props', () => {
    expect(SOURCE).toContain('warnAt?: number');
    expect(SOURCE).toContain('dangerAt?: number');
    expect(SOURCE).toContain('pulseAt?: number');
  });
});

describe('the fade', () => {
  it('moves opacity and nothing else', () => {
    // A pill that grew and shrank would push the controls beside it about at
    // exactly the moment somebody is reaching for one.
    expect(SOURCE).toContain('dla-key-pulse');
    expect(SOURCE).toContain("'50%': { opacity: 0.45 }");
  });

  it('holds still for a reader who asked it to', () => {
    expect(SOURCE).toContain("'@media (prefers-reduced-motion: reduce)'");
  });
});
