/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Agent runtime variants: where an agent's loop runs, and what runs it.
 *
 * There have always been two ways to start an agent — a local agent-runtimes
 * server and a cloud one — and they were named after the service each talked
 * to (`local-agent-runtimes`, `backend-services`). That naming held while both
 * ran the same framework. A browser agent breaks it: it talks to no service at
 * all, and it runs a different framework.
 *
 * So a variant names the two things that actually vary, in that order:
 *
 *     <location>-<harness>        browser-vercelai
 *                                 local-pydanticai
 *                                 cloud-pydanticai
 *
 * The point of splitting them is that most code cares about exactly one half.
 * Anything about *reaching* a runtime — a URL, a lifecycle, a sandbox — is a
 * question of location. Anything about *turning the loop* — the SDK, the tool
 * protocol, the streaming format — is a question of harness. Code that branches
 * on the whole variant string has to be edited every time either axis gains a
 * value; code that asks {@link locationOf} or {@link harnessOf} does not.
 *
 * That is what makes the next ones cheap. `cloud-ax` is a new harness against
 * an existing location, so only harness-specific code changes; `browser-ax` is
 * a combination of two things that already exist.
 *
 * @module runtimes/variants
 */

import type { Agentspec } from '../types/agentspecs';

/** Where the agent's loop runs. */
export type AgentLocation = 'browser' | 'local' | 'cloud';

/**
 * What turns the loop.
 *
 * Spelled without the hyphen the frameworks use in their own names, because
 * the hyphen is already doing a job here: it separates location from harness.
 * {@link SPEC_HARNESS_BY_HARNESS} maps back to the spelling an agentspec uses.
 */
export type AgentHarness = 'pydanticai' | 'vercelai';

/**
 * The combinations that exist today.
 *
 * Enumerated rather than derived from the two axes, because not every pairing
 * is real: there is no `browser-pydanticai`, and a type that admitted one would
 * be describing a runtime nobody can start.
 */
export const AGENT_RUNTIME_VARIANTS = [
  'browser-vercelai',
  'local-pydanticai',
  'cloud-pydanticai',
] as const;

export type AgentRuntimeVariant = (typeof AGENT_RUNTIME_VARIANTS)[number];

/** The variant used when a caller does not choose one. */
export const DEFAULT_AGENT_RUNTIME_VARIANT: AgentRuntimeVariant =
  'cloud-pydanticai';

/**
 * The harness as an agentspec spells it.
 *
 * A spec says `harness: pydantic-ai`; a variant says `pydanticai`. Same thing,
 * two spellings forced by the separator, and this is the one place that knows
 * it — rather than every caller doing its own `replace('-', '')`.
 */
export const SPEC_HARNESS_BY_HARNESS: Record<AgentHarness, string> = {
  pydanticai: 'pydantic-ai',
  vercelai: 'vercel-ai',
};

/** The reverse, for reading an agentspec's declared harness. */
export const HARNESS_BY_SPEC_HARNESS: Record<string, AgentHarness> = {
  'pydantic-ai': 'pydanticai',
  'vercel-ai': 'vercelai',
};

/**
 * The names the two original ways to start an agent went by.
 *
 * Kept working rather than removed: they are exported API and appear in
 * applications this package does not own. New code should pass a variant.
 *
 * @deprecated Use {@link AgentRuntimeVariant}.
 */
export type RuntimeCreationTarget = 'backend-services' | 'local-agent-runtimes';

const VARIANT_BY_LEGACY_TARGET: Record<
  RuntimeCreationTarget,
  AgentRuntimeVariant
> = {
  'backend-services': 'cloud-pydanticai',
  'local-agent-runtimes': 'local-pydanticai',
};

/** Whether a string is a variant this package knows how to start. */
export function isAgentRuntimeVariant(
  value: unknown,
): value is AgentRuntimeVariant {
  return (
    typeof value === 'string' &&
    (AGENT_RUNTIME_VARIANTS as readonly string[]).includes(value)
  );
}

/**
 * The variant a caller meant, from a variant or one of the legacy target names.
 *
 * One funnel, so the rest of the package sees variants only and no branch has
 * to remember that two vocabularies exist.
 */
export function toAgentRuntimeVariant(
  value: AgentRuntimeVariant | RuntimeCreationTarget | undefined | null,
  fallback: AgentRuntimeVariant = DEFAULT_AGENT_RUNTIME_VARIANT,
): AgentRuntimeVariant {
  if (!value) {
    return fallback;
  }
  if (isAgentRuntimeVariant(value)) {
    return value;
  }
  return VARIANT_BY_LEGACY_TARGET[value as RuntimeCreationTarget] ?? fallback;
}

