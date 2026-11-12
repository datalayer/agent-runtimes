/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Policy Catalog.
 *
 * The Shield's policy documents the platform ships or shows (SH-50).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { PolicySpec } from '../types/agentspecs';

export const DEFAULT_POLICY_0_0_1: PolicySpec = {
  id: 'default',
  version: '0.0.1',
  name: 'The default policy',
  description:
    "The platform's default, the session document every Shield decides with under the organization's and the application's: read, search, edit and move inside the workspace are done; delete, run a command, reach outside the workspace, a command naming a credential, sudo, a package install from the network or git push are asked first with the command shown; a fetch goes through the allow-list, which is empty; send and buy are asked.",
  enabled: true,
  tags: ['policy', 'default'],
  policy: {
    scope: 'session',
    version: 1,
    rules: [
      {
        name: 'read inside the workspace',
        decision: 'allow',
        classes: ['read'],
        kinds: [],
        where: 'inside',
        paths: [],
        commands: [],
      },
      {
        name: 'edit and move inside the workspace',
        decision: 'allow',
        classes: ['write'],
        kinds: [],
        where: 'inside',
        paths: [],
        commands: [],
        reason: 'shown as diffs',
      },
      {
        name: 'delete',
        decision: 'ask',
        classes: ['delete'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [],
      },
      {
        name: 'a command naming a credential',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [
          '(?i)(api[_-]?key|secret|token|password|passwd|credential|\\.env\\b|id_(rsa|ed25519)|\\.ssh/|\\.aws/|\\.netrc|\\.datalayer/|datalayerrc)',
        ],
        reason: 'the command is shown',
      },
      {
        name: 'sudo',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: ['(?:^|[\\s;&|(])(?:sudo|doas|su)\\b'],
        reason: 'the command is shown',
      },
      {
        name: 'a package install from the network',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [
          '\\b(?:pip3?|pipx|uv|npm|pnpm|yarn|bun|apt(?:-get)?|brew|cargo|gem|conda|mamba|go)(?:\\s+pip)?\\s+(?:install|add|i|get)\\b',
        ],
        reason: 'the command is shown',
      },
      {
        name: 'git push',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: ['\\bgit\\b[^;&|]*\\bpush\\b'],
        reason: 'the command is shown',
      },
      {
        name: 'run a command',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [],
      },
      {
        name: 'outside the workspace',
        decision: 'ask',
        classes: [],
        kinds: [],
        where: 'outside',
        paths: [],
        commands: [],
      },
      {
        name: 'send or buy',
        decision: 'ask',
        classes: ['send', 'buy'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [],
      },
    ],
    limits: {
      tool_calls: {
        soft: 100,
        hard: 200,
      },
      terminals_open: {
        soft: 4,
        hard: 8,
      },
      bytes_written: {
        soft: 5242880,
        hard: 20971520,
      },
    },
    network: {
      fetch: [],
    },
    mcp: {
      allow: [],
    },
    harnesses: {
      admit: [],
      credentials: 'account',
    },
  },
};

export const DOGWOOD_APPROVAL_BEFORE_ACCOUNT_CHANGE_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-approval-before-account-change',
  version: '0.0.1',
  name: 'Approval before an AWS account change',
  description:
    'An example of a Dogwood set an administrator writes for Datalayer Steward for AWS: a change to the account (a fix applied with the change role) is permitted only when a person approved the same recommendation in the session within the hour before it; every other action is left to the rules. Deny by default: without the approval, the change is refused, by the Shield in the runtime and, when the change tool is reached through an AgentCore Gateway, by AgentCore Policy there.',
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example', 'aws'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'enforce',
      policies:
        '@id("everything but an account change")\npermit (principal, action, resource)\nunless { action == Datalayer::Action::"aws_account___apply_fix" };\n\n@id("an account change needs its recommendation approved within the hour")\npermit (principal, action == Datalayer::Action::"aws_account___apply_fix", resource)\nwhen temporal {\n    formerly within 1h Datalayer::Action::"aws_account___approve_recommendation"::response{\n        eventResource: resource,\n        input.recommendation: context.input.recommendation\n    }\n};\n',
    },
  },
};

