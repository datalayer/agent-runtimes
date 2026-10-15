/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A streamed turn measured without its words (MOBILE M-036).
 *
 * @module portable/__tests__/runMeasures
 */

import { describe, expect, it } from 'vitest';
import {
  failureOf,
  otlpMetricsOf,
  RUN_CUT_SHORT,
  RunMeter,
  RuntimeRefusal,
} from '..';

describe('a turn measured (M-036)', () => {
  it('times the first token and the answer, and says a failure by its category only', () => {
    let now = 1000;
    const meter = new RunMeter('application', () => now);
    now = 1300;
    meter.event({ type: 'TEXT_MESSAGE_CONTENT', delta: 'The secret answer' });
    now = 1400;
    meter.event({ type: 'TEXT_MESSAGE_CONTENT', delta: '…' });
    now = 2500;
    meter.event({ type: 'RUN_FINISHED' });
    expect(meter.read()).toEqual({
      surface: 'application',
      firstTokenMs: 300,
      answerMs: 1500,
      stopLatencyMs: null,
      failure: null,
    });
    const stopped = new RunMeter('agent', () => now);
    stopped.stopped(120);
    expect(stopped.read()).toMatchObject({
      stopLatencyMs: 120,
      answerMs: null,
    });
    expect(failureOf(new RuntimeRefusal(403, 'no'))).toBe('refused');
    expect(failureOf(new Error(RUN_CUT_SHORT))).toBe('cut_short');
    expect(failureOf(new TypeError('Network request failed'))).toBe('network');
    expect(failureOf(new Error('boom'))).toBe('other');
  });

  it('writes OTLP/JSON with durations, counts and categories, never words', () => {
    const body = otlpMetricsOf(
      [
        {
          surface: 'application',
          firstTokenMs: 300,
          answerMs: 1500,
          stopLatencyMs: null,
          failure: null,
        },
        {
          surface: 'agent',
          firstTokenMs: null,
          answerMs: null,
          stopLatencyMs: null,
          failure: 'network',
        },
      ],
      2,
      { 'service.name': 'datalayer-mobile', 'service.version': '1.0.0' },
      1_760_000_000_000,
    );
    const text = JSON.stringify(body);
    const metrics = (body.resourceMetrics as any)[0].scopeMetrics[0]
      .metrics as { name: string }[];
    expect(metrics.map(metric => metric.name)).toEqual([
      'datalayer.client.run.first_token',
      'datalayer.client.run.answer',
      'datalayer.client.run.failures',
      'datalayer.client.run.recoveries',
    ]);
    expect(text).toContain('"timeUnixNano":"1760000000000000000"');
    expect(text).toContain('"stringValue":"network"');
    expect(text).not.toMatch(/secret|prompt|answerText/);
  });
});
