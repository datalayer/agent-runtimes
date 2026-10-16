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
 * destructive, financial or publishing action are reviewed in Datalayer
 * (SLACK §15, 5). They render ai-agents' presentation v1, a different input
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

/** Action classes that are decided in Datalayer only (§15, 5). */
export const DATALAYER_ONLY = new Set<ApprovalPresentation['action_class']>([
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

const MAIL_TOOL =
  /(^|[_.-])(send|draft)[_.-]?(e?mail|message)($|[_.-])|^gmail[_.-]send|^mail[_.-]send$/i;
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
    presentation.action_class === 'send' &&
    MAIL_TOOL.test(presentation.tool_name),
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

const WRITE_TOOL =
  /(^|[_.-])(write|update|edit|append|create|save|set|rename|move)[_.-]?/i;
const WRITE_KEYS = [
  'path',
  'file',
  'filename',
  'name',
  'title',
  'content',
  'text',
  'new_path',
  'destination',
  'mode',
] as const;

/** A write: where, and the whole of what is written. */
const write: Renderer = {
  name: 'write',
  matches: presentation =>
    presentation.action_class === 'write' &&
    WRITE_TOOL.test(presentation.tool_name),
  render(presentation) {
    const args = presentation.arguments;
    const fields: RenderedField[] = [];
    for (const [key, label] of [
      ['path', 'Where'],
      ['file', 'Where'],
      ['filename', 'Where'],
      ['name', 'Name'],
      ['title', 'Title'],
      ['new_path', 'Moved to'],
      ['destination', 'Moved to'],
      ['mode', 'How'],
      ['content', 'What is written'],
      ['text', 'What is written'],
    ] as const)
      if (args[key] !== undefined)
        fields.push({ label, value: text(args[key]) });
    const extra =
      fields.length === 0
        ? ['The request does not say what it writes: review it in Datalayer.']
        : [];
    return rendered('write', presentation, fields, WRITE_KEYS, extra);
  },
};

/** Delete, publish, money and running code: shown, decided only in Datalayer (§15, 5). */
const datalayerOnly: Renderer = {
  name: 'datalayer-only',
  matches: presentation => DATALAYER_ONLY.has(presentation.action_class),
  render(presentation) {
    const words: Record<string, string> = {
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

/** A read: every argument, by its name, whole — nothing is changed or sent. */
const read: Renderer = {
  name: 'read',
  matches: presentation => presentation.action_class === 'read',
  render(presentation) {
    const fields = Object.entries(presentation.arguments).map(
      ([key, value]) => ({ label: key, value: text(value) }),
    );
    return rendered(
      'read',
      presentation,
      fields,
      Object.keys(presentation.arguments),
    );
  },
};

/** The renderers, the first that matches wins: Datalayer-only before any other. */
export const RENDERERS: readonly Renderer[] = [
  datalayerOnly,
  mail,
  write,
  read,
];

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