export const DOGWOOD_APPROVAL_BEFORE_PAYMENT_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-approval-before-payment',
  version: '0.0.1',
  name: 'Approval before a payment',
  description:
    'An example of a Dogwood set an administrator writes for the organization: a payment is permitted only when an approval of the same invoice completed in the session within the hour before it; every other action is left to the rules. Deny by default: without the approval, the payment is refused.',
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'enforce',
      policies:
        '@id("everything but a payment")\npermit (principal, action, resource)\nunless { action == Datalayer::Action::"payments___pay" };\n\n@id("a payment needs its invoice approved within the hour")\npermit (principal, action == Datalayer::Action::"payments___pay", resource)\nwhen temporal {\n    formerly within 1h Datalayer::Action::"payments___approve"::response{\n        eventResource: resource,\n        input.invoice: context.input.invoice\n    }\n};\n',
    },
  },
};

export const DOGWOOD_DISTINCT_PAYEES_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-distinct-payees',
  version: '0.0.1',
  name: 'At most three payees a day',
  description:
    'An example of a Dogwood set for the organization: a transfer to a fourth distinct payee within 24 hours of the session is refused; paying the same payee again counts once. A distinct count: the domain names the payee, not the timepoint.',
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'enforce',
      policies:
        'permit (principal, action, resource);\n\n@id("at most three payees a day")\nforbid (principal, action == Datalayer::Action::"bank___transfer", resource)\nwhen temporal {\n    exists (n: Long).\n        (count for (p: String).\n            where (formerly within 24h Datalayer::Action::"bank___transfer"::request{ eventResource: resource, input.payee: p })) == n\n        && n > 3\n};\n',
    },
  },
};

export const DOGWOOD_RUNNING_TOTAL_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-running-total',
  version: '0.0.1',
  name: 'A running total of payments',
  description:
    'An example of a Dogwood set for the organization: payments are permitted until their total within 24 hours of the session, the one being decided included, would pass 5 000.00 (500 000 cents); the payment that would cross it is refused. Amounts are integers (cents): Dogwood sums and orders integers alone.',
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'enforce',
      policies:
        'permit (principal, action, resource);\n\n@id("payments total at most 500000 cents a day")\nforbid (principal, action == Datalayer::Action::"payments___pay", resource)\nwhen temporal {\n    exists (total: Long).\n        (sum amount for (amount: Long), (t: Timepoint).\n            where (formerly within 24h (Datalayer::Action::"payments___pay"::request{ eventResource: resource, input.amountCents: amount } && tp(t)))) == total\n        && total > 500000\n};\n',
    },
  },
};

export const DOGWOOD_SPEND_PER_SESSION_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-spend-per-session',
  version: '0.0.1',
  name: 'Spend per session, as Dogwood',
  description:
    "An example of a Dogwood set for the organization: the session's model requests are refused once the credits they asked for within 24 hours, the one being decided included, would pass 1 000 (10 USD); a model request is the Shield's action shield___model. The form `agent-shield policy export --dogwood` gives a document's spend limit, in log_only: decided and recorded, never refused.",
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'log_only',
      policies:
        'permit (principal, action, resource);\n\n@id("spend")\nforbid (principal, action == Datalayer::Action::"shield___model", resource)\nwhen temporal {\n    exists (total: Long).\n        (sum v for (v: Long), (t: Timepoint).\n            where (formerly within 24h (Datalayer::Action::"shield___model"::request{ eventResource: resource, input.credits: v } && tp(t)))) == total\n        && total > 1000\n};\n',
    },
  },
};

