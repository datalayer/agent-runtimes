/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Generate a short random alphanumeric slug (e.g. "a3f7b2").
 * Used to make agent IDs unique per session so that each fresh
 * example run starts with clean OTEL / telemetry data.
 */
function randomSlug(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    slug += chars[array[i] % chars.length];
  }
  return slug;
}

/**
 * Build a unique agent ID by appending a random slug to a base name.
 *
 * @example
 *   uniqueAgentId('simple')           // → "simple-a3f7b2"
 *   uniqueAgentId('codemode-demo')    // → "codemode-demo-k9x2m1"
 */
export function uniqueAgentId(baseName: string): string {
  return `${baseName}-${randomSlug()}`;
}
