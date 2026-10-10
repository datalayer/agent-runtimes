/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's code, run in the page (STUDIO E-11): the agent of an
 * application that computes in code is handed `execute_code` on the
 * browser's sandbox, its documents put there before its first run, and told
 * where they are.
 */

import { describe, expect, it, vi } from 'vitest';
import { LoopAgentBlueprint } from '../core';
import { APP_CATALOGUE } from '../../specs/apps';
import { appPreset, defineAppPlugin } from '../apps/AppRenderer';
import { APP_BROWSER_SANDBOX_PLUGIN_NAME } from '../apps/AppBrowserSandbox';
import {
  BROWSER_CODE_TOOL,
  SANDBOX_INPUTS,
  browserCodeTool,
  browserSandboxNote,
  dataUrlBase64,
  executionForModel,
  givenFilesSentence,
  runsCodeInSandbox,
  sampleFiles,
  sandboxFileName,
  textAsBase64,
  writeFilesCode,
} from '../apps/browserSandbox';
import type { SandboxExecution } from '../plugins/agents/service';

const quote = APP_CATALOGUE['quote-calculator'];
const report = APP_CATALOGUE['report-from-a-file'];
const research = APP_CATALOGUE['web-research'];

const ran = (over: Partial<SandboxExecution> = {}): SandboxExecution => ({
  code: '',
  success: true,
  startedAt: 0,
  finishedAt: 0,
  ...over,
});

describe('an application whose agent runs code', () => {
  it('is one whose agent has a sandbox, as on a runtime', () => {
    expect(runsCodeInSandbox(quote)).toBe(true);
    expect(runsCodeInSandbox(report)).toBe(true);
    expect(runsCodeInSandbox({ agent: '' })).toBe(false);
    expect(runsCodeInSandbox({ agent: 'nobody-of-the-catalogue' })).toBe(false);
  });

  it('is given the browser sandbox plugin', () => {
    const named = appPreset(quote).plugins.map(
      plugin => ('plugin' in plugin ? plugin.plugin : plugin).name,
    );
    expect(named).toContain(
      `${APP_BROWSER_SANDBOX_PLUGIN_NAME}-quote-calculator`,
    );
  });

  it('is told in the page where its code runs and where its price list is', () => {
    const [blueprint] = (defineAppPlugin(quote).contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopAgentBlueprint,
    ) as Array<{ value: { instructions?: string } }>;
    const told = blueprint.value.instructions ?? '';
    expect(told.startsWith(quote.instructions)).toBe(true);
    expect(told).toContain(BROWSER_CODE_TOOL);
    expect(told).toContain(
      `Price list at \`${SANDBOX_INPUTS}/price-list.csv\``,
    );
    expect(browserSandboxNote(report)).not.toContain(
      'documents you answer from',
    );
  });
});

describe('the files of the page’s sandbox', () => {
  it('are the documents Datalayer publishes with it, as base64', () => {
    const [prices] = sampleFiles(quote);
    expect(prices.file).toBe('price-list.csv');
    expect(atob(prices.base64)).toBe(quote.samples.documents[0].text);
    expect(sampleFiles(research)).toEqual([]);
  });

  it('keep their name, without a folder or what a path does not say plainly', () => {
    expect(sandboxFileName('orders 2026.csv')).toBe('orders-2026.csv');
    expect(sandboxFileName('../../etc/passwd')).toBe('passwd');
    expect(sandboxFileName('C:\\data\\q.csv')).toBe('q.csv');
    expect(sandboxFileName('..')).toBe('file');
  });

  it('are read from a data URL, and a page file that is none is refused', () => {
    expect(dataUrlBase64(`data:text/csv;base64,${textAsBase64('a,b')}`)).toBe(
      textAsBase64('a,b'),
    );
    expect(() => dataUrlBase64('data:text/csv,a,b')).toThrow(
      'not a base64 data URL',
    );
  });

  it('are written under the inputs folder by the code the sandbox runs', () => {
    const code = writeFilesCode([{ file: 'a.csv', base64: 'YSxi' }]);
    expect(code).toContain(`_pl.Path("${SANDBOX_INPUTS}")`);
    expect(code).toContain('("a.csv", "YSxi"),');
    expect(givenFilesSentence(['a.csv'])).toBe(
      `The files given are in the sandbox: \`${SANDBOX_INPUTS}/a.csv\`.`,
    );
  });
});

describe('execute_code in the page', () => {
  it('puts its documents in the sandbox once, before the first run', async () => {
    const execute = vi.fn(async (code: string) =>
      ran({ code, stdout: code.includes('print') ? '1728\n' : '' }),
    );
    const tool = browserCodeTool(quote, execute);
    expect(tool.name).toBe(BROWSER_CODE_TOOL);
    expect(await tool.handler?.({ code: 'print(12 * 144)' })).toEqual({
      success: true,
      stdout: '1728\n',
    });
    await tool.handler?.({ code: 'print(1)' });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[0][0]).toContain('price-list.csv');
  });

  it('says why its documents could not be put there, and tries again next time', async () => {
    const execute = vi
      .fn<(code: string) => Promise<SandboxExecution>>()
      .mockResolvedValueOnce(ran({ success: false, error: 'MemoryError: ' }))
      .mockResolvedValue(ran());
    const tool = browserCodeTool(quote, execute);
    await expect(tool.handler?.({ code: 'print(1)' })).rejects.toThrow(
      'could not be put in the sandbox',
    );
    expect(await tool.handler?.({ code: 'print(1)' })).toEqual({
      success: true,
    });
  });

  it('runs nothing when no code is given', async () => {
    const execute = vi.fn(async () => ran());
    expect(await browserCodeTool(report, execute).handler?.({})).toEqual({
      success: false,
      error: 'No code was given to run.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('answers what the code printed, returned and failed with', () => {
    expect(
      executionForModel(
        ran({
          success: false,
          stdout: 'rows: 3\n',
          error: 'KeyError: price',
          outputs: [
            { output_type: 'stream', text: 'rows: 3\n' },
            { output_type: 'execute_result', data: { 'text/plain': '42' } },
          ],
        }),
      ),
    ).toEqual({
      success: false,
      stdout: 'rows: 3\n',
      results: ['42'],
      error: 'KeyError: price',
    });
  });
});
