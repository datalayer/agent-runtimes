/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The protocol displays a run's tool results carry, read strictly for any
 * renderer: the page's half of a tool result
 * — `_meta["reactor.ui/display"]`, as the runtime's AG-UI stream sends it
 * beside the model's view — decoded into what a card draws.
 *
 * - **Sign in at a company** (`…pap.sign-in+json`, and a plain `pap_sign_in`
 *   or a business's `pact_sign_in` answer): Direct, Device or Mediated, its
 *   page (`https` only), its code, until when, what it needs.
 * - **An operation to approve** (`…pap.confirm+json`): the company's words
 *   verbatim, its terms and what the terms check found, the opaque revision
 *   and the one it replaced, what it does (a Rules class; `buy` when money
 *   moves — a purchase). Every operation is the person's: it is answered where
 *   approvals are, never here, and the approval it stands for is named
 *   (`approvalId`).
 * - **What a company answered** (`…pap.replies+json`): each reply with who
 *   wrote it there (its agent or one of its people), who answers now and
 *   where the conversation stands — participation.
 * - **A handoff** (`pap_handoff`'s answer): handed to the company's people,
 *   or why not.
 * - **A diff** (`…shield.diff+json`): what a coding agent
 *   changed in one file — its path, what it held, what it holds now, the
 *   file's language — drawn as a unified diff (`unifiedDiffLines`).
 * - **A terminal** (`…shield.terminal+json`): what it ran — the command, the
 *   output kept after release, the exit code.
 *
 * Anything else — an unknown type, a known one whose data does not read — is
 * `unknown`: its type, version and model-safe text, nothing drawn from its
 * data (diagnosable and safe). Typed decoding fails closed.
 *
 * @module portable/displays
 */

import {
  isPapSignInTool,
  readPapSignIn,
  type PapSignInWaiting,
} from './signIn';

export const PAP_SIGN_IN_TYPE = 'application/vnd.datalayer.pap.sign-in+json';
export const PAP_CONFIRM_TYPE = 'application/vnd.datalayer.pap.confirm+json';
export const PAP_REPLIES_TYPE = 'application/vnd.datalayer.pap.replies+json';
export const SHIELD_DIFF_TYPE = 'application/vnd.datalayer.shield.diff+json';
export const SHIELD_TERMINAL_TYPE =
  'application/vnd.datalayer.shield.terminal+json';

/** Where a tool result carries its display for the page. */
export const DISPLAY_META_KEY = 'reactor.ui/display';

/** What approving an operation does, as an application's Rules class it. */
export type ActionClass =
  'read' | 'write' | 'send' | 'buy' | 'delete' | 'publish';

export type ProtocolDisplay =
  | ({ kind: 'sign-in'; id: string } & PapSignInWaiting)
  | { kind: 'sign-in-refused'; id: string; why: string }
  | {
      kind: 'confirm';
      id: string;
      /** The approval it stands for: answered where approvals are. */
      approvalId: string;
      company: string;
      summary: string;
      terms: Record<string, unknown>;
      operationRef: string;
      /** Opaque, the company's: approved exactly as it is shown. */
      revision: string;
      does: ActionClass | null;
      signedIn: boolean | null;
      expiresAt: string;
      /** What the terms check found: terms the summary does not say. */
      differences: string[];
      was: { revision: string; terms: Record<string, unknown> } | null;
    }
  | {
      kind: 'replies';
      id: string;
      company: string;
      conversation: string;
      /** Each with who wrote it (`author`, PAP draft 0.3) and their name when the company gives one. */
      replies: {
        author: 'agent' | 'human';
        name: string | null;
        text: string;
      }[];
      status: 'working' | 'idle' | 'queued' | 'closed' | null;
      responder: 'agent' | 'human' | null;
    }
  | {
      kind: 'handoff';
      id: string;
      handed: boolean;
      responder: 'agent' | 'human' | null;
      note: string;
    }
  | {
      kind: 'diff';
      id: string;
      /** The file, as the agent named it, relative to its workspace. */
      path: string;
      /** What it held; `null` for a file that did not exist. */
      oldText: string | null;
      newText: string;
      /** A highlighter's language name, from the file's suffix (`text` when none). */
      language: string;
    }
  | {
      kind: 'terminal';
      id: string;
      terminalId: string;
      /** What it ran, when known. */
      command: string;
      /** The output, kept after the terminal was released. */
      output: string;
      /** `null` while it runs. */
      exitCode: number | null;
      released: boolean;
    }
  | {
      kind: 'unknown';
      id: string;
      type: string;
      version: number;
      text: string;
    };

type Raw = Record<string, unknown>;

const record = (value: unknown): Raw | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Raw)
    : null;
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const words = (value: unknown): string => text(value).trim();

const ACTIONS: readonly ActionClass[] = [
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'publish',
];
const STATUSES = ['working', 'idle', 'queued', 'closed'] as const;
const who = (value: unknown): 'agent' | 'human' | null =>
  value === 'agent' || value === 'human' ? value : null;

/** A display's wire (`{type, version, id, text, data}`) decoded, or `unknown` with its text. */
export function protocolDisplayOf(wire: unknown): ProtocolDisplay | null {
  const shown = record(wire);
  if (!shown || !text(shown.type)) {
    return null;
  }
  const id = text(shown.id);
  const data = record(shown.data) ?? {};
  const unknown: ProtocolDisplay = {
    kind: 'unknown',
    id,
    type: text(shown.type),
    version: typeof shown.version === 'number' ? shown.version : 0,
    text: text(shown.text),
  };
  switch (shown.type) {
    case PAP_SIGN_IN_TYPE: {
      const read = readPapSignIn({ status: 'waiting_for_the_person', ...data });
      if (!read) return unknown;
      return 'refused' in read
        ? { kind: 'sign-in-refused', id, why: read.refused }
        : { kind: 'sign-in', id, ...read };
    }
    case PAP_CONFIRM_TYPE: {
      const company = words(data.company);
      const summary = text(data.summary);
      const operationRef = words(data.operation_ref);
      const revision = words(data.revision);
      const terms = record(data.terms);
      const was = record(data.was);
      const wasRevision = was ? words(was.revision) : '';
      const expiresAt = words(data.expires_at);
      if (
        !company ||
        !summary.trim() ||
        !operationRef ||
        !revision ||
        !terms ||
        !expiresAt ||
        !Array.isArray(data.differences) ||
        !id.endsWith('-confirm')
      ) {
        return unknown;
      }
      if (was && (!wasRevision || wasRevision === revision)) {
        return unknown;
      }
      const does =
        data.does === null || data.does === undefined
          ? null
          : ACTIONS.find(a => a === data.does);
      if (does === undefined) return unknown;
      const session = record(data.session);
      return {
        kind: 'confirm',
        id,
        approvalId: id.slice(0, -'-confirm'.length),
        company,
        summary,
        terms,
        operationRef,
        revision,
        does,
        signedIn:
          session && typeof session.signed_in === 'boolean'
            ? session.signed_in
            : null,
        expiresAt,
        differences: data.differences.map(text),
        was: was
          ? { revision: wasRevision, terms: record(was.terms) ?? {} }
          : null,
      };
    }
    case PAP_REPLIES_TYPE: {
      const company = words(data.company);
      const conversation = text(data.conversation);
      const replies = Array.isArray(data.replies)
        ? data.replies.map(record).map(reply => ({
            author: who(reply?.author),
            name: words(reply?.name) || null,
            text: text(reply?.text),
          }))
        : [];
      if (
        !company ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(conversation) ||
        !replies.length ||
        replies.some(reply => !reply.author || !reply.text.trim())
      ) {
        return unknown;
      }
      return {
        kind: 'replies',
        id,
        company,
        conversation,
        replies: replies as {
          author: 'agent' | 'human';
          name: string | null;
          text: string;
        }[],
        status: STATUSES.find(s => s === data.status) ?? null,
        responder: who(data.responder),
      };
    }
    case SHIELD_DIFF_TYPE: {
      const path = words(data.path);
      if (
        !path ||
        typeof data.new_text !== 'string' ||
        !(
          data.old_text === null ||
          data.old_text === undefined ||
          typeof data.old_text === 'string'
        )
      ) {
        return unknown;
      }
      return {
        kind: 'diff',
        id,
        path,
        oldText: typeof data.old_text === 'string' ? data.old_text : null,
        newText: data.new_text,
        language: words(data.language) || languageOf(path),
      };
    }
    case SHIELD_TERMINAL_TYPE: {
      const terminalId = words(data.terminal_id);
      if (!terminalId) return unknown;
      const exitCode =
        typeof data.exit_code === 'number' && Number.isInteger(data.exit_code)
          ? data.exit_code
          : null;
      if (
        data.exit_code !== null &&
        data.exit_code !== undefined &&
        exitCode === null
      ) {
        return unknown;
      }
      return {
        kind: 'terminal',
        id,
        terminalId,
        command: text(data.command),
        output: text(data.output),
        exitCode,
        released: data.released === true,
      };
    }
    default:
      return unknown;
  }
}

/** `pap_handoff`, as the gateway names it with or without a prefix. */
export const PAP_HANDOFF_TOOL = /(^|[_.:\-/])pap_handoff$/;

/**
 * The protocol display of a tool's result, or `null` for one that has none:
 * its embedded display first; else a plain `pap_sign_in`/`pact_sign_in`
 * answer or a `pap_handoff` answer, read by the tool's name.
 */
export function displayOfToolResult(
  toolName: string,
  result: unknown,
  id = '',
): ProtocolDisplay | null {
  const answer = record(result);
  const embedded = record(answer?._meta)?.[DISPLAY_META_KEY];
  if (embedded !== undefined) {
    return protocolDisplayOf(embedded);
  }
  if (isPapSignInTool(toolName)) {
    const read = readPapSignIn(result);
    if (!read) return null;
    return 'refused' in read
      ? { kind: 'sign-in-refused', id, why: read.refused }
      : { kind: 'sign-in', id, ...read };
  }
  if (PAP_HANDOFF_TOOL.test(toolName) && answer) {
    const status = text(answer.status);
    if (!status) return null;
    return {
      kind: 'handoff',
      id,
      handed: status !== 'closed' && status !== 'direct_conversation_open',
      responder: who(answer.responder),
      note: text(answer.note),
    };
  }
  return null;
}

/** What each display says in one line, for a screen reader and a collapsed row. */
export function displayLine(display: ProtocolDisplay): string {
  switch (display.kind) {
    case 'sign-in':
      return display.mode === 'mediated'
        ? `Sign in through ${display.host}`
        : `Sign in at ${display.company || display.host}`;
    case 'sign-in-refused':
      return display.why;
    case 'confirm':
      return `${display.company} asks you to approve: ${display.summary} (revision ${display.revision})`;
    case 'replies':
      return `${display.company} answered${display.responder === 'human' ? ': one of its people is answering' : ''}`;
    case 'handoff':
      return display.handed
        ? `Handed to ${display.responder === 'human' ? 'one of the company’s people' : 'the company'}`
        : display.note || 'Nothing was handed over.';
    case 'diff': {
      const added = countLines(display.newText);
      if (display.oldText === null) {
        return `Wrote ${display.path} (${added} lines)`;
      }
      return `Changed ${display.path} (+${added} −${countLines(display.oldText)} lines)`;
    }
    case 'terminal': {
      const what = display.command
        ? `Ran \`${display.command}\``
        : `Terminal ${display.terminalId}`;
      return display.exitCode === null
        ? `${what}: running`
        : `${what}: exit ${display.exitCode}`;
    }
    case 'unknown':
      return display.text || `A display this app cannot draw (${display.type})`;
  }
}

/** Who wrote a reply, said apart from the person's words and the agent's summaries (PAP-7.8-01). */
export const replyAuthor = (
  company: string,
  author: 'agent' | 'human',
  name?: string | null,
): string =>
  `${
    author === 'human'
      ? `${company}, one of its people`
      : `${company}, its agent`
  }${name ? ` (${name})` : ''}`;

// -- a diff and a terminal ------------------------------------

const countLines = (value: string): number =>
  value === '' ? 0 : value.split('\n').length - (value.endsWith('\n') ? 1 : 0);

/** A file's language from its suffix, the same table the runtime uses. */
const LANGUAGES: Record<string, string> = {
  py: 'python',
  pyi: 'python',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  rb: 'ruby',
  ipynb: 'json',
  txt: 'text',
};

/** The language a file's suffix says, for highlighting; `text` when none. */
export function languageOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  if (name === 'Dockerfile' || name === 'Makefile') return name.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot > 0
    ? (LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? 'text')
    : 'text';
}

