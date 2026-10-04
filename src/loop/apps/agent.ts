/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent an application runs, as the page turns it (LOOP H-01, E-11).
 *
 * On a runtime, an application's agent is its agent's spec — an agent of the
 * catalogue, or a Cog's, which is an agent equipped with Frames, their
 * context already in its system prompt — and the application's own
 * instructions on top of it (`get_library_agent_spec` and the create route
 * in `agent_runtimes/routes/agents.py`). The page turns the same agent in the
 * browser, so it resolves it the same way: an application on a Cog that the
 * page looked up among the agentspecs alone ran with no instructions at all.
 *
 * @module loop/apps/agent
 */

import { getAgentspecs } from '../../specs/agents';
import { getCog } from '../../specs/cogs';
import type { Agentspec } from '../../types/agentspecs';

/** An agent of the catalogue, or a Cog's agent, by `id` or `id:version`. */
export function resolveAgentspec(reference: string): Agentspec | undefined {
  return getAgentspecs(reference) ?? getCog(reference)?.spec;
}

/**
 * What the agent is told: its spec's system prompt, then what the
 * application tells it on top — as the runtime joins them.
 */
export function agentInstructions(
  spec: Pick<Agentspec, 'systemPrompt'> | undefined,
  extra?: string,
): string | undefined {
  const parts = [spec?.systemPrompt?.trim(), extra?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Why an agent turned in the page cannot run, or undefined when it can.
 *
 * An agent named by a reference that resolves to nothing would answer with
 * no instructions — bare — which is not the agent that was asked for.
 */
export function inPageAgentRefusal(
  reference: string | undefined,
  spec: Agentspec | undefined,
): string | undefined {
  return reference && !spec
    ? `There is no agent or Cog named “${reference}” in this page, so it cannot answer here.`
    : undefined;
}
