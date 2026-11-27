/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every agent of the catalogue says what runs and hosts it: `datalayer`, a
 * Datalayer agent runtime, `kagent` (Kagent), or `agentcore` (AWS AgentCore). The generator writes the spec's
 * `runtime_engine` as it is; a spec without one is refused before this. The
 * engines themselves are specs of `agentspecs/runtime-engines`, generated into
 * `runtimeEngines.ts`: the ids, the labels and the harnesses are read there.
 */

import { describe, expect, it } from 'vitest';
import { AGENTSPECS } from '../agents';
import {
  DEFAULT_RUNTIME_ENGINE,
  RUNTIME_ENGINES,
  RUNTIME_ENGINE_CATALOGUE,
  RUNTIME_ENGINE_HARNESSES,
  RUNTIME_ENGINE_LABELS,
  getRuntimeEngine,
  isRuntimeEngine,
  listRuntimeEngines,
} from '../runtimeEngines';
import type { RuntimeEngine } from '../runtimeEngines';
import * as types from '../../types';
import * as agentspecsTypes from '../../types/agentspecs';
import type { RuntimeEngine as RuntimeEngineFromTypes } from '../../types';
import type { RuntimeEngine as RuntimeEngineFromAgentspecs } from '../../types/agentspecs';

describe('runtimeEngine', () => {
  const specs = Object.values(AGENTSPECS);

  it('is stated by every agent, as one of the engines', () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(RUNTIME_ENGINES).toContain(spec.runtimeEngine);
    }
  });

  it('is Kagent for the Kagent example alone, on pydantic-ai', () => {
    const onKagent = specs.filter(spec => spec.runtimeEngine === 'kagent');
    expect(onKagent.map(spec => spec.id)).toEqual(['kagent-assistant']);
    expect(onKagent[0].harness).toBe('pydantic-ai');
  });

  it('is agentcore for the AWS Steward alone, on pydantic-ai', () => {
    const onAgentCore = specs.filter(
      spec => spec.runtimeEngine === 'agentcore',
    );
    expect(onAgentCore.map(spec => spec.id)).toEqual(['worker-steward-aws']);
    expect(onAgentCore[0].harness).toBe('pydantic-ai');
  });

  it('has a label for each engine', () => {
    expect(RUNTIME_ENGINES).toEqual(['datalayer', 'kagent', 'agentcore']);
    expect(RUNTIME_ENGINE_LABELS).toEqual({
      datalayer: 'Datalayer',
      kagent: 'Kagent',
      agentcore: 'AWS AgentCore',
    });
  });

  it('is generated from the runtime engine specs, the default first', () => {
    expect(DEFAULT_RUNTIME_ENGINE).toBe('datalayer');
    expect(listRuntimeEngines().map(engine => engine.id)).toEqual([
      ...RUNTIME_ENGINES,
    ]);
    expect(listRuntimeEngines().map(engine => engine.position)).toEqual([
      1, 2, 3,
    ]);
    for (const engine of listRuntimeEngines()) {
      expect(engine.enabled).toBe(true);
      expect(engine.docsUrl).toMatch(/^https:\/\//);
      expect(engine.description).not.toContain('KAgent');
      expect(
        RUNTIME_ENGINE_LABELS[engine.id as keyof typeof RUNTIME_ENGINE_LABELS],
      ).toBe(engine.name);
    }
    expect(RUNTIME_ENGINE_CATALOGUE.datalayer.harnesses).toBeNull();
    expect(RUNTIME_ENGINE_CATALOGUE.kagent.docsUrl).toBe('https://kagent.dev');
  });

  it('knows an engine by its id, and no other', () => {
    expect(getRuntimeEngine('kagent')?.name).toBe('Kagent');
    expect(getRuntimeEngine('lambda')).toBeUndefined();
    expect(isRuntimeEngine('agentcore')).toBe(true);
    expect(isRuntimeEngine('KAgent')).toBe(false);
  });

  it('runs pydantic-ai only on kagent and AgentCore', () => {
    expect(RUNTIME_ENGINE_HARNESSES).toEqual({
      kagent: ['pydantic-ai'],
      agentcore: ['pydantic-ai'],
    });
  });
});

describe('the runtime engines at their published type paths', () => {
  // `lib/types` and `lib/types/agentspecs` exported them until 1.8.5 generated them.
  it.each([
    ['types', types as Record<string, unknown>],
    ['types/agentspecs', agentspecsTypes as Record<string, unknown>],
  ])('%s exports the catalogue’s own', (_path, module) => {
    expect(module.RUNTIME_ENGINES).toBe(RUNTIME_ENGINES);
    expect(module.RUNTIME_ENGINE_LABELS).toBe(RUNTIME_ENGINE_LABELS);
    expect(module.RUNTIME_ENGINE_HARNESSES).toBe(RUNTIME_ENGINE_HARNESSES);
  });

  it('exports the RuntimeEngine type there too', () => {
    const fromTypes: RuntimeEngineFromTypes = 'kagent';
    const fromAgentspecs: RuntimeEngineFromAgentspecs = 'agentcore';
    const engines: RuntimeEngine[] = [fromTypes, fromAgentspecs];
    expect(engines).toEqual(['kagent', 'agentcore']);
  });
});
