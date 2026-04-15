/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent monitoring hooks.
 *
 * @module hooks/useMonitoring
 */

import { useEffect, useState } from 'react';
import { createOtelClient } from '@datalayer/core/lib/otel';

export interface OtelQueryOptions {
  metric: string;
  serviceName?: string;
  runUrl?: string;
  apiKey?: string;
  limit?: number;
}

interface MetricValueRow {
  value?: unknown;
  value_double?: unknown;
  value_int?: unknown;
}

export function toMetricValue(row: MetricValueRow): number {
  const candidates = [row.value_double, row.value_int, row.value];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

export async function fetchOtelMetricRows({
  metric,
  serviceName,
  runUrl,
  apiKey,
  limit = 500,
}: OtelQueryOptions): Promise<MetricValueRow[]> {
  if (!runUrl || !apiKey) {
    return [];
  }

  const client = createOtelClient({
    baseUrl: runUrl,
    token: apiKey,
  });
  const filtered = await client.fetchMetrics({
    metricName: metric,
    serviceName,
    limit,
  });
  if (filtered.data.length > 0 || !serviceName) {
    return filtered.data;
  }

  const fallback = await client.fetchMetrics({
    metricName: metric,
    limit,
  });
  return fallback.data;
}

export async function fetchOtelMetricTotal(
  options: OtelQueryOptions,
): Promise<number> {
  const rows = await fetchOtelMetricRows(options);
  return rows.reduce((sum, row) => sum + toMetricValue(row), 0);
}

export interface OtelTotalTokensOptions {
  serviceName?: string;
  runUrl?: string;
  apiKey?: string;
  limit?: number;
}

export async function fetchOtelTotalTokens({
  serviceName,
  runUrl,
  apiKey,
  limit = 500,
}: OtelTotalTokensOptions): Promise<number> {
  const total = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.total_tokens',
    serviceName,
    runUrl,
    apiKey,
    limit,
  });
  if (total > 0) {
    return total;
  }

  const prompt = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.prompt_tokens',
    serviceName,
    runUrl,
    apiKey,
    limit,
  });
  const completion = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.completion_tokens',
    serviceName,
    runUrl,
    apiKey,
    limit,
  });
  return prompt + completion;
}

export function useOtelTotalTokens({
  serviceName,
  runUrl,
  apiKey,
  limit = 500,
}: OtelTotalTokensOptions): string {
  const [tokensLabel, setTokensLabel] = useState('-');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const total = await fetchOtelTotalTokens({
          serviceName,
          runUrl,
          apiKey,
          limit,
        });
        if (cancelled) {
          return;
        }
        if (total > 0) {
          setTokensLabel(Math.round(total).toLocaleString());
        } else {
          setTokensLabel('-');
        }
      } catch {
        if (!cancelled) {
          setTokensLabel('-');
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [apiKey, limit, runUrl, serviceName]);

  return tokensLabel;
}
