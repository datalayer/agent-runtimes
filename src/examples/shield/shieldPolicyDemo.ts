/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

/**
 * What `ShieldPolicyExample` draws, as data (SHIELD §5.1, SH-53; SH-23).
 *
 * `@datalayer/agent-shield` is the Shield's TypeScript: the policy
 * document's types generated from the schema the Python package publishes,
 * the classes and the verdicts, ACP's tool kinds mapped to the classes, the
 * limits' words, and `describeDecision` — the one place a decision's words
 * are written. It is not on npm yet (npm's latest is an old scaffold), so
 * agent-runtimes does not depend on it: this page reads it from the sibling
 * checkout, `ai/agent-shield/src/policy.ts` beside `ai/agent-runtimes`, the
 * way the monorepo lays them out — through Vite's `import.meta.glob`, which
 * finds nothing (and the page says so) where the sibling is not there, as in
 * agent-runtimes' own CI. The shapes below name only what the page reads;
 * the types themselves are the package's.
 *
 * @module examples/shield/shieldPolicyDemo
 */

export type Verdict = 'allow' | 'ask' | 'deny';

/** A decision as the Shield returns it (the package's `Decision`). */
export type Decision = {
  verdict: Verdict;
  sentence: string;
  scope?: 'organization' | 'team' | 'session' | null;
  rule?: string | null;
  decided_by: 'rule' | 'limit' | 'network' | 'default';
};

/** The part of a policy document the page draws (the package's `Policy`). */
export type PolicyDocument = {
  scope: 'organization' | 'team' | 'session';
  rules?: Array<{
    name: string;
    decision: Verdict;
    classes?: string[];
    commands?: string[];
    where?: 'inside' | 'outside' | 'any';
    reason?: string;
  }>;
  limits?: Record<string, { soft: number; hard: number } | null | undefined>;
  harnesses?: {
    admit?: string[];
    credentials?: 'account' | 'platform' | 'either';
  };
};

/** What the page reads from `@datalayer/agent-shield`'s `policy.ts`. */
export type AgentShieldPolicyModule = {
  ACTION_CLASSES: readonly string[];
  TOOL_KINDS: readonly string[];
  KIND_CLASS: Record<string, string | null>;
  LIMIT_NAMES: readonly string[];
  LIMIT_WORDS: Record<string, string>;
  VERDICT_WORDS: Record<Verdict, string>;
  describeDecision: (decision: Decision) => string;
};

/** The sibling checkout's module, when it is there. */
const SIBLING = import.meta.glob<AgentShieldPolicyModule>(
  '../../../../agent-shield/src/policy.ts',
);

/** What the page says when the sibling checkout is not beside this one. */
export const AGENT_SHIELD_MISSING =
  'This page reads @datalayer/agent-shield from the sibling checkout ai/agent-shield, which is not beside this one: clone github.com/datalayer/agent-shield next to agent-runtimes (the package is not on npm yet).';

/** `@datalayer/agent-shield`'s policy module, or `null` without the sibling checkout. */
export async function loadAgentShield(): Promise<AgentShieldPolicyModule | null> {
  const load = Object.values(SIBLING)[0];
  return load ? load() : null;
}

/** An organization's document, in the package's shape: what an administrator writes. */
export const ORGANIZATION_POLICY: PolicyDocument = {
  scope: 'organization',
  rules: [
    {
      name: 'commands ask',
      decision: 'ask',
      classes: ['execute'],
      reason: 'a person sees every command first',
    },
    {
      name: 'nothing deleted outside',
      decision: 'deny',
      classes: ['delete'],
      where: 'outside',
    },
    {
      name: 'no pushes',
      decision: 'deny',
      commands: ['git push*'],
    },
  ],
  limits: {
    tool_calls: { soft: 200, hard: 400 },
    model_tokens: { soft: 200000, hard: 500000 },
    spend: { soft: 500, hard: 1000 },
  },
  harnesses: { admit: ['claude-code', 'codex'], credentials: 'account' },
};

/** One row per class: what the organization's document decides for it, in words. */
export function classRows(
  shield: AgentShieldPolicyModule,
  policy: PolicyDocument = ORGANIZATION_POLICY,
): Array<{ actionClass: string; says: string }> {
  return shield.ACTION_CLASSES.map(actionClass => {
    const rule = (policy.rules ?? []).find(item =>
      (item.classes ?? []).includes(actionClass),
    );
    return {
      actionClass,
      says: rule
        ? `${shield.VERDICT_WORDS[rule.decision]} — '${rule.name}'${rule.where && rule.where !== 'any' ? ` (${rule.where} the workspace)` : ''}`
        : 'nothing said: the next level decides',
    };
  });
}

/** ACP's tool kinds and the class each is decided as (§4.5). */
export function kindRows(
  shield: AgentShieldPolicyModule,
): Array<{ kind: string; actionClass: string }> {
  return shield.TOOL_KINDS.map(kind => ({
    kind,
    actionClass: shield.KIND_CLASS[kind] ?? 'nothing to decide',
  }));
}

/** The limits a document sets, soft then hard, in the sentences' words. */
export function limitRows(
  shield: AgentShieldPolicyModule,
  policy: PolicyDocument = ORGANIZATION_POLICY,
): Array<{ limit: string; soft: string; hard: string }> {
  return shield.LIMIT_NAMES.flatMap(name => {
    const threshold = policy.limits?.[name];
    return threshold
      ? [
          {
            limit: shield.LIMIT_WORDS[name],
            soft: String(threshold.soft),
            hard: String(threshold.hard),
          },
        ]
      : [];
  });
}

/** Decisions as the Shield returns them. */
export const DECISIONS: Decision[] = [
  {
    verdict: 'allow',
    sentence: 'Edit main.py: do it',
    scope: 'session',
    rule: 'edit and move inside the workspace',
    decided_by: 'rule',
  },
  {
    verdict: 'ask',
    sentence: 'Run `pytest`: ask me first',
    scope: 'organization',
    rule: 'commands ask',
    decided_by: 'rule',
  },
  {
    verdict: 'deny',
    sentence: 'a model request: refused',
    scope: 'organization',
    decided_by: 'limit',
  },
  {
    verdict: 'ask',
    sentence: 'Fetch https://example.com/: ask me first',
    decided_by: 'default',
  },
];

/** Each decision and its words through `describeDecision`. */
export function decisionRows(
  shield: AgentShieldPolicyModule,
): Array<{ sentence: string; words: string }> {
  return DECISIONS.map(decision => ({
    sentence: decision.sentence,
    words: shield.describeDecision(decision),
  }));
}
