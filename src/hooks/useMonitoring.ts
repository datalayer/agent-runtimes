/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent monitoring: metric rows read from the OTEL service, for the charts.
 *
 * A total of tokens is not read here: listing the latest points of a running
 * total and adding them up is neither bounded in time nor a total. It is the
 * OTEL service's token route (`GET /api/otel/v1/metrics/tokens`), which
 * reads each counter's increase over a window, per service.
 *
 * @module hooks/useMonitoring
 */

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
