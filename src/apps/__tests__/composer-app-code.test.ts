/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application written in Python, on the Canvas: what
 * `loop apps build` marks as decided by its code is read from the source the
 * Studio keeps, shown, and a button whose action the code handles keeps it.
 */

import { describe, expect, it } from 'vitest';
import { emptyAppspec } from '../apps/appspec';
import { writeAppspecYaml } from '../apps/yaml';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  actionDecidedBy,
  askedLine,
  codeCommands,
  codeFileOf,
  codeOf,
  momentWords,
  numberedLines,
  papCompanyDecidedBy,
  papRoleDecidedBy,
  whereWords,
} from '../composer/appCode';

/** The text `loop apps build` writes (agent-runtimes' build.spec_text). */
const BUILT = [
  '# Built from app.py by `loop apps build`: the file is the source; edit it there.',
  '# What its code decides; without the file, its agent answers:',
  '# loop:code start: opening (app.py:14)',
  '# loop:code message: reply (app.py:18)',
  '# loop:code action save: save (app.py:23)',
  '# loop:code schedule weekly: weekly (app.py:31)',
  'schema: loop.app/v1',
  'id: echo-desk',
  '# loop:code action later: later (app.py:40)',
  '',
].join('\n');

describe('what the code of an application built from a file decides', () => {
  it('reads the marks at the top of its source, and nothing below', () => {
    const code = codeOf(BUILT);
    expect(code?.file).toBe('app.py');
    expect(code?.marks.map(mark => mark.moment)).toEqual([
      'start',
      'message',
      'action save',
      'schedule weekly',
    ]);
    expect(code?.marks[2]).toEqual({
      moment: 'action save',
      handler: 'save',
      file: 'app.py',
      line: 23,
    });
  });

  it('is nothing for a spec written by hand', () => {
    expect(codeOf(undefined)).toBeNull();
    expect(codeOf('# My desk\nschema: loop.app/v1\n')).toBeNull();
    expect(
      codeOf(
        '# Built from app.py by `loop apps build`: the file is the source; edit it there.\n# Its code decides nothing: its agent answers.\nid: x\n',
      ),
    ).toEqual({
      file: 'app.py',
      marks: [],
    });
  });

  it('says each in words, and which button’s action is the code’s', () => {
    const code = codeOf(BUILT);
    expect(code!.marks.map(mark => momentWords(mark.moment))).toEqual([
      'When a session starts',
      'Its reply to a message',
      'What “save” does',
      'Its scheduled work “weekly”',
    ]);
    // The whole life cycle.
    expect(['stop', 'resume', 'end', 'logout'].map(momentWords)).toEqual([
      'When it is stopped',
      'When a session is resumed',
      'When a session ends',
      'When the person signs out',
    ]);
    // A command its code answers.
    expect(momentWords('command export')).toBe('What /export does');
    // Files sent without being asked, and a message from the page.
    expect(['file', 'window'].map(momentWords)).toEqual([
      'What it does with files sent to it',
      'Its reply to your page',
    ]);
    // A widget's page written in its code.
    expect(momentWords('page')).toBe(
      'What its page shows for its inputs, again as they change',
    );
    // Its tools, checks and tests in code.
    expect(
      ['tool lookup_order', 'check no_prices', 'test greets'].map(momentWords),
    ).toEqual([
      'Something it can do: “lookup_order”',
      'Its check “no_prices”',
      'Its test “greets”',
    ]);
    // An agent of its own code, said with whether its rules see its tool calls.
    expect(
      [
        'agent langgraph',
        'agent llamaindex-agent',
        'agent function',
        'agent llamaindex-workflow',
      ].map(momentWords),
    ).toEqual([
      'Its agent, a LangGraph graph: its rules decide every tool it calls',
      'Its agent, a LlamaIndex agent: its rules decide every tool it calls',
      'Its agent, a plain function: its rules see none of the tools it calls',
      'Its agent, a LlamaIndex workflow: its rules see none of the tools it calls',
    ]);
    expect(
      codeOf('# loop:code agent langgraph: research (app.py:12)\nid: x\n')
        ?.marks[0],
    ).toEqual({
      moment: 'agent langgraph',
      handler: 'research',
      file: 'app.py',
      line: 12,
    });
    expect(whereWords(code!.marks[2])).toBe('save, app.py line 23');
    expect(actionDecidedBy(code, 'save')?.handler).toBe('save');
    expect(actionDecidedBy(code, 'send')).toBeUndefined();
    expect(actionDecidedBy(null, 'save')).toBeUndefined();
  });

  it('keeps its marks through a save from the Studio', () => {
    const app = {
      ...emptyAppspec('chat'),
      id: 'echo-desk',
      name: 'Echo desk',
      agent: 'cog-crawler:0.0.1',
    };
    const header = BUILT.split('\n').slice(0, 6).join('\n');
    const source = `${header}\n${writeAppspecYaml(app)}`;
    const saved = writeAppspecYaml(
      { ...app, name: 'Echo desk, renamed' },
      source,
    );
    expect(saved).toContain('Echo desk, renamed');
    expect(codeOf(saved)).toEqual(codeOf(source));
    expect(codeOf(saved)?.marks).toHaveLength(4);
  });
});

