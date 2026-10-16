/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ApprovalPresentation } from './contracts';

/**
 * Typed approval renderers (plans/SLACK.md §2 rule 6, S-302; plans/DISCORD.md
 * §3.6). A host offers Approve and Reject only when a renderer that knows the
 * tool proves that every material argument is shown: each argument the server
 * presented is named by the renderer, or the card fails closed. An unknown
 * tool, an argument the renderer does not know, an attachment, and every
 * action that is not mail (reads, writes, other sends, destructive, financial,
 * publishing, executing) are reviewed in Datalayer (SLACK §15, 5, decided by
 * the user on 16 October 2026: mail only). They render ai-agents' presentation v1, a different input
 * from `../approvals.ts` and `../approvalCard.ts`. Moved from the Slack
 * service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/approvalRenderers
 */

export type RenderedField = Readonly<{ label: string; value: string }>;

export type RenderedAction = Readonly<{
  /** The renderer that knew the tool. */
  renderer: string;
  /** The fields shown, in order, each whole. */
  fields: readonly RenderedField[];
  /** Whether every argument is shown and nothing needs Datalayer. */
  complete: boolean;
  /** Why not, in words, when it is not. */
  reasons: readonly string[];
}>;

type Renderer = Readonly<{
  name: string;
  matches(presentation: ApprovalPresentation): boolean;
  render(presentation: ApprovalPresentation): RenderedAction;
}>;

/**
 * Action classes that are decided in Datalayer only: every class but `send`,
 * since only mail is decided in a host (decided by the user on 16 October
 * 2026, SLACK §15, 5).
 */
export const DATALAYER_ONLY = new Set<ApprovalPresentation['action_class']>([
  'read',
  'write',
  'delete',
  'publish',
  'financial',
  'execute',
  'unknown',
]);

const text = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

const list = (value: unknown): string =>
  Array.isArray(value) ? value.map(text).join(', ') : text(value);

/** The arguments a renderer did not account for: each fails the card closed. */
function unknownKeys(
  presentation: ApprovalPresentation,
  known: readonly string[],
): string[] {
  return Object.keys(presentation.arguments).filter(
    key => !known.includes(key),
  );
}

function rendered(
  name: string,
  presentation: ApprovalPresentation,
  fields: RenderedField[],
  known: readonly string[],
  extra: string[] = [],
): RenderedAction {
  const unknown = unknownKeys(presentation, known);
  const reasons = [
    ...extra,
    ...(unknown.length
      ? [
          `@Datalayer does not know how to show ${unknown.join(', ')} of this action: review it in Datalayer.`,
        ]
      : []),
  ];
  return { complete: reasons.length === 0, fields, reasons, renderer: name };
}

/** The words of a tool's name that make a send mail: contracts.json `mail_words`. */
export const MAIL_WORDS: ReadonlySet<string> = new Set([
  'email',
  'gmail',
  'mail',
]);

/** A tool name's words, as ai-agents reads them (camelCase and separators split). */
const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const isMail = (toolName: string): boolean =>
  wordsOf(toolName).some(word => MAIL_WORDS.has(word));
const MAIL_KEYS = [
  'to',
  'cc',
  'bcc',
  'subject',
  'body',
  'html',
  'attachments',
  'reply_to',
] as const;

/** Mail: every recipient, the subject, the whole body; an attachment goes to Datalayer. */
const mail: Renderer = {
  name: 'mail',
  matches: presentation =>
    presentation.action_class === 'send' && isMail(presentation.tool_name),
  render(presentation) {
    const args = presentation.arguments;
    const fields: RenderedField[] = [];
    const missing: string[] = [];
    const extra: string[] = [];
    for (const [key, label] of [
      ['to', 'To'],
      ['cc', 'Cc'],
      ['bcc', 'Bcc'],
      ['reply_to', 'Reply to'],
      ['subject', 'Subject'],
    ] as const)
      if (args[key] !== undefined && args[key] !== null && args[key] !== '')
        fields.push({ label, value: list(args[key]) });
    if (args.to === undefined || args.to === '' || args.to === null)
      missing.push('its recipients');
    if (args.subject === undefined) missing.push('its subject');
    if (args.html !== undefined && args.html !== null && args.html !== '')
      extra.push(
        'It sends formatted mail, which a chat cannot show as it will be read: review it in Datalayer.',
      );
    if (args.body === undefined && args.html === undefined)
      missing.push('its body');
    else if (args.body !== undefined)
      fields.push({ label: 'Body', value: text(args.body) });
    const attachments = Array.isArray(args.attachments)
      ? args.attachments
      : args.attachments
        ? [args.attachments]
        : [];
    if (attachments.length > 0) {
      fields.push({ label: 'Attachments', value: list(attachments) });
      extra.push(
        'It sends attachments, which are reviewed in Datalayer, where you can open them.',
      );
    }
    if (missing.length)
      extra.push(
        `The request does not say ${missing.join(', ')}: review it in Datalayer.`,
      );
    return rendered('mail', presentation, fields, MAIL_KEYS, extra);
  },
};

/** Everything but mail: shown, decided only in Datalayer (§15, 5). */
const datalayerOnly: Renderer = {
  name: 'datalayer-only',
  matches: presentation => DATALAYER_ONLY.has(presentation.action_class),
  render(presentation) {
    const words: Record<string, string> = {
      read: 'Only mail is decided outside Datalayer: reading is decided in Datalayer.',
      write:
        'Only mail is decided outside Datalayer: writing is decided in Datalayer.',
      delete: 'Deleting is decided in Datalayer.',
      execute: 'Running code is decided in Datalayer.',
      financial: 'Moving money is decided in Datalayer.',
      publish: 'Publishing is decided in Datalayer.',
      unknown:
        '@Datalayer does not know this action: it is decided in Datalayer.',
    };
    return {
      complete: false,
      fields: presentation.fields.map(({ label, value }) => ({ label, value })),
      reasons: [
        words[presentation.action_class] ?? 'It is decided in Datalayer.',
      ],
      renderer: 'datalayer-only',
    };
  },
};

/** The renderers, the first that matches wins: Datalayer-only before any other. */
export const RENDERERS: readonly Renderer[] = [datalayerOnly, mail];

/**
 * How a host shows an approval, by the renderer that knows its tool; with
 * none, nothing is decided in the host.
 */
export function renderApproval(
  presentation: ApprovalPresentation,
): RenderedAction {
  const renderer = RENDERERS.find(one => one.matches(presentation));
  if (!renderer)
    return {
      complete: false,
      fields: presentation.fields.map(({ label, value }) => ({ label, value })),
      reasons: [
        `@Datalayer has no way yet to show ${presentation.tool_name} whole: review it in Datalayer.`,
      ],
      renderer: 'none',
    };
  return renderer.render(presentation);
}
