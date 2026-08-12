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
  otelUrl?: string;
  apiKey?: string;
  limit?: number;
  accountUid?: string;
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
  otelUrl,
  apiKey,
  limit = 500,
  accountUid,
}: OtelQueryOptions): Promise<MetricValueRow[]> {
  if (!otelUrl || !apiKey) {
    return [];
  }

  const client = createOtelClient({
    baseUrl: otelUrl,
    token: apiKey,
  });
  const filtered = await client.fetchMetrics({
    metricName: metric,
    serviceName,
    limit,
    accountUid,
  });
  if (filtered.data.length > 0 || !serviceName) {
    return filtered.data;
  }

  const fallback = await client.fetchMetrics({
    metricName: metric,
    limit,
    accountUid,
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
  otelUrl?: string;
  apiKey?: string;
  limit?: number;
  accountUid?: string;
}

export async function fetchOtelTotalTokens({
  serviceName,
  otelUrl,
  apiKey,
  limit = 500,
  accountUid,
}: OtelTotalTokensOptions): Promise<number> {
  const total = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.total_tokens',
    serviceName,
    otelUrl,
    apiKey,
    limit,
    accountUid,
  });
  if (total > 0) {
    return total;
  }

  const prompt = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.prompt_tokens',
    serviceName,
    otelUrl,
    apiKey,
    limit,
    accountUid,
  });
  const completion = await fetchOtelMetricTotal({
    metric: 'agent_runtimes.prompt.turn.completion_tokens',
    serviceName,
    otelUrl,
    apiKey,
    limit,
    accountUid,
  });
  return prompt + completion;
}

export function useOtelTotalTokens({
  serviceName,
  otelUrl,
  apiKey,
  limit = 500,
  accountUid,
}: OtelTotalTokensOptions): string {
  const [tokensLabel, setTokensLabel] = useState('-');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const total = await fetchOtelTotalTokens({
          serviceName,
          otelUrl,
          apiKey,
          limit,
          accountUid,
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
  }, [apiKey, limit, otelUrl, serviceName, accountUid]);

  return tokensLabel;
}
