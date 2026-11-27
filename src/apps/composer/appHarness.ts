/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application whose agent is a coding agent over ACP: the **harness** its agent runs on — Claude Code,
 * Codex, … — read from the catalogue agent it names (`agent:`), and what the
 * Studio says of it.
 *
 * - **Build** (the Properties of the agent): the register's terms — whether
 *   serving it to others is permitted and on which credential, its licence,
 *   its tiers —, the credential it takes, what it honours of an agent (a
 *   model, subagents, skills in its format), its MCP lent through the gateway.
 * - **Validate**: whether Datalayer serves it (a setup state: its model calls
 *   go through ai-inference, in credits, on no key of the person's), the
 *   register's terms **accepted once per organization** (IAM keeps the acceptance on the organization,
 *   `/organizations/{uid}/harness-terms`), and the Shield's report — the
 *   Conformance card.
 * - **Ship** is unchanged: hosted, always on, embedded as any
 *   application; the runtime launches the harness behind the Shield.
 *
 * Pure: no React, no network; the catalogue is read through the lookups
 * handed in, so a test reads it without the built catalogue.
 *
 * @module apps/composer/appHarness
 */

import type { HarnessSpec } from '../../types/agentspecs';

/** How the catalogue is read: an agent's harness by the agent's id, a harness by its id. */
export type HarnessLookups = {
  harnessOfAgent: (agentId: string) => string | undefined;
  harness: (harnessId: string) => HarnessSpec | undefined;
};

/** An agent reference without its version: `coding-agent-claude-code:0.0.1` is `coding-agent-claude-code`. */
const idOf = (ref: string): string => ref.split(':')[0];

/** The harness an application's agent runs on; none for an agent of the platform's own (pydantic-ai). */
export function harnessOf(
  agent: string | undefined,
  lookups: HarnessLookups,
): HarnessSpec | undefined {
  if (!agent) {
    return undefined;
  }
  const id = lookups.harnessOfAgent(idOf(agent));
  if (!id || id === 'pydantic-ai' || id === 'vercel-ai') {
    return undefined;
  }
  return lookups.harness(id);
}

/** Whether serving it to others is permitted, in a Maker's words. */
export const THIRD_PARTY_WORDS: Record<string, string> = {
  api_key_only:
    'On your own machine, on each person’s own API key; a subscription login is refused.',
  permitted: 'Served to others on any credential it takes.',
  refused: 'Its terms refuse serving it to others: it is never served.',
  organizations_own:
    'Your organization’s own: your organization answers for its terms.',
  unknown: 'Its terms are not known: it is not served.',
};

/** The harnesses whose model calls go through ai-inference, the only ones offered on Datalayer (agent-runtimes' `ROUTES`). */
const SERVED_ON_DATALAYER: ReadonlySet<string> = new Set([
  'claude-code',
  'codex',
  'opencode',
  'pi',
]);

/** Whether Datalayer's computers run this harness. */
export const servedOnDatalayer = (id: string): boolean =>
  SERVED_ON_DATALAYER.has(id);

/** The words of the harness's Properties and its Validate card. */
export const HARNESS_WORDS = {
  title: 'Coding agent',
  behindTheShield: (name: string) =>
    `${name} runs over ACP behind the Shield: what it does to its files, the commands it runs and the connections it reaches are decided by your rules, your organization’s rules and the Shield’s default, and every action is in its activity.`,
  onDatalayer:
    'On Datalayer it needs no key of yours: its model calls go through Datalayer and are paid in credits.',
  notOnDatalayer: (name: string) =>
    `${name} is not offered on Datalayer: it runs on your own machine, on your own key.`,
  credential: (secrets: readonly string[]) =>
    secrets.length
      ? `On your own machine it runs on ${secrets.join(' and ')}.`
      : 'It needs no secret of yours.',
  honours: (harness: HarnessSpec) =>
    [
      harness.honours.model
        ? 'takes the model you choose'
        : 'chooses its own model',
      harness.honours.subagents ? 'takes subagents' : 'has its own subagents',
      harness.skills.format === 'skill-md'
        ? `reads skills from ${harness.skills.dir}`
        : 'reads no skills',
    ].join(', '),
  mcp: (mode: string | undefined) =>
    mode === 'lend'
      ? 'Your connections are lent to it through Datalayer, each call decided and kept in its activity.'
      : mode === 'own'
        ? 'It brings connections of its own, which the Shield cannot see.'
        : 'It takes none of your connections.',
  version: (harness: HarnessSpec) =>
    `${harness.registered.adapter} ${harness.registered.version}`,
  termsRead: 'Terms read',
  licenceRead: 'Licence read',
  accepted: (who: string, when: string, version: string) =>
    `Its terms (version ${version}) were accepted for your organization by ${who} on ${when}.`,
  acceptedOther: (version: string, now: string) =>
    `Its terms were accepted for version ${version}; version ${now} is pinned now and is accepted again.`,
  notAccepted:
    'Its terms are not accepted for your organization yet: an owner accepts them once, for every application of the organization.',
  noOrganization:
    'Its terms are accepted once per organization; this application belongs to none, so you answer for them.',
  accept: 'Accept its terms for the organization',
  refused: 'Its terms refuse serving it to others: it cannot be shipped.',
  report:
    'The Shield’s report — the rules in force, its tests, the approvals and refusals, its limits — is the Conformance card below.',
  ship: 'Ship is unchanged: hosted, always on or embedded, it runs behind the Shield on its own computer.',
} as const;

