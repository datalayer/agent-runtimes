/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agentspec's own subagents, as agents the in-page loop can hand work to.
 *
 * A spec such as `example-subagents` declares a researcher and a writer under
 * `subagents`; on a server the pydantic-ai harness turns those into delegation
 * tools. In the page the loop turns with the Vercel AI SDK, and until now it
 * read subagents from a *team* only — so the same spec, run in the browser,
 * had nobody to delegate to and the example that exists to show delegation
 * showed none. This is the spec's list in the shape the browser runtime wants,
 * with a general-purpose helper when the spec asks for one.
 *
 * @module loop/plugins/agents/specSubagents
 */

import type { BrowserSubagent } from '../../../runtimes/browser';
import { getAgentspecs } from '../../../specs/agents';
import type { Agentspec } from '../../../types';

const GENERAL_PURPOSE: BrowserSubagent = {
  name: 'general-purpose',
  description:
    'A capable generalist for a task none of the specialists covers: research, ' +
    'reasoning, drafting, checking.',
  instructions:
    'You are a capable general-purpose assistant. Carry out the task you are ' +
    'given completely and report the result plainly, saying what you could not do.',
};

/** The subagents an agentspec declares, or none. */
export function specSubagents(spec: Agentspec | undefined): BrowserSubagent[] {
  const config = spec?.subagents;
  if (!config) {
    return [];
  }
  const own = (config.subagents ?? []).map((entry): BrowserSubagent => {
    // A `ref` names an agentspec the subagent *is*: its prompt, model and
    // icon come from there, and the entry's own words win where it has any.
    const referenced = entry.ref ? getAgentspecs(entry.ref) : undefined;
    return {
      name: entry.name,
      description: entry.description || referenced?.description || entry.name,
      instructions: entry.instructions ?? referenced?.systemPrompt,
      model: entry.model ?? referenced?.model ?? config.defaultModel,
      icon: referenced?.icon,
    };
  });
  return config.includeGeneralPurpose ? [...own, GENERAL_PURPOSE] : own;
}

export default specSubagents;
