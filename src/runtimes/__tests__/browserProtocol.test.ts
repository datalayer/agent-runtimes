/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a chat is told to talk to an in-page agent.
 *
 * Two fields here are load-bearing and both have already been got wrong once,
 * so they are worth holding down rather than trusting to review.
 */

import { describe, expect, it } from 'vitest';

import { browserProtocolConfig } from '../browser/protocol';

const INFERENCE = { inferenceUrl: 'https://prod1.example', token: 'tok' };

describe('the in-page protocol config', () => {
  it('addresses nothing, and carries the agent instead', () => {
    const config = browserProtocolConfig({
      agentId: 'compactor',
      instructions: 'Be brief.',
      model: 'bedrock:us.anthropic.claude-sonnet-4-6',
      inference: INFERENCE,
    });

    expect(config.type).toBe('browser-vercel-ai');
    // There is no endpoint because there is no server. The live objects travel
    // in `options`, which is the seam the adapter factory leaves for exactly
    // this — a configuration that is not a URL.
    expect(config.endpoint).toBe('');
    expect(config.options).toMatchObject({
      instructions: 'Be brief.',
      model: 'bedrock:us.anthropic.claude-sonnet-4-6',
      inference: INFERENCE,
    });
  });

  it('turns the config query off, out loud', () => {
    /*
     * The regression this exists to prevent: models, tools and skills all come
     * from a runtime an in-page agent does not have, so the query never runs.
     * The composer waits on it before accepting a keystroke, and `undefined`
     * did not count as "will not run" — which showed up as a chat input that
     * looked and selected normally and silently ignored every key.
     */
    const config = browserProtocolConfig({
      agentId: 'compactor',
      inference: INFERENCE,
    });
    expect(config.enableConfigQuery).toBe(false);
  });

  it('passes the tools to the harness, for the harness to run', () => {
    const frontendTools = [
      {
        name: 'readAllCells',
        description: 'Read the notebook.',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      },
    ];
    const config = browserProtocolConfig({
      agentId: 'compactor',
      frontendTools,
      inference: INFERENCE,
    });

    expect(
      (config.options as { frontendTools?: unknown }).frontendTools,
    ).toBe(frontendTools);
  });
});
