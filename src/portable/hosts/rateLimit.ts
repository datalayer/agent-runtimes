/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The clock a host's rate limiter waits on: the system's, or a test's fake.
 * Each host keeps its own limiter (Slack's method spacing, Discord's
 * buckets), since what a 429 says differs by host. Moved from the Slack
 * service (DC-004).
 *
 * @module portable/hosts/rateLimit
 */

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
};
