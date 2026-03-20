/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useState } from 'react';

export interface OtelQueryOptions {
  metric: string;
  serviceName: string;
  runUrl?: string;
  apiKey?: string;
  limit?: number;
}

export function toMetricValue(row: Record<string, unknown>): number {
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

export function getOtelBaseUrl(runUrl?: string): string {
  return (
    runUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    ''
  ).replace(/\/$/, '');
}

export function getOtelHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {};
  if (apiKey && apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown[] }).data)
  ) {
    return (payload as { data: Array<Record<string, unknown>> }).data;
  }
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  return [];
}

export async function fetchOtelMetricRows({
  metric,
  serviceName,
  runUrl,
  apiKey,
  limit = 500,
}: OtelQueryOptions): Promise<Array<Record<string, unknown>>> {
  if (!serviceName) {
    return [];
  }

  const baseUrl = getOtelBaseUrl(runUrl);
  if (!baseUrl) {
    return [];
  }

  const query = new URLSearchParams({
    name: metric,
    service_name: serviceName,
    limit: String(limit),
  });

  const response = await fetch(
    `${baseUrl}/api/otel/v1/metrics/query/?${query.toString()}`,
    { headers: getOtelHeaders(apiKey) },
  );
  if (!response.ok) {
    return [];
  }
  const payload = await response.json();
  return extractRows(payload);
}

export async function fetchOtelMetricTotal(
  options: OtelQueryOptions,
): Promise<number> {
  const rows = await fetchOtelMetricRows(options);
  return rows.reduce((sum, row) => sum + toMetricValue(row), 0);
}

export interface OtelTotalTokensOptions {
  serviceName: string;
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
  if (!serviceName) {
    return 0;
  }

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
  if (prompt + completion > 0) {
    return prompt + completion;
  }

  const legacyMetrics = [
    'agent_runtimes.prompt.turn.system_prompt_tokens',
    'agent_runtimes.prompt.turn.tools_description_tokens',
    'agent_runtimes.prompt.turn.user_message_tokens',
    'agent_runtimes.prompt.turn.ai_message_tokens',
    'agent_runtimes.prompt.turn.tools_usage_tokens',
  ];

  const legacyTotals = await Promise.all(
    legacyMetrics.map(metric =>
      fetchOtelMetricTotal({
        metric,
        serviceName,
        runUrl,
        apiKey,
        limit,
      }),
    ),
  );

  return legacyTotals.reduce((sum, value) => sum + value, 0);
}

export function useOtelTotalTokens({
  serviceName,
  runUrl,
  apiKey,
  limit = 500,
}: OtelTotalTokensOptions): string {
  const [tokensLabel, setTokensLabel] = useState('-');

  useEffect(() => {
    if (!serviceName) {
      setTokensLabel('-');
      return;
    }

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
