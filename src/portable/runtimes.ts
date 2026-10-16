/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's agent runtimes as the runtimes service lists them
 * (`GET /api/runtimes/v1/runtimes`), and an agent's summary and status as
 * every client says them — the web's `AgentSummary` badge and Datalayer
 * Mobile's Agents (M-014b). A raw runtime carries no application
 * capabilities: no Rules, Protocols or Activity are read from it.
 *
 * @module portable/runtimes
 */

/** One agent runtime, as a client lists it. */
export type AgentRuntime = {
  uid: string;
  runtimeName: string;
  givenName: string;
  environment: string;
  /** The agentspec it runs, when the runtime says. */
  agentSpecId: string;
  type: string;
  state: string;
  startedAt: string;
  expiredAt: string;
  /** Its Jupyter address, from which its agents' is read (`agentRuntimesUrlOf`). */
  ingress: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** A runtime of the runtimes service's answer. */
export function runtimeOf(raw: Record<string, unknown>): AgentRuntime {
  const environment = isRecord(raw.environment) ? raw.environment : {};
  return {
    uid: text(raw.uid),
    runtimeName: text(raw.runtime_name) || text(raw.pod_name),
    givenName: text(raw.given_name),
    environment:
      text(environment.title) ||
      text(environment.name) ||
      text(raw.environment_title) ||
      text(raw.environment_name),
    agentSpecId: text(raw.agent_spec_id) || text(raw.attached_agent_spec_id_s),
    type: text(raw.type),
    state: text(raw.state) || text(raw.status) || 'running',
    startedAt: text(raw.started_at),
    expiredAt: text(raw.expired_at),
    ingress: text(raw.ingress),
  };
}

/** The runtimes service's list, agent runtimes only: notebooks and terminals belong to the web workspace. */
export function agentRuntimesOf(body: Record<string, unknown>): AgentRuntime[] {
  const listed = Array.isArray(body.runtimes) ? body.runtimes : [];
  return listed
    .filter(isRecord)
    .map(runtimeOf)
    .filter(runtime => runtime.runtimeName && isAgentRuntime(runtime));
}

/** An agent runtime, not a notebook's or a terminal's. */
export const isAgentRuntime = (runtime: AgentRuntime): boolean =>
  runtime.type === 'agent' ||
  Boolean(runtime.agentSpecId) ||
  /agent/i.test(runtime.environment);

/** What a summary of an agent says of it. */
export interface AgentSummaryData {
  agentName: string;
  location: string;
  specId?: string;
  /**
   * The framework turning this agent's loop, as its spec declares it —
   * `pydantic-ai` server-side, `vercel-ai` in the page.
   */
  harness?: string;
  /**
   * The runtime variant the host chose: `<location>-<harness>`.
   *
   * Shown next to the harness rather than instead of it, because they answer
   * different questions and can disagree: the harness is what the spec asked
   * for, the variant is what it actually got.
   */
  variant?: string;
  status?: string;
  baseUrl?: string;
  sandboxBaseUrl?: string;
  agentId?: string;
  isReady?: boolean;
  error?: string;
}

/**
 * Statuses that represent an agent actively being created/started. The spinner
 * only shows for these; app-navigation states ("selected", "switching") and
 * settled states ("ready", "running", ...) never spin.
 */
export const CREATING_STATUSES: ReadonlySet<string> = new Set([
  'creating',
  'starting',
  'launching',
  'connecting',
  'pending',
  'resuming',
]);

/**
 * An agent genuinely being created: it is not ready, has no id yet, and its
 * status is one of creation or startup.
 */
export function isCreatingAgent(summary: AgentSummaryData): boolean {
  return (
    !summary.isReady &&
    !summary.agentId &&
    CREATING_STATUSES.has((summary.status || '').toLowerCase())
  );
}

/** The summary of an agent the runtimes service lists: named as given, at Datalayer. */
export function agentSummaryOfRuntime(runtime: AgentRuntime): AgentSummaryData {
  return {
    agentName: runtime.givenName || runtime.runtimeName,
    location: 'datalayer',
    specId: runtime.agentSpecId || undefined,
    status: runtime.state,
    isReady: !CREATING_STATUSES.has(runtime.state.toLowerCase()),
  };
}