describe('the app.py its item keeps, in the Python tab, and linked from the Canvas', () => {
  const code = {
    file: 'app.py',
    text: 'from x import Application\n\napp = Application(id="desk")\n',
  };

  it('reads the file an item keeps, and nothing else', () => {
    expect(codeFileOf(code)).toEqual(code);
    expect(codeFileOf({ file: 'app.py', text: ' \n' })).toBeNull();
    expect(codeFileOf({ file: '', text: 'x' })).toBeNull();
    expect(codeFileOf(['app.py'])).toBeNull();
    expect(codeFileOf(undefined)).toBeNull();
  });

  it('numbers its lines, and shows the line asked for when the file has it', () => {
    expect(numberedLines(code)).toEqual([
      { number: 1, text: 'from x import Application' },
      { number: 2, text: '' },
      { number: 3, text: 'app = Application(id="desk")' },
    ]);
    expect(askedLine(code, '3')).toBe(3);
    expect(askedLine(code, '4')).toBeNull();
    expect(askedLine(code, '0')).toBeNull();
    expect(askedLine(code, 'x')).toBeNull();
    expect(askedLine(code, null)).toBeNull();
  });

  it('says the commands that change it', () => {
    expect(codeCommands('app-1', code)).toEqual({
      pull: 'loop apps pull app-1',
      push: 'loop apps push app.py --app app-1',
    });
  });
});

describe('what the code decides of the Personal Agent Protocol', () => {
  /** As agent-runtimes' `loop apps build` marks its builders. */
  const PAP_BUILT = [
    '# Built from app.py by `loop apps build`: the file is the source; edit it there.',
    '# What its code decides; without the file, its agent answers:',
    '# loop:code tool close_month: close_month (app.py:12)',
    '# loop:code pap company northwind.example: company_connection (app.py:5)',
    '# loop:code pap company-role: as_company (app.py:9)',
    '# loop:code pap operation books.close_month: close_month (app.py:12)',
    'schema: loop.app/v1',
    '',
  ].join('\n');

  it('finds the company, the role and the operation its builders decide, each at its line', () => {
    const code = codeOf(PAP_BUILT);
    expect(papCompanyDecidedBy(code, 'northwind.example')).toEqual({
      moment: 'pap company northwind.example',
      handler: 'company_connection',
      file: 'app.py',
      line: 5,
    });
    expect(papCompanyDecidedBy(code, 'manzanita.example')).toBeUndefined();
    expect(whereWords(papRoleDecidedBy(code)!)).toBe(
      'as_company, app.py line 9',
    );
    // A spec written by hand: nothing is the code's.
    expect(papRoleDecidedBy(codeOf('schema: loop.app/v1\n'))).toBeUndefined();
  });
});

describe('on the layout', () => {
  it('links where the code decides something to its line', () => {
    const canvas = readFileSync(
      join(__dirname, '..', 'composer', 'AppLayoutEditor.tsx'),
      'utf8',
    );
    expect(canvas).toContain('<CodeWhere mark={mark} openLine={openLine} />');
    expect(canvas).toContain(
      '<CodeWhere mark={decidedBy} openLine={openLine} />',
    );
  });
});