/** The lines of the harness's Properties: what it is, its terms, its credential, what it honours. */
export function harnessTermsLines(harness: HarnessSpec): string[] {
  return [
    HARNESS_WORDS.behindTheShield(harness.name),
    THIRD_PARTY_WORDS[harness.terms.servedToThirdParties] ??
      THIRD_PARTY_WORDS.unknown,
    `Licence: ${harness.terms.licence}.`,
    ...(harness.terms.tierRestrictions
      ? [`Tiers: ${harness.terms.tierRestrictions}.`]
      : []),
    servedOnDatalayer(harness.id)
      ? HARNESS_WORDS.onDatalayer
      : HARNESS_WORDS.notOnDatalayer(harness.name),
    HARNESS_WORDS.credential(harness.requires.secrets),
    `It ${HARNESS_WORDS.honours(harness)}.`,
    HARNESS_WORDS.mcp(harness.acp?.mcp),
    `Pinned: ${HARNESS_WORDS.version(harness)}.`,
  ];
}

/** An organization's acceptance of a harness's terms, as IAM keeps it. */
export type TermsAccepted = {
  termsSource: string;
  servedToThirdParties: string;
  version: string;
  acceptedBy: string;
  acceptedAt: string;
};

/** IAM's answer (`terms`), by harness id. */
export function termsAcceptedOf(raw: unknown): Record<string, TermsAccepted> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const read: Record<string, TermsAccepted> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const v = value as Record<string, unknown>;
    read[id] = {
      termsSource: String(v.terms_source ?? ''),
      servedToThirdParties: String(v.served_to_third_parties ?? ''),
      version: String(v.version ?? ''),
      acceptedBy: String(v.accepted_by ?? ''),
      acceptedAt: String(v.accepted_at ?? ''),
    };
  }
  return read;
}

/** Where the terms stand for an application's harness: accepted for the version pinned, to accept, or not acceptable. */
export type TermsState =
  | { state: 'accepted'; said: string }
  | { state: 'to-accept'; said: string }
  | { state: 'refused'; said: string }
  | { state: 'no-organization'; said: string };

export function termsStateOf(
  harness: HarnessSpec,
  accepted: Record<string, TermsAccepted> | undefined,
  organizationUid: string | undefined,
): TermsState {
  const serving: string = harness.terms.servedToThirdParties;
  if (serving === 'refused' || serving === 'unknown') {
    return { state: 'refused', said: HARNESS_WORDS.refused };
  }
  if (!organizationUid) {
    return { state: 'no-organization', said: HARNESS_WORDS.noOrganization };
  }
  const kept = accepted?.[harness.id];
  if (!kept) {
    return { state: 'to-accept', said: HARNESS_WORDS.notAccepted };
  }
  if (
    kept.version !== harness.registered.version ||
    kept.termsSource !== harness.registered.termsSource
  ) {
    return {
      state: 'to-accept',
      said: HARNESS_WORDS.acceptedOther(
        kept.version,
        harness.registered.version,
      ),
    };
  }
  return {
    state: 'accepted',
    said: HARNESS_WORDS.accepted(
      kept.acceptedBy,
      kept.acceptedAt.slice(0, 10),
      kept.version,
    ),
  };
}

/** What an owner sends to accept a harness's terms: what the register says was read. */
export const acceptanceOf = (harness: HarnessSpec): Record<string, string> => ({
  terms_source: harness.registered.termsSource,
  served_to_third_parties: harness.terms.servedToThirdParties,
  version: harness.registered.version,
});

/** A secret's name without its version. */
