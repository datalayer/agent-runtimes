/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a streamed turn went, measured without its words (MOBILE M-036, §10):
 * the time to its first streamed token, to its complete answer, how long a
 * Stop took, the category of a stream that failed, and how often a lost
 * stream was read back. Never a prompt, an answer, a tool's arguments or an
 * id — only durations, counts and coarse categories — and an OTLP/JSON body
 * of them for the platform's metrics ingest.
 *
 * Pure: the clock is given.
 *
 * @module portable/runMeasures
 */

import { RUN_CUT_SHORT, type AgUiEvent } from './agui';
import { RuntimeRefusal } from './sessions';

/** Why a stream failed, coarsely. */
export type StreamFailure = 'refused' | 'cut_short' | 'network' | 'other';

/** One turn, measured. */
export type RunMeasure = {
  surface: 'application' | 'agent';
  firstTokenMs: number | null;
  answerMs: number | null;
  stopLatencyMs: number | null;
  failure: StreamFailure | null;
};

/** The category of a stream's failure; never its message. */
export function failureOf(error: unknown): StreamFailure {
  if (error instanceof RuntimeRefusal) return 'refused';
  const message = error instanceof Error ? error.message : String(error);
  if (message === RUN_CUT_SHORT || message.includes(RUN_CUT_SHORT))
    return 'cut_short';
  if (
    error instanceof TypeError ||
    /network|offline|timed? ?out|fetch/i.test(message)
  )
    return 'network';
  return 'other';
}

/** Measures one turn from its start: fed its events, its Stop, its failure; read once it ended. */
export class RunMeter {
  private readonly started: number;
  private firstToken: number | null = null;
  private answered: number | null = null;
  private stopLatency: number | null = null;
  private failed: StreamFailure | null = null;

  constructor(
    private readonly surface: RunMeasure['surface'],
    private readonly now: () => number = () => Date.now(),
  ) {
    this.started = now();
  }

  event(event: AgUiEvent): void {
    if (this.firstToken === null && event.type === 'TEXT_MESSAGE_CONTENT') {
      this.firstToken = this.now() - this.started;
    }
    if (event.type === 'RUN_FINISHED' && this.answered === null) {
      this.answered = this.now() - this.started;
    }
  }

  stopped(latencyMs: number): void {
    this.stopLatency = Math.max(0, latencyMs);
  }

  failure(error: unknown): void {
    this.failed = failureOf(error);
  }

  read(): RunMeasure {
    return {
      surface: this.surface,
      firstTokenMs: this.firstToken,
      answerMs: this.failed || this.stopLatency !== null ? null : this.answered,
      stopLatencyMs: this.stopLatency,
      failure: this.failed,
    };
  }
}

type Attribute = { key: string; value: { stringValue: string } };
const attributes = (values: Record<string, string>): Attribute[] =>
  Object.entries(values).map(([key, value]) => ({
    key,
    value: { stringValue: value },
  }));

/**
 * The OTLP/JSON body of turns measured and lost streams read back: gauges of
 * milliseconds and counters, each point with the surface and, for a failure,
 * its category — nothing else.
 */
export function otlpMetricsOf(
  measures: RunMeasure[],
  recoveries: number,
  resource: Record<string, string>,
  nowMs: number,
): Record<string, unknown> {
  const time = String(BigInt(Math.trunc(nowMs)) * 1_000_000n);
  const gauge = (
    name: string,
    pick: (measure: RunMeasure) => number | null,
  ) => ({
    name,
    unit: 'ms',
    gauge: {
      dataPoints: measures.flatMap(measure => {
        const value = pick(measure);
        return value === null
          ? []
          : [
              {
                asDouble: value,
                timeUnixNano: time,
                attributes: attributes({ surface: measure.surface }),
              },
            ];
      }),
    },
  });
  const failures = new Map<string, number>();
  for (const measure of measures) {
    if (measure.failure) {
      const key = `${measure.surface}\n${measure.failure}`;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  }
  const metrics = [
    gauge('datalayer.client.run.first_token', measure => measure.firstTokenMs),
    gauge('datalayer.client.run.answer', measure => measure.answerMs),
    gauge(
      'datalayer.client.run.stop_latency',
      measure => measure.stopLatencyMs,
    ),
    {
      name: 'datalayer.client.run.failures',
      sum: {
        aggregationTemporality: 1,
        isMonotonic: true,
        dataPoints: [...failures].map(([key, count]) => {
          const [surface, category] = key.split('\n');
          return {
            asInt: String(count),
            timeUnixNano: time,
            attributes: attributes({ surface, category }),
          };
        }),
      },
    },
    {
      name: 'datalayer.client.run.recoveries',
      sum: {
        aggregationTemporality: 1,
        isMonotonic: true,
        dataPoints:
          recoveries > 0
            ? [
                {
                  asInt: String(recoveries),
                  timeUnixNano: time,
                  attributes: [],
                },
              ]
            : [],
      },
    },
  ].filter(metric =>
    'gauge' in metric
      ? metric.gauge.dataPoints.length > 0
      : metric.sum.dataPoints.length > 0,
  );
  return {
    resourceMetrics: [
      {
        resource: { attributes: attributes(resource) },
        scopeMetrics: [
          {
            scope: { name: '@datalayer/agent-runtimes/portable/runMeasures' },
            metrics,
          },
        ],
      },
    ],
  };
}
