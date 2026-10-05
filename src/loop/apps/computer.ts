/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's computer (LOOP R-23, I-01): the sandbox its agent runs on,
 * as the computer view shows it — its three parts, each off until it is
 * turned on; what its agent ran on it, from the conversation's tool calls;
 * its files, read-only; and *Take over* and *Hand back*, through the
 * runtime's `/api/v1/apps/agents/{agent}/computer` routes.
 *
 * Pure but for `fetch`: no React.
 *
 * @module loop/apps/computer
 */

import type { AppSpec } from '../../types/agentspecs';
import type { ConversationEntry } from '../core';

/** The parts of a computer, in the order a person reads them. */
export const COMPUTER_PARTS = ['browse', 'files', 'shell'] as const;

export type ComputerPart = (typeof COMPUTER_PARTS)[number];

export type ComputerParts = Record<ComputerPart, boolean>;

/** The tools of each part, as the runtime gives them (`loop/apps/computer.py`). */
export const COMPUTER_PART_TOOLS: Record<ComputerPart, readonly string[]> = {
  // No sandbox Datalayer runs has a browser yet.
  browse: [],
  files: ['list_computer_files', 'read_computer_file', 'write_computer_file'],
  shell: ['execute_code', 'run_skill_script'],
};

/** What the computer view says. */
export const COMPUTER_WORDS = {
  title: 'Computer',
  part: {
    browse: 'Browse',
    files: 'Files',
    shell: 'Shell',
  } as Record<ComputerPart, string>,
  on: 'on',
  off: 'off',
  none: 'It has no computer: browse, files and shell are all off. Turn one on in its permissions to give it one.',
  offSaid: (parts: string[]) =>
    `Off, so its agent is given no tool for it: ${parts.join(', ')}.`,
  noBrowser:
    'Browser: no browser runs on its computer yet, so there is nothing to show.',
  agentHas: 'Its agent has the computer.',
  youHave:
    'You have the computer: its agent waits for it until you hand it back.',
  someoneHas: 'Somebody else has taken this computer over.',
  takeOver: 'Take over',
  handBack: 'Hand back',
  run: 'Run',
  yourCode: 'Python to run on its computer',
  terminal: 'What ran on it',
  nothingRan: 'Nothing has run on it yet in this conversation.',
  files: 'Files',
  notStarted: 'Its computer starts when its agent first uses it: no file yet.',
  emptyDirectory: 'Empty.',
  up: 'Up',
  download: 'Download',
  signedOut: 'Its computer is shown once you are signed in to Datalayer.',
} as const;

/** Each part of an application's computer, on or off, as its Appspec says. */
export function computerParts(app: AppSpec): ComputerParts {
  const computer = app.permissions?.computer;
  return {
    browse: Boolean(computer?.browse),
    files: Boolean(computer?.files),
    shell: Boolean(computer?.shell),
  };
}

/** Whether its agent uses a computer at all. */
export const hasComputer = (parts: ComputerParts): boolean =>
  COMPUTER_PARTS.some(part => parts[part]);

/** The parts turned off, in words. */
export const partsOff = (parts: ComputerParts): string[] =>
  COMPUTER_PARTS.filter(part => !parts[part]).map(part =>
    COMPUTER_WORDS.part[part].toLowerCase(),
  );

/** The part of the computer a tool uses, or undefined. */
export function partOf(toolName: string): ComputerPart | undefined {
  return COMPUTER_PARTS.find(part =>
    COMPUTER_PART_TOOLS[part].includes(toolName),
  );
}

/** One thing its agent did on its computer: the command, and what it said. */
export type TerminalEntry = {
  tool: string;
  part: ComputerPart;
  /** The code run, or the file's path. */
  command: string;
  /** What came back; undefined while it runs. */
  output?: string;
};

/** The most of an output the view shows. */
export const OUTPUT_LIMIT = 4000;

/**
 * What a tool of its computer returned, as a terminal shows it: the printed
 * output and the error of code run (Codemode answers with an object, or its
 * JSON), anything else as it came.
 */
