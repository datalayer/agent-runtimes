/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every agent of the catalogue says what runs and hosts it: `datalayer`, a
 * Datalayer agent runtime, or `kagent`. The generator writes the spec's
 * `runtime_engine` as it is; a spec without one is refused before this.
 */

import { describe, expect, it } from 'vitest';
import { AGENTSPECS } from '../agents';
import { RUNTIME_ENGINES, RUNTIME_ENGINE_LABELS } from '../../types';

describe('runtimeEngine', () => {
  const specs = Object.values(AGENTSPECS);

  it('is stated by every agent, as one of the engines', () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(RUNTIME_ENGINES).toContain(spec.runtimeEngine);
    }
  });

  it('is kagent for the kagent example alone, on pydantic-ai', () => {
    const onKagent = specs.filter(spec => spec.runtimeEngine === 'kagent');
    expect(onKagent.map(spec => spec.id)).toEqual(['example-kagent']);
    expect(onKagent[0].harness).toBe('pydantic-ai');
  });

  it('has a label for each engine', () => {
    expect(RUNTIME_ENGINE_LABELS).toEqual({
      datalayer: 'Datalayer',
      kagent: 'kagent',
    });
  });
});