export const DOGWOOD_TRANSFERS_PER_HOUR_POLICY_0_0_1: PolicySpec = {
  id: 'dogwood-transfers-per-hour',
  version: '0.0.1',
  name: 'At most five transfers an hour',
  description:
    'An example of a Dogwood set for the organization: a sixth transfer within an hour of the session is refused, the transfer being decided counted; the others are left to the rules. The count is per session, so it shapes a cooperative agent (one stuck in a loop), not a caller who starts new sessions.',
  enabled: false,
  tags: ['policy', 'organization', 'dogwood', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    dogwood: {
      mode: 'enforce',
      policies:
        'permit (principal, action, resource);\n\n@id("at most five transfers an hour")\nforbid (principal, action == Datalayer::Action::"bank___transfer", resource)\nwhen temporal {\n    exists (n: Long).\n        (count for (t: Timepoint).\n            where (formerly within 1h (Datalayer::Action::"bank___transfer"::request{ eventResource: resource } && tp(t)))) == n\n        && n > 5\n};\n',
    },
  },
};

export const ORGANIZATION_BASELINE_POLICY_0_0_1: PolicySpec = {
  id: 'organization-baseline',
  version: '0.0.1',
  name: "An organization's baseline",
  description:
    "An example of the organization scope an administrator writes in IAM: running a command asks, nothing is deleted, nothing outside the workspace; the limits with a model budget of 200 000 then 400 000 tokens and a spend limit of 5 then 10 USD (500 then 1 000 credits); fetches to *.datalayer.io alone; Claude Code and Codex admitted, each on the account's own key; reading, writing, running a command, sending and buying need a permission beside the Rules.",
  enabled: true,
  tags: ['policy', 'organization', 'example'],
  policy: {
    scope: 'organization',
    version: 1,
    authorize: ['read', 'write', 'execute', 'send', 'buy'],
    rules: [
      {
        name: 'running a command asks',
        decision: 'ask',
        classes: ['execute'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [],
        reason:
          "the organization's rule: every command is shown to a person first",
      },
      {
        name: 'nothing is deleted',
        decision: 'deny',
        classes: ['delete'],
        kinds: [],
        where: 'any',
        paths: [],
        commands: [],
        reason: "the organization's rule",
      },
      {
        name: 'outside the workspace: leave it to me',
        decision: 'deny',
        classes: [],
        kinds: [],
        where: 'outside',
        paths: [],
        commands: [],
      },
    ],
    limits: {
      tool_calls: {
        soft: 100,
        hard: 200,
      },
      terminals_open: {
        soft: 2,
        hard: 4,
      },
      bytes_written: {
        soft: 5242880,
        hard: 20971520,
      },
      model_tokens: {
        soft: 200000,
        hard: 400000,
      },
      spend: {
        soft: 500,
        hard: 1000,
      },
    },
    network: {
      fetch: ['*.datalayer.io'],
    },
    mcp: {
      allow: [],
    },
    harnesses: {
      admit: ['claude-code', 'codex'],
      credentials: 'account',
    },
  },
};

export const POLICY_CATALOGUE: Record<string, PolicySpec> = {
  default: DEFAULT_POLICY_0_0_1,
  'dogwood-approval-before-account-change':
    DOGWOOD_APPROVAL_BEFORE_ACCOUNT_CHANGE_POLICY_0_0_1,
  'dogwood-approval-before-payment':
    DOGWOOD_APPROVAL_BEFORE_PAYMENT_POLICY_0_0_1,
  'dogwood-distinct-payees': DOGWOOD_DISTINCT_PAYEES_POLICY_0_0_1,
  'dogwood-running-total': DOGWOOD_RUNNING_TOTAL_POLICY_0_0_1,
  'dogwood-spend-per-session': DOGWOOD_SPEND_PER_SESSION_POLICY_0_0_1,
  'dogwood-transfers-per-hour': DOGWOOD_TRANSFERS_PER_HOUR_POLICY_0_0_1,
  'organization-baseline': ORGANIZATION_BASELINE_POLICY_0_0_1,
};

/** A policy by id. */
export function getPolicy(policyId: string): PolicySpec | undefined {
  return POLICY_CATALOGUE[policyId];
}

/** Every policy of the catalogue. */
export function listPolicySpecs(): PolicySpec[] {
  return Object.values(POLICY_CATALOGUE);
}
