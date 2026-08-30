/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How long a visitor's trial key has left, burning down as they use it.
 *
 * An anonymous visitor reaches the model on a key the inference service mints
 * for exactly this, and it does not last. Without a clock on screen the end of
 * it arrives as an agent that suddenly stops answering — indistinguishable,
 * from the reader's chair, from an agent that is broken. A ring that empties
 * says the same thing in advance, and turns a failure into a deadline.
 *
 * Every number it draws comes from the key: when it dies and how long it was
 * given are both read out of the JWT by whoever minted it, so this assumes no
 * particular generosity from the service. The points at which it changes
 * colour are shares of that, for the same reason — see `warnAt`.
 *
 * Purely a display: it is handed a moment in the future and counts to it. What
 * to do when it arrives is the caller's business — the ring reports it once,
 * through `onExpire`, and stops.
 *
 * @module components/anonymous/AnonymousKeyTimer
 */

import { useEffect, useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { KeyIcon } from '@primer/octicons-react';

export type AnonymousKeyTimerProps = {
  /** Epoch milliseconds at which the trial ends. */
  expiresAt: number;
  /**
   * How long the key was signed for, in milliseconds.
   *
   * Read off the token by whoever minted it. The ring draws what is left *of
   * this*, and the colours below turn at a share of it — so a service that
   * signs keys for ten minutes gets a timer that behaves like a ten-minute
   * one without anything here changing. Without it the ring has no
   * denominator, so it falls back to the time remaining when it first
   * rendered.
   */
  grantedMs?: number;
  /** What the clock is counting, said beside it. */
  label?: string;
  /**
   * The share of the key still left when the clock starts warning, 0–1.
   *
   * A proportion rather than a number of seconds, because the service decides
   * how long it signs a key for and this component must not have an opinion
   * about that. A sixty-second key and a ten-minute one both turn amber with a
   * quarter of themselves to go, and both are saying the same thing: you have
   * about as long again as you have already used.
   */
  warnAt?: number;
  /** The share left when it turns to danger, 0–1. */
  dangerAt?: number;
  /**
   * The share left when it starts fading in and out, 0–1.
   *
   * The last resort of a control that has already changed colour twice and is
   * still being ignored. Movement is what the eye catches in peripheral
   * vision, which is where a header sits while somebody is typing — so this is
   * the only point at which the clock is allowed to move.
   */
  pulseAt?: number;
  /** Called once, when the clock reaches zero. */
  onExpire?: () => void;
};

/** Diameter of the ring, in pixels. Sized to sit level with a line of text. */
const RING = 14;
const STROKE = 2.5;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The three points at which the clock changes its mind, as shares of the key.
 *
 * Proportions rather than seconds. The service decides how long it signs a key
 * for — a minute today, five after a deployment changes one line — and a
 * component with absolute thresholds either shouts for the whole life of a
 * short key or says nothing until the last moment of a long one. A quarter
 * left means the same thing at every length.
 */
const DEFAULT_WARN_AT = 0.25;
const DEFAULT_DANGER_AT = 0.1;
const DEFAULT_PULSE_AT = 0.05;

/** How long one breath of the fade takes. Slow enough to read through. */
const PULSE_MS = 1200;

/** `m:ss`, or `0:07` — short enough to read at a glance in a header. */
function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AnonymousKeyTimer({
  expiresAt,
  grantedMs,
  label = 'Trial key',
  warnAt = DEFAULT_WARN_AT,
  dangerAt = DEFAULT_DANGER_AT,
  pulseAt = DEFAULT_PULSE_AT,
  onExpire,
}: AnonymousKeyTimerProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  /* The denominator, fixed at the first render for want of a better one. A
     ring whose full mark moved would read as time being added. */
  const spanRef = useRef(grantedMs ?? Math.max(1, expiresAt - Date.now()));
  const reported = useRef(false);

  useEffect(() => {
    /*
     * Polled four times a second, re-rendered once.
     *
     * A one-second interval lands off the beat and lets the displayed number
     * sit still for nearly two seconds, which reads as a stopped clock — so it
     * looks often. But it only takes the new time when the second a reader
     * would see has actually changed: everything downstream of this state is
     * DOM, and rewriting it on a tick that changes nothing is what made the
     * native tooltip flash while somebody was trying to read it.
     */
    const timer = window.setInterval(() => {
      setNow(current => {
        const next = Date.now();
        const displayed = (at: number) => Math.ceil((expiresAt - at) / 1000);
        return displayed(next) === displayed(current) ? current : next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const left = Math.max(0, expiresAt - now);

  useEffect(() => {
    if (left > 0 || reported.current) {
      return;
    }
    // Once. The interval keeps running until unmount, and a caller that
    // re-renders on expiry must not be told again on every tick after it.
    reported.current = true;
    onExpire?.();
  }, [left, onExpire]);

  const fraction = Math.min(1, Math.max(0, left / spanRef.current));
  /*
   * Three steps, each louder than the last, and the loudest one moves.
   *
   * Colour, then a stronger colour, then a fade — because a reader mid-sentence
   * is not looking at the header, and the header has to get louder without
   * getting in the way. Movement is last on purpose: it is the only one of the
   * three that costs the reader anything, so it is spent only when the other
   * two have plainly not worked.
   */
  const pulsing = fraction <= pulseAt;
  const tone =
    fraction <= dangerAt
      ? 'danger.fg'
      : fraction <= warnAt
        ? 'attention.fg'
        : 'fg.muted';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: '2px',
        borderRadius: '999px',
        border: '1px solid',
        borderColor: 'border.muted',
        bg: 'canvas.subtle',
        color: tone,
        // The clock is the point; the row it sits in must not resize as the
        // digits change width.
        fontVariantNumeric: 'tabular-nums',
        /*
          The last few percent, breathing.

          Opacity only: nothing moves, nothing resizes, and the row it sits in
          is unaffected — a pill that grew and shrank would push the controls
          beside it about at exactly the moment somebody is reaching for one.
          It never fades to nothing, because a clock that disappears is a clock
          that has stopped rather than one that is running out.

          Off for a reader who asked the machine to hold still. They have the
          colour and the number, which is the information; the movement is
          only how hard it knocks.
        */
        ...(pulsing
          ? {
              '@keyframes dla-key-pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.45 },
              },
              animation: `dla-key-pulse ${PULSE_MS}ms ease-in-out infinite`,
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }
          : null),
      }}
      /*
        The whole story, for anyone who wonders what the ring is counting.

        Deliberately without the number in it. The countdown re-renders twice
        a second, and a native tooltip is torn down and rebuilt every time its
        `title` changes — so a title carrying the remaining time flashed once
        per tick for as long as the pointer rested on it, which is the one
        place a reader is trying to read something. React writes the attribute
        only when the string differs, so a constant one stays put and the
        seconds are read off the pill beside it.

        A status readout rather than a control, so the hint rides on the native
        attribute: Primer's `Tooltip` requires an interactive child.
      */
      title={`${label}: this workspace is talking to the agent on a temporary key issued to nobody in particular. When it runs out the chat asks you to sign in. Sign in now for an account of your own.`}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', color: tone }}>
        <KeyIcon size={12} />
      </Box>
      <Box
        as="svg"
        // Presentational: the time is spelled out in the text beside it and in
        // the title, so a screen reader gains nothing from the geometry.
        aria-hidden="true"
        focusable="false"
        width={RING}
        height={RING}
        viewBox={`0 0 ${RING} ${RING}`}
        sx={{ display: 'block', flexShrink: 0 }}
      >
        {/* The whole trial, as a track. */}
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          opacity={0.2}
        />
        {/* What is left of it. Started at twelve o'clock and drawn clockwise,
            which is the direction a person expects a clock to lose. */}
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s linear' }}
        />
      </Box>
      <Text sx={{ fontSize: 0, color: tone, fontWeight: 'semibold' }}>
        {format(left)}
      </Text>
    </Box>
  );
}

export default AnonymousKeyTimer;