export function outputOf(value: unknown): string {
  let found = value;
  if (typeof found === 'string') {
    try {
      const parsed: unknown = JSON.parse(found);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        found = parsed;
      }
    } catch {
      // Text, as it came.
    }
  }
  let text: string;
  if (found && typeof found === 'object' && !Array.isArray(found)) {
    const ran = found as Record<string, unknown>;
    const printed = [
      typeof ran.stdout === 'string' ? ran.stdout : ran.output,
      ran.stderr,
      ran.error ?? ran.execution_error ?? ran.code_error,
    ].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    );
    text =
      printed.length > 0
        ? printed.join('\n')
        : 'stdout' in ran || 'output' in ran
          ? ''
          : JSON.stringify(found, null, 2);
  } else {
    text =
      typeof found === 'string'
        ? found
        : found === null || found === undefined
          ? ''
          : JSON.stringify(found, null, 2);
  }
  return text.length > OUTPUT_LIMIT
    ? `${text.slice(0, OUTPUT_LIMIT)}\n… (${(text.length - OUTPUT_LIMIT).toLocaleString('en')} characters more)`
    : text;
}

function commandOf(args: Record<string, unknown>): string {
  for (const key of ['code', 'path', 'script_name']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  // A call read back from history may come without its arguments.
  return Object.keys(args).length ? JSON.stringify(args) : '';
}

/**
 * What its agent ran on its computer, in order: the conversation's calls to
 * the tools of its shell and of its files, each with what it returned —
 * streamed, as the conversation is.
 */
export function terminalEntries(
  conversation: readonly ConversationEntry[],
): TerminalEntry[] {
  const entries: TerminalEntry[] = [];
  for (const entry of conversation) {
    if (entry.role !== 'tool') {
      continue;
    }
    const part = partOf(entry.name);
    if (!part) {
      continue;
    }
    entries.push({
      tool: entry.name,
      part,
      command: commandOf(entry.args ?? {}),
      output: entry.result === undefined ? undefined : outputOf(entry.result),
    });
  }
  return entries;
}

/** Who has its computer, as the runtime says. */
export type ComputerHolder = { kind: string; uid: string; since: number };

/** Its computer, as the runtime describes it. */
export type ComputerState = {
  agent: string;
  app: string;
  parts: ComputerParts;
  browser: boolean;
  started: boolean;
  held: ComputerHolder | null;
  /** Whether the person asking is who has it. */
  yours: boolean;
};

/** One entry of a directory of its computer. */
export type ComputerFile = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: number;
};

/** What a person's code said on its computer. */
export type RunOutput = { stdout: string; stderr: string; error: string };

/** Where its computer is reached, and as whom. */
export type ComputerContext = {
  /** The agent-runtimes server its agent runs on. */
  serverUrl: string;
  /** Its agent, as the runtime names it. */
  agentId: string;
  /** The person's token; none on the machine itself. */
  token?: string;
};

/** The computer's routes, for an agent. */
export const computerUrl = (context: ComputerContext, tail = ''): string =>
  `${context.serverUrl.replace(/\/+$/, '')}/api/v1/apps/agents/${encodeURIComponent(context.agentId)}/computer${tail}`;

async function asked(
  context: ComputerContext,
  tail: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(computerUrl(context, tail), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(context.token ? { Authorization: `Bearer ${context.token}` } : {}),
    },
  });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = typeof body.detail === 'string' ? body.detail : detail;
    } catch {
      // A refusal without a sentence: its status says it.
    }
    throw new Error(detail);
  }
  return response;
}

/** Its parts, whether it started, who has it. */
export const readComputer = async (
  context: ComputerContext,
): Promise<ComputerState> =>
  (await asked(context, '')).json() as Promise<ComputerState>;

/** A directory of its working directory. */
export const listComputerFiles = async (
  context: ComputerContext,
  path = '.',
): Promise<ComputerFile[]> => {
  const response = await asked(
    context,
    `/files?path=${encodeURIComponent(path)}`,
  );
  const body = (await response.json()) as { entries: ComputerFile[] };
  return body.entries;
};

/** One of its files, to save. */
export const downloadComputerFile = async (
  context: ComputerContext,
  path: string,
): Promise<Blob> =>
  (await asked(context, `/file?path=${encodeURIComponent(path)}`)).blob();

/** Take it over: what runs is interrupted, its agent's calls wait. */
export const takeOverComputer = async (
  context: ComputerContext,
): Promise<{ held: ComputerHolder; interrupted: boolean }> =>
  (await asked(context, '/take-over', { method: 'POST' })).json();

/** Hand it back to its agent. */
export const handBackComputer = async (
  context: ComputerContext,
): Promise<void> => {
  await asked(context, '/hand-back', { method: 'POST' });
};

/** Run code on it, as the person who took it over. */
export const runOnComputer = async (
  context: ComputerContext,
  code: string,
): Promise<RunOutput> =>
  (
    await asked(context, '/run', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  ).json();

/** The directory above a path of its working directory. */
export function parentOf(path: string): string {
  const parts = path.split('/').filter(part => part && part !== '.');
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}
