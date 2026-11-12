/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a member's details say it runs on: read from its application's agent,
 * and in the page, whatever that agent names, the loop of the page.
 */

import { describe, expect, it } from 'vitest';
import {
  BROWSER_HARNESS,
  memberAppDetails,
  memberHarnessOf,
} from '../memberHarness';

describe('a member’s harness', () => {
  it('is its agent’s on a runtime, by its catalogue name', () => {
    expect(
      memberHarnessOf({ agent: 'example-harness-opencode:0.0.1' }, 'runtime'),
    ).toEqual({ id: 'opencode', name: 'OpenCode' });
  });

  it('is Pydantic AI for an agent that runs on ours', () => {
    expect(
      memberHarnessOf({ agent: 'worker-accountant:0.0.1' }, 'runtime'),
    ).toEqual({ id: 'pydantic-ai', name: 'Pydantic AI' });
  });

  it('is the page’s loop in the browser', () => {
    expect(
      memberHarnessOf({ agent: 'worker-accountant:0.0.1' }, 'browser'),
    ).toBe(BROWSER_HARNESS);
  });

  it('comes with the application’s words and its agent’s model', () => {
    const details = memberAppDetails(
      {
        agent: 'worker-accountant:0.0.1',
        description: 'Reads the books.',
        model: '',
      },
      'runtime',
    );
    expect(details.description).toBe('Reads the books.');
    expect(details.model).toContain('claude');
  });
});
