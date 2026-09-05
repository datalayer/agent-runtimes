/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The variant vocabulary.
 *
 * Two things are worth pinning down here. One is the legacy bridge: the old
 * target names are exported API that appear in applications this package does
 * not own, and they have to keep resolving to the runtime they always meant.
 * The other is that the two axes stay separable — code that asks `locationOf`
 * or `harnessOf` is what makes `cloud-ax` a cheap addition later, and a test
 * that only checked whole strings would not notice them fusing.
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_RUNTIME_VARIANTS,
  DEFAULT_AGENT_RUNTIME_VARIANT,
  defaultVariantForSpec,
  harnessOf,
  isAgentRuntimeVariant,
  legacyTargetOf,
  locationOf,
  needsRuntimeService,
  runsInBrowser,
  specHarnessOf,
  toAgentRuntimeVariant,
  variantForLocation,
  variantSupportsSpecHarness,
  variantsForSpec,
} from '../variants';

describe('variant shape', () => {
  it('splits every variant into a location and a harness', () => {
    for (const variant of AGENT_RUNTIME_VARIANTS) {
      expect(`${locationOf(variant)}-${harnessOf(variant)}`).toBe(variant);
    }
  });

  it('knows its own variants and nothing else', () => {
    expect(isAgentRuntimeVariant('cloud-pydanticai')).toBe(true);
    // A pairing of two real halves that no runtime actually provides.
    expect(isAgentRuntimeVariant('browser-pydanticai')).toBe(false);
    expect(isAgentRuntimeVariant(undefined)).toBe(false);
  });
});

describe('the legacy target names', () => {
  it('resolve to the runtimes they always meant', () => {
    expect(toAgentRuntimeVariant('backend-services')).toBe('cloud-pydanticai');
    expect(toAgentRuntimeVariant('local-agent-runtimes')).toBe(
      'local-pydanticai',
    );
  });

  it('leave a variant alone', () => {
    expect(toAgentRuntimeVariant('browser-vercelai')).toBe('browser-vercelai');
  });

  it('fall back for anything unrecognised, including nothing at all', () => {
    expect(toAgentRuntimeVariant(undefined)).toBe(
      DEFAULT_AGENT_RUNTIME_VARIANT,
    );
    expect(toAgentRuntimeVariant('nonsense' as never)).toBe(
      DEFAULT_AGENT_RUNTIME_VARIANT,
    );
    expect(toAgentRuntimeVariant(undefined, 'local-pydanticai')).toBe(
      'local-pydanticai',
    );
  });

  it('name a browser agent local, the truthful half of an answer it has no word for', () => {
    expect(legacyTargetOf('cloud-pydanticai')).toBe('backend-services');
    expect(legacyTargetOf('local-pydanticai')).toBe('local-agent-runtimes');
    expect(legacyTargetOf('browser-vercelai')).toBe('local-agent-runtimes');
  });
});

describe('what a location implies', () => {
  it('says only the browser runs the loop in the page', () => {
    expect(runsInBrowser('browser-vercelai')).toBe(true);
    expect(runsInBrowser('local-pydanticai')).toBe(false);
    expect(runsInBrowser('cloud-pydanticai')).toBe(false);
  });

  it('says a runtime service is needed everywhere else', () => {
    // The reason most lifecycle code can stay indifferent to which of the two
    // remote locations it is talking to.
    expect(needsRuntimeService('local-pydanticai')).toBe(true);
    expect(needsRuntimeService('cloud-pydanticai')).toBe(true);
    expect(needsRuntimeService('browser-vercelai')).toBe(false);
  });
});

describe('matching a spec to a variant', () => {
  it('reads a declared harness in the variant spelling', () => {
    expect(specHarnessOf({ harness: 'vercel-ai' })).toBe('vercelai');
    expect(specHarnessOf({ harness: 'pydantic-ai' })).toBe('pydanticai');
  });

  it('treats a spec that says nothing as the framework that always ran it', () => {
    // What lets every spec written before the field existed stay correct.
    expect(specHarnessOf({})).toBe('pydanticai');
    expect(variantSupportsSpecHarness('cloud-pydanticai', undefined)).toBe(
      true,
    );
  });

  it('lets the browser run a spec built for the server', () => {
    /*
     * `harness:` is a preference, not a demand, and where it disagrees with a
     * location the location wins: the browser cannot turn a pydantic-ai loop
     * whatever a spec asks for, so it turns a Vercel AI one instead.
     *
     * The alternative was a second spec per agent — identical but for that one
     * field — duplicating the prompt, tools and evals that have nothing to do
     * with where a loop runs. There was briefly such a spec; merging it away
     * is what this rule replaces.
     */
    expect(variantSupportsSpecHarness('browser-vercelai', 'pydantic-ai')).toBe(
      true,
    );
    expect(variantSupportsSpecHarness('browser-vercelai', undefined)).toBe(
      true,
    );
  });

  it('does not let a remote runtime run a spec built for the browser', () => {
    // Not symmetrical, deliberately: a browser spec assumes frontend tools and
    // no server, so running it on a runtime would be running something else.
    expect(variantSupportsSpecHarness('cloud-pydanticai', 'vercel-ai')).toBe(
      false,
    );
    expect(variantSupportsSpecHarness('local-pydanticai', 'vercel-ai')).toBe(
      false,
    );
  });

  it('offers the browser for anything, and a runtime only for its own', () => {
    expect(variantsForSpec({ harness: 'vercel-ai' })).toEqual([
      'browser-vercelai',
    ]);
    expect(variantsForSpec({ harness: 'pydantic-ai' })).toEqual([
      'browser-vercelai',
      'local-pydanticai',
      'cloud-pydanticai',
    ]);
  });

  it('gives each location its one variant', () => {
    // A location decides its own harness: only one framework can run there.
    expect(variantForLocation('browser')).toBe('browser-vercelai');
    expect(variantForLocation('local')).toBe('local-pydanticai');
    expect(variantForLocation('cloud')).toBe('cloud-pydanticai');
  });

  it('lands a spec on a variant that can run it without being told', () => {
    expect(defaultVariantForSpec({ harness: 'pydantic-ai' })).toBe(
      DEFAULT_AGENT_RUNTIME_VARIANT,
    );
    expect(defaultVariantForSpec({ harness: 'vercel-ai' })).toBe(
      'browser-vercelai',
    );
  });
});