/** One line of a unified diff: kept, added or removed. */
export type DiffLine = { kind: 'context' | 'add' | 'remove'; text: string };

/** Over this many lines on a side, the diff is shown whole (all removed, all added), not computed. */
export const DIFF_LINES_LIMIT = 2000;

const lines = (value: string): string[] =>
  value === '' ? [] : value.replace(/\n$/, '').split('\n');

/**
 * The lines of a unified diff between what a file held and what it holds,
 * by a longest common subsequence of lines; a file over `DIFF_LINES_LIMIT`
 * lines on a side is shown removed and added whole.
 */
export function unifiedDiffLines(
  oldText: string | null,
  newText: string,
): DiffLine[] {
  const before = oldText === null ? [] : lines(oldText);
  const after = lines(newText);
  if (before.length > DIFF_LINES_LIMIT || after.length > DIFF_LINES_LIMIT) {
    return [
      ...before.map(text => ({ kind: 'remove' as const, text })),
      ...after.map(text => ({ kind: 'add' as const, text })),
    ];
  }
  // The LCS table, one row per line of `before`.
  const table: Uint32Array[] = [];
  for (let i = 0; i <= before.length; i++) {
    table.push(new Uint32Array(after.length + 1));
  }
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      out.push({ kind: 'context', text: before[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'remove', text: before[i] });
      i++;
    } else {
      out.push({ kind: 'add', text: after[j] });
      j++;
    }
  }
  while (i < before.length) out.push({ kind: 'remove', text: before[i++] });
  while (j < after.length) out.push({ kind: 'add', text: after[j++] });
  return out;
}

/** The unified diff as text (`--- a/path`, `+++ b/path`, one sign per line), as a terminal shows it. */
export function unifiedDiffText(
  display: Extract<ProtocolDisplay, { kind: 'diff' }>,
): string {
  const from = display.oldText === null ? '/dev/null' : `a/${display.path}`;
  const signs = { context: ' ', add: '+', remove: '-' } as const;
  return [
    `--- ${from}`,
    `+++ b/${display.path}`,
    ...unifiedDiffLines(display.oldText, display.newText).map(
      line => `${signs[line.kind]}${line.text}`,
    ),
  ].join('\n');
}
