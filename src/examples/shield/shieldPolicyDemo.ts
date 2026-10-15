/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What `ShieldPolicyExample` draws, as data (SHIELD §5.1, SH-53; SH-23).
 *
 * `@datalayer/agent-shield` is the Shield's TypeScript: the policy
 * document's types generated from the schema the Python package publishes,
 * the classes and the verdicts, ACP's tool kinds mapped to the classes, the
 * limits' words, and `describeDecision` — the one place a decision's words
 * are written. It is not on npm yet (npm's latest is an old scaffold): this
 * imports it as the monorepo's workspace link to `ai/agent-shield`, built
 * by its own `tsc -b` (`lib/`), and agent-runtimes' `package.json` does not
 * declare it until it resolves from npm.
 *
 * @module examples/shield/shieldPolicyDemo
 */

import {
  ACTION_CLASSES,
  KIND_CLASS,
  LIMIT_NAMES,
  LIMIT_WORDS,
  TOOL_KINDS,
  VERDICT_WORDS,
  describeDecision,
  type ActionClass,
  type Decision,
  type Policy,
} from '@datalayer/agent-shield';

/** An organization's document, typed by the schema: what an administrator writes. */
export const ORGANIZATION_POLICY: Policy = {
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
export type ClassRow = { actionClass: ActionClass; says: string };

export function classRows(policy: Policy = ORGANIZATION_POLICY): ClassRow[] {
  return ACTION_CLASSES.map(actionClass => {
    const rule = (policy.rules ?? []).find(item =>
      (item.classes ?? []).includes(actionClass),
    );
    return {
      actionClass,
      says: rule
        ? `${VERDICT_WORDS[rule.decision]} — '${rule.name}'${rule.where && rule.where !== 'any' ? ` (${rule.where} the workspace)` : ''}`
        : 'nothing said: the next level decides',
    };
  });
}

/** ACP's tool kinds and the class each is decided as (§4.5); `null` is nothing to decide. */
export function kindRows(): Array<{ kind: string; actionClass: string }> {
  return TOOL_KINDS.map(kind => ({
    kind,
    actionClass: KIND_CLASS[kind] ?? 'nothing to decide',
  }));
}

/** The limits a document sets, soft then hard, in the sentences' words. */
export function limitRows(
  policy: Policy = ORGANIZATION_POLICY,
): Array<{ limit: string; soft: string; hard: string }> {
  return LIMIT_NAMES.flatMap(name => {
    const threshold = policy.limits?.[name];
    if (!threshold) {
      return [];
    }
    return [
      {
        limit: LIMIT_WORDS[name],
        soft: threshold.soft == null ? '—' : String(threshold.soft),
        hard: threshold.hard == null ? '—' : String(threshold.hard),
      },
    ];
  });
}

/** Decisions as the Shield returns them, and their words through `describeDecision`. */
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

export function decisionRows(): Array<{ sentence: string; words: string }> {
  return DECISIONS.map(decision => ({
    sentence: decision.sentence,
    words: describeDecision(decision),
  }));
}