/** Where this variant's loop runs. */
export function locationOf(variant: AgentRuntimeVariant): AgentLocation {
  return variant.slice(0, variant.indexOf('-')) as AgentLocation;
}

/** What turns this variant's loop. */
export function harnessOf(variant: AgentRuntimeVariant): AgentHarness {
  return variant.slice(variant.indexOf('-') + 1) as AgentHarness;
}

/**
 * Whether the loop runs in the page.
 *
 * The question worth asking wherever a runtime would otherwise be reached for,
 * because it is the one that changes what exists: a browser agent has no
 * service behind it, so no runtime to create, no sandbox to execute in, no MCP
 * servers to call, and no lifecycle to pause or resume.
 */
export function runsInBrowser(variant: AgentRuntimeVariant): boolean {
  return locationOf(variant) === 'browser';
}

/**
 * Whether a runtime has to be created and reached over HTTP.
 *
 * True for every location except the browser, and the reason most of the
 * lifecycle code can stay indifferent to which of the two remote locations it
 * is talking to.
 */
export function needsRuntimeService(variant: AgentRuntimeVariant): boolean {
  return !runsInBrowser(variant);
}

/**
 * Whether a variant can run an agent that declared this harness in its spec.
 *
 * An agentspec says which framework it needs (`harness: vercel-ai`); a variant
 * says which framework a runtime provides. A host picks a variant, and this is
 * how it checks the two agree before starting something that cannot work.
 */
export function variantSupportsSpecHarness(
  variant: AgentRuntimeVariant,
  specHarness: string | undefined | null,
): boolean {
  if (!specHarness) {
    // A spec that says nothing wants the framework that has always run it.
    return harnessOf(variant) === 'pydanticai';
  }
  return SPEC_HARNESS_BY_HARNESS[harnessOf(variant)] === specHarness;
}

/**
 * The variants that could run an agent with this declared harness.
 *
 * What a host offers a person choosing where to run something: an agent built
 * for the browser harness should not be offered a cloud runtime that cannot
 * turn its loop.
 */
export function variantsForSpecHarness(
  specHarness: string | undefined | null,
): AgentRuntimeVariant[] {
  return AGENT_RUNTIME_VARIANTS.filter(variant =>
    variantSupportsSpecHarness(variant, specHarness),
  );
}

/**
 * The legacy target name closest to a variant.
 *
 * For consumers still reading `runtimeCreationTarget`: a browser agent has no
 * old name — there was no way to start one — so it reports as local, which is
 * the truthful half of the answer (nothing remote is being reached).
 *
 * @deprecated Read the variant.
 */
export function legacyTargetOf(
  variant: AgentRuntimeVariant,
): RuntimeCreationTarget {
  return locationOf(variant) === 'cloud'
    ? 'backend-services'
    : 'local-agent-runtimes';
}

/**
 * The harness a spec asks for, in the variant spelling.
 *
 * Defaulted rather than optional: every agent is run by something, and a spec
 * that says nothing is run by the framework that has always run it. That
 * default is what lets every spec written before this field stay correct.
 */
export function specHarnessOf(spec: Pick<Agentspec, 'harness'>): AgentHarness {
  return HARNESS_BY_SPEC_HARNESS[spec.harness ?? ''] ?? 'pydanticai';
}

/**
 * The variants that could run this agent.
 *
 * What a host offers when someone picks where to run something: an agent built
 * for the browser harness should not be offered a cloud runtime that cannot
 * turn its loop, and a server-side agent should not be offered the page.
 */
export function variantsForSpec(
  spec: Pick<Agentspec, 'harness'>,
): AgentRuntimeVariant[] {
  return variantsForSpecHarness(spec.harness);
}

/**
 * The variant to start this agent with when the host has no preference.
 *
 * The package default when the spec can run there, and otherwise the first
 * variant that can run it at all — so a `harness: vercel-ai` agent lands in
 * the browser without every caller having to know that is where it belongs.
 */
export function defaultVariantForSpec(
  spec: Pick<Agentspec, 'harness'>,
): AgentRuntimeVariant {
  if (variantSupportsSpecHarness(DEFAULT_AGENT_RUNTIME_VARIANT, spec.harness)) {
    return DEFAULT_AGENT_RUNTIME_VARIANT;
  }
  return variantsForSpec(spec)[0] ?? DEFAULT_AGENT_RUNTIME_VARIANT;
}
