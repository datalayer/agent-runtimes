/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's code, run in the page (STUDIO E-11).
 *
 * On a runtime, an application's agent runs its code in a sandbox of the
 * runtime's, through `execute_code` — what *Quote Calculator* and *Report
 * from a File* compute with. Turned in the page, the same agent has the
 * page's sandbox instead: Python in this browser (Pyodide), the one the
 * Browser target starts. Nothing of the code runs on Datalayer, and nothing
 * it writes leaves the browser.
 *
 * What it computes from is put there as files, under {@link SANDBOX_INPUTS}:
 * the documents Datalayer publishes with the application (`samples`, read
 * only) before its first run, and the files given on its page with the
 * message that runs on them — which the page used to refuse, having no
 * session to hand them to.
 *
 * Pure: no React, no kernel. The tool that runs it is
 * `AppBrowserSandboxPlugin`'s.
 *
 * @module apps/apps/browserSandbox
 */

import type { AppSpec } from '../../types/agentspecs';
import type { FrontendToolDefinition } from '../../types/tools';
import type { SandboxExecution } from '../plugins/agents/service';
import { resolveAgentspec } from './agent';

/** The tool the agent runs its code with: the name a runtime gives it too. */
export const BROWSER_CODE_TOOL = 'execute_code';

/** Where its files are, in the page's sandbox: in memory, gone with the page. */
export const SANDBOX_INPUTS = '/tmp/inputs';

/** A file for the sandbox: its name there, and what it holds, in base64. */
export type SandboxFile = { file: string; base64: string };

/**
 * Whether an application's agent runs code: its agent has a sandbox, as every
 * agent a runtime gives `execute_code` has.
 */
export function runsCodeInSandbox(app: Pick<AppSpec, 'agent'>): boolean {
  return Boolean(app.agent && resolveAgentspec(app.agent)?.sandboxVariant);
}

/** Where a file is, in the page's sandbox. */
export const sandboxPath = (file: string): string =>
  `${SANDBOX_INPUTS}/${file}`;

/**
 * A file's name as the sandbox is given it: its own, without a folder, and
 * only the characters a path says plainly.
 */
export function sandboxFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const plain = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '');
  return plain || 'file';
}

/** UTF-8 text as base64, as the sandbox is given it. */
export function textAsBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** The base64 of a `data:` URL, as a page's file is given — or why it has none. */
export function dataUrlBase64(dataUrl: string): string {
  const at = dataUrl.indexOf(',');
  if (
    !dataUrl.startsWith('data:') ||
    at < 0 ||
    !/;base64$/.test(dataUrl.slice(0, at))
  ) {
    throw new Error('A file given on the page is not a base64 data URL.');
  }
  return dataUrl.slice(at + 1);
}

/** The documents Datalayer publishes with the application, as files. */
export function sampleFiles(app: Pick<AppSpec, 'samples'>): SandboxFile[] {
  return (app.samples?.documents ?? []).map(document => ({
    file: document.file,
    base64: textAsBase64(document.text),
  }));
}

/** The Python that writes files into the sandbox. */
export function writeFilesCode(files: SandboxFile[]): string {
  const entries = files
    .map(
      ({ file, base64 }) =>
        `    (${JSON.stringify(file)}, ${JSON.stringify(base64)}),`,
    )
    .join('\n');
  return [
    'import base64 as _b64, pathlib as _pl',
    `_inputs = _pl.Path(${JSON.stringify(SANDBOX_INPUTS)})`,
    '_inputs.mkdir(parents=True, exist_ok=True)',
    'for _name, _data in [',
    entries,
    ']:',
    '    (_inputs / _name).write_bytes(_b64.b64decode(_data))',
    'del _b64, _pl, _inputs',
  ].join('\n');
}

/**
 * What the agent is told in the page, after its own prompt and the
 * application's instructions: where its code runs, and where its documents
 * are.
 */
export function browserSandboxNote(app: Pick<AppSpec, 'samples'>): string {
  const documents = app.samples?.documents ?? [];
  return [
    `Your code runs in Python (Pyodide) in this browser, through \`${BROWSER_CODE_TOOL}\`. ` +
      'Variables and imports persist between calls. Compute every figure there, ' +
      'print it, and answer from what it printed.',
    ...(documents.length > 0
      ? [
          'The documents you answer from are files there, read only: ' +
            documents
              .map(
                document =>
                  `${document.name} at \`${sandboxPath(document.file)}\``,
              )
              .join('; ') +
            '. Read them in code before you answer.',
        ]
      : []),
    `A file given on the page is put in \`${SANDBOX_INPUTS}\` too: the message that runs on it names it.`,
  ].join('\n\n');
}

/** What the message that runs on given files says of them. */
export function givenFilesSentence(files: string[]): string {
  return `The files given are in the sandbox: ${files.map(file => `\`${sandboxPath(file)}\``).join(', ')}.`;
}

/** What the model reads of an execution: what it printed, what it returned, what failed. */
export function executionForModel(
  execution: SandboxExecution,
): Record<string, unknown> {
  const results = (execution.outputs ?? []).flatMap(output => {
    const data =
      (output as { output_type?: string; data?: Record<string, unknown> }) ??
      {};
    if (
      data.output_type !== 'execute_result' &&
      data.output_type !== 'display_data'
    ) {
      return [];
    }
    const plain = data.data?.['text/plain'];
    return typeof plain === 'string' ? [plain] : [];
  });
  return {
    success: execution.success,
    ...(execution.stdout ? { stdout: execution.stdout } : {}),
    ...(results.length > 0 ? { results } : {}),
    ...(execution.error ? { error: execution.error } : {}),
  };
}

/**
 * The tool an application's agent runs its code with, in the page: Python
 * in the browser's sandbox, its documents written there before the first
 * call.
 */
export function browserCodeTool(
  app: Pick<AppSpec, 'samples'>,
  execute: (code: string) => Promise<SandboxExecution>,
): FrontendToolDefinition {
  let seeded: Promise<void> | null = null;
  const seed = (): Promise<void> => {
    const files = sampleFiles(app);
    seeded =
      seeded ??
      (files.length === 0
        ? Promise.resolve()
        : execute(writeFilesCode(files)).then(written => {
            if (!written.success) {
              seeded = null;
              throw new Error(
                `The application's documents could not be put in the sandbox: ${written.error ?? 'it failed'}.`,
              );
            }
          }));
    return seeded;
  };
  return {
    name: BROWSER_CODE_TOOL,
    description:
      'Run Python in the sandbox, in this browser (Pyodide). Variables and imports ' +
      `persist between calls. The application's documents and the files given on ` +
      `its page are under ${SANDBOX_INPUTS}. Returns what it printed, what it ` +
      'returned and any error.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The Python to run.' },
      },
      required: ['code'],
    },
    handler: async (args: Record<string, unknown>) => {
      const code = typeof args?.code === 'string' ? args.code : '';
      if (!code.trim()) {
        return { success: false, error: 'No code was given to run.' };
      }
      await seed();
      return executionForModel(await execute(code));
    },
  };
}
