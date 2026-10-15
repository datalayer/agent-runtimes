/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A rule a person adds to a running session (SHIELD.md §6.3, SH-54): the
 * session API's `/apps/sessions/{uid}/rules`, read and written from the
 * Rules card beside the page, and the words it says.
 *
 * The rule is the Shield's own shape (`@datalayer/agent-shield`'s `Rule`): a
 * name, a decision — `allow`, `ask`, `deny` — and what it names: classes
 * (read, write, send, buy, delete, execute), a harness's kinds, where, paths,
 * commands. It may only tighten: one that would permit more than the
 * organization's rules is refused by the runtime in a sentence, shown as is.
 * The phone's panel speaks to the same three routes with the same shapes.
 *
 * @module apps/apps/sessionRules
 */

export const SESSION_RULE_DECISIONS = ['allow', 'ask', 'deny'] as const;
export type SessionRuleDecision = (typeof SESSION_RULE_DECISIONS)[number];

export const SESSION_RULE_CLASSES = [
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'execute',
] as const;
export type SessionRuleClass = (typeof SESSION_RULE_CLASSES)[number];

/** One rule of a session, as the runtime keeps it. */
export interface SessionRule {
  name: string;
  decision: SessionRuleDecision;
  classes?: string[];
  kinds?: string[];
  where?: 'inside' | 'outside' | 'any';
  paths?: string[];
  commands?: string[];
  reason?: string | null;
}

/** One policy document in force, as the runtime answers it. */
export interface PolicyInForce {
  scope: 'organization' | 'team' | 'session';
  version?: number;
  rules?: SessionRule[];
  limits?: Record<string, { soft: number; hard: number } | null>;
}

/** What decides a session now (`GET /apps/sessions/{uid}/rules`). */
export interface RulesInForce {
  uid: string;
  harness: string | null;
  managed?: boolean;
  policies: PolicyInForce[];
  session_rules: SessionRule[];
  /** The sentence when nothing can be decided (SHIELD decision 11), else null. */
  unavailable: string | null;
}

/** The words of the card's session section. */
export const SESSION_RULES_WORDS = {
  title: 'This session',
  none: 'No rule of your own on this session yet.',
  noSession: 'Start a conversation to add a rule to its session.',
  add: 'Add',
  remove: 'Remove',
  namePlaceholder: 'A name, quoted in every sentence it decides',
  decisions: {
    allow: 'do it',
    ask: 'ask me first',
    deny: 'leave it to me',
  } as Record<SessionRuleDecision, string>,
  classes: {
    read: 'reading',
    write: 'writing',
    send: 'sending',
    buy: 'buying',
    delete: 'deleting',
    execute: 'running a command',
  } as Record<SessionRuleClass, string>,
  scopes: {
    organization: 'your organization',
    team: 'this application',
    session: 'this session',
  } as Record<PolicyInForce['scope'], string>,
  goneWithSession:
    'In force at once, for this session only; gone when it ends.',
  unavailable: (sentence: string) =>
    `Nothing is decided right now: ${sentence}`,
} as const;

/** A rule in words: *writing, sending: leave it to me*. */
export function sessionRuleInWords(rule: SessionRule): string {
  const classes = (rule.classes ?? []).map(
    item => SESSION_RULES_WORDS.classes[item as SessionRuleClass] ?? item,
  );
  const covers = classes.length > 0 ? classes.join(', ') : 'everything';
  return `${covers}: ${SESSION_RULES_WORDS.decisions[rule.decision]}`;
}

/** What the person typed, as the rule the runtime takes; a sentence when it cannot be one. */
export function sessionRuleOf(input: {
  name: string;
  decision: string;
  classes: string[];
}): SessionRule | string {
  const name = input.name.trim();
  if (!name) {
    return 'A rule needs a name: it is quoted in every sentence it decides.';
  }
  if (!(SESSION_RULE_DECISIONS as readonly string[]).includes(input.decision)) {
    return `A rule says ${SESSION_RULE_DECISIONS.join(', ')}, not “${input.decision}”.`;
  }
  const classes = input.classes.filter(item =>
    (SESSION_RULE_CLASSES as readonly string[]).includes(item),
  );
  return {
    name,
    decision: input.decision as SessionRuleDecision,
    classes,
  };
}

/** Where the session API answers from, for one session. */
export const sessionRulesUrl = (
  agentServerUrl: string,
  sessionUid: string,
): string =>
  `${agentServerUrl}/api/v1/apps/sessions/${encodeURIComponent(sessionUid)}/rules`;

type Fetch = typeof fetch;

function parsed(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function answered(
  response: Response,
  what: string,
): Promise<RulesInForce> {
  const body = parsed(await response.text());
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `${what} (${response.status})`;
    throw new Error(detail);
  }
  return body as RulesInForce;
}

/** What decides the session now. */
export async function readSessionRules(
  agentServerUrl: string,
  token: string,
  sessionUid: string,
  fetcher: Fetch = fetch,
): Promise<RulesInForce> {
  const response = await fetcher(sessionRulesUrl(agentServerUrl, sessionUid), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return answered(response, 'The rules of the session could not be read');
}

/** Add or tighten a rule on the session; the runtime answers what is in force now. */
export async function addSessionRule(
  agentServerUrl: string,
  token: string,
  sessionUid: string,
  rule: SessionRule,
  fetcher: Fetch = fetch,
): Promise<RulesInForce> {
  const response = await fetcher(sessionRulesUrl(agentServerUrl, sessionUid), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rule),
  });
  return answered(response, 'The rule could not be added');
}

/** Take a session rule back. */
export async function removeSessionRule(
  agentServerUrl: string,
  token: string,
  sessionUid: string,
  name: string,
  fetcher: Fetch = fetch,
): Promise<RulesInForce> {
  const response = await fetcher(
    `${sessionRulesUrl(agentServerUrl, sessionUid)}/${encodeURIComponent(name)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  return answered(response, 'The rule could not be removed');
}
