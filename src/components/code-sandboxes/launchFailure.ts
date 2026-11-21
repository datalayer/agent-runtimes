/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a failed launch says of itself, for the launcher to show.
 *
 * The status the platform answered, when it answered, then the error's own
 * message: the platform's detail for a refusal, `Failed to fetch` for a
 * request that never got an answer. Empty when the error says nothing.
 */
export function launchFailureReason(error: unknown): string {
  if (error === null || error === undefined) {
    return '';
  }
  if (typeof error !== 'object') {
    return String(error);
  }
  const { message, response } = error as {
    message?: unknown;
    response?: { status?: unknown };
  };
  const status =
    typeof response?.status === 'number' ? String(response.status) : '';
  const said = typeof message === 'string' ? message.trim() : '';
  return [status, said].filter(Boolean).join(' ');
}
