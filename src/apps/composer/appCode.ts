/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application written in Python decides in its code, as
 * the Canvas shows it: locked, with where in the file it is decided.
 *
 * `loop apps build` writes an `app.py` as its Appspec and marks, at the top,
 * in comments, each moment its code reacts to — `# loop:code action save:
 * save (app.py:23)` — and `loop apps push` keeps that text as the
 * application's source, which the Studio keeps through every save.
 * Read here: what the code decides (a reply, a button's action, a schedule)
 * is the code's, and the Canvas does not change it; what the spec decides —
 * its name, starters, settings, rules, layout — stays editable.
 *
 * Pure.
 *
 * @module apps/composer/appCode
 */

/** One thing the code decides: a moment, the handler that decides it, and where. */
export type CodeMark = {
  /**
   * `start`, `message`, `settings`, `stop`, `resume`, `feedback`, `end`, `logout`,
   * `page` (a widget's page), `action <name>`, `schedule <name>`, `command <name>`, or what its code
   * adds where plain words are not enough: `tool <name>`,
   * `check <name>`, `test <name>`; and `agent <framework>`, an agent of its
   * own code.
   */
  moment: string;
  handler: string;
  file: string;
  /** The line the handler starts on, when the mark says it. */
  line: number | null;
};

/** An application built from a file, and what its code decides. */
export type AppCode = { file: string; marks: CodeMark[] };

const BUILT = /^# Built from (\S+) by `loop apps build`/;
const MARK = /^# loop:code ([^:]+): (\S+) \(([^)]*)\)\s*$/;

/** What an application's source says its code decides; null for one not built from a file. */
export function codeOf(source: string | undefined): AppCode | null {
  if (!source) {
    return null;
  }
  let file = '';
  const marks: CodeMark[] = [];
  for (const line of source.split('\n')) {
    const text = line.trim();
    if (text && !text.startsWith('#')) {
      // The marks are at the top, before the spec begins.
      break;
    }
    const built = BUILT.exec(text);
    if (built) {
      file = built[1];
      continue;
    }
    const mark = MARK.exec(text);
    if (mark) {
      const [where, at] = mark[3].split(':');
      marks.push({
        moment: mark[1].trim(),
        handler: mark[2],
        file: where,
        line: at && /^\d+$/.test(at) ? Number(at) : null,
      });
    }
  }
  return file || marks.length ? { file: file || marks[0].file, marks } : null;
}

/** Each moment the code can decide, in words. */
export function momentWords(moment: string): string {
  const [what, ...rest] = moment.split(' ');
  const name = rest.join(' ');
  switch (what) {
    case 'start':
      return 'When a session starts';
    case 'message':
      return 'Its reply to a message';
    // Files a person sends without being asked.
    case 'file':
      return 'What it does with files sent to it';
    case 'settings':
      return 'When the settings change';
    // A message from the page it sits in.
    case 'window':
      return 'Its reply to your page';
    // A widget's page written in its code.
    case 'page':
      return 'What its page shows for its inputs, again as they change';
    case 'stop':
      return 'When it is stopped';
    case 'resume':
      return 'When a session is resumed';
    // A person's thumb and comment on an answer, once kept.
    case 'feedback':
      return 'When someone says what they think of an answer';
    case 'end':
      return 'When a session ends';
    case 'logout':
      return 'When the person signs out';
    case 'action':
      return `What “${name}” does`;
    case 'schedule':
      return `Its scheduled work “${name}”`;
    case 'command':
      return `What /${name} does`;
    // Code where plain words are not enough.
    case 'tool':
      // A tool of its own, in a Maker's words: something it can do.
      return `Something it can do: “${name}”`;
    case 'check':
      return `Its check “${name}”`;
    case 'test':
      return `Its test “${name}”`;
    // An agent of its own code, and whether its rules see its tool calls.
    case 'agent':
      return agentWords(name);
    // What its builders decide of the Personal Agent Protocol.
    case 'pap':
      return papMomentWords(rest);
    default:
      return moment;
  }
}

/** What an agent of its code is, by the framework `loop apps build` names. */
const AGENTS: Record<string, { what: string; decided: boolean }> = {
  function: { what: 'a plain function', decided: false },
  langgraph: { what: 'a LangGraph graph', decided: true },
  langchain: { what: 'a LangChain runnable', decided: true },
  'llamaindex-agent': { what: 'a LlamaIndex agent', decided: true },
  'llamaindex-workflow': { what: 'a LlamaIndex workflow', decided: false },
};

/**
 * Its agent, in words, and honestly whether its rules decide what it calls:
 * Loop sees the tool calls of a LangChain, LangGraph or LlamaIndex agent, not
 * those of a plain function or a workflow.
 */
export function agentWords(framework: string): string {
  const agent = AGENTS[framework];
  if (!agent) {
    return `Its agent, written in its code (${framework})`;
  }
  return agent.decided
    ? `Its agent, ${agent.what}: its rules decide every tool it calls`
    : `Its agent, ${agent.what}: its rules see none of the tools it calls`;
}

/** `pap company <domain>`, `pap company-role`, `pap operation <action>`, in words. */
function papMomentWords([what, ...rest]: string[]): string {
  const name = rest.join(' ');
  switch (what) {
    case 'company':
      return `Works with ${name} as a personal agent`;
    case 'company-role':
      return 'Lets personal agents work with it';
    case 'operation':
      return `What personal agents may ask it to do: “${name}”`;
    default:
      return ['pap', what, ...rest].join(' ');
  }
}

/** Where a mark is decided, in words: `save, app.py line 23`. */
export const whereWords = (mark: CodeMark): string =>
  `${mark.handler}, ${mark.file}${mark.line !== null ? ` line ${mark.line}` : ''}`;

/** The mark that decides what an action does, if the code decides it. */
export const actionDecidedBy = (
  code: AppCode | null,
  action: string,
): CodeMark | undefined =>
  code?.marks.find(mark => mark.moment === `action ${action}`);

/** The mark that decides a company it works with, by domain, if its code decides it. */
export const papCompanyDecidedBy = (
  code: AppCode | null,
  domain: string,
): CodeMark | undefined =>
  code?.marks.find(mark => mark.moment === `pap company ${domain}`);

/** The mark that decides its company role, and with it the operations it declares. */
export const papRoleDecidedBy = (code: AppCode | null): CodeMark | undefined =>
  code?.marks.find(mark => mark.moment === 'pap company-role');

// --- the file itself ---------------------------------------------

/**
 * The `app.py` an application written in Python keeps in its item, beside
 * the Appspec it builds (decided 2026-10-06): saved by `loop apps push`,
 * versioned with the spec, written back by `loop apps pull`.
 */
export type AppCodeFile = { file: string; text: string };

/** The file an item keeps, read; null for none, or for what is not one. */
export function codeFileOf(raw: unknown): AppCodeFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const { file, text } = raw as Record<string, unknown>;
  return typeof file === 'string' &&
    file &&
    typeof text === 'string' &&
    text.trim()
    ? { file, text }
    : null;
}

/** A file's lines, numbered from 1. */
export const numberedLines = (
  code: AppCodeFile,
): Array<{ number: number; text: string }> =>
  code.text
    .replace(/\n$/, '')
    .split('\n')
    .map((text, index) => ({ number: index + 1, text }));

/** The line an address asks for, when the file has it. */
export function askedLine(
  code: AppCodeFile,
  asked: string | null | undefined,
): number | null {
  const line = Number(asked);
  return Number.isInteger(line) &&
    line >= 1 &&
    line <= numberedLines(code).length
    ? line
    : null;
}

/** How a person edits the file, in the commands that do it. */
export const codeCommands = (
  appUid: string,
  code: AppCodeFile,
): { pull: string; push: string } => ({
  pull: `loop apps pull ${appUid}`,
  push: `loop apps push ${code.file} --app ${appUid}`,
});
