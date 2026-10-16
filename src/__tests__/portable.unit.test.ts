/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageOfApproval, normalizeApproval, whyAsked } from '../portable';

describe('normalizeApproval', () => {
  it('reads either naming and keeps both', () => {
    const approval = normalizeApproval({
      approval_id: 'a1',
      agentId: 'agent',
      tool_name: 'send_email',
      toolArgs: { to: 'ada@example.com' },
      status: 'approved',
      updated_at: '2026-10-07T10:00:00Z',
      read: true,
    });
    expect(approval).toMatchObject({
      id: 'a1',
      agent_id: 'agent',
      agentId: 'agent',
      tool_name: 'send_email',
      toolName: 'send_email',
      tool_args: { to: 'ada@example.com' },
      toolArgs: { to: 'ada@example.com' },
      read: true,
    });
    // Decided without a resolution time: its last update says when.
    expect(approval?.resolvedAt).toBe('2026-10-07T10:00:00Z');
  });

  it('is null without an id', () => {
    expect(normalizeApproval({ tool_name: 'x' })).toBeNull();
    expect(normalizeApproval(null)).toBeNull();
  });
});

describe('messageOfApproval', () => {
  it('shows a send whole, under either key', () => {
    const args = {
      to: ['ada@example.com', 'bob@example.com'],
      cc: 'cy@example.com',
      subject: 'Report',
      body: 'Attached.',
      thread_id: 't1',
    };
    const expected = {
      to: 'ada@example.com, bob@example.com',
      cc: 'cy@example.com',
      bcc: '',
      subject: 'Report',
      body: 'Attached.',
      forwards: false,
      replies: true,
    };
    expect(messageOfApproval({ tool_args: args })).toEqual(expected);
    expect(messageOfApproval({ toolArgs: args })).toEqual(expected);
  });

  it('is null for anything that is not a message', () => {
    expect(messageOfApproval({ toolArgs: { query: 'x' } })).toBeNull();
    expect(messageOfApproval({ toolArgs: { to: 'a@b.c' } })).toBeNull();
    expect(messageOfApproval({})).toBeNull();
  });

  it('says why it was asked', () => {
    expect(whyAsked({ toolArgs: { _rule: 'Mail asks first' } })).toBe(
      'Mail asks first',
    );
    expect(whyAsked({ tool_args: { _check: 'Spend' } })).toBe('Spend');
  });
});

/** A source without its comments: what runs and what is imported. */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

/**
 * What a module imports: at run time (`from`, a side-effect `import 'x'`, a
 * dynamic `import('x')`, a `require('x')`) and for its types only.
 */
function importsOf(source: string): {
  runtime: string[];
  types: string[];
} {
  const code = withoutComments(source);
  const runtime: string[] = [];
  const types: string[] = [];
  for (const [, kind, path] of code.matchAll(
    /^(?:import|export)\s+(type\b)?[^;]*?from\s+'([^']+)'/gms,
  )) {
    (kind ? types : runtime).push(path);
  }
  for (const pattern of [
    /^import\s+'([^']+)'/gm,
    /\bimport\(\s*'([^']+)'\s*\)/g,
    /\brequire\(\s*'([^']+)'\s*\)/g,
  ]) {
    for (const [, path] of code.matchAll(pattern)) {
      runtime.push(path);
    }
  }
  return { runtime, types };
}

/** A DOM global a module reaches, which type-checking with the DOM lib lets through. */
const DOM_GLOBAL =
  /\b(window|document|localStorage|sessionStorage|navigator|HTMLElement)\b/;

/**
 * Every module an entry reaches through its relative imports: at run time
 * (type-only imports are erased when it is built), and with `types` its
 * type-only imports too.
 */
function reachedFrom(
  entry: string,
  { types = false }: { types?: boolean } = {},
): Map<string, string> {
  const reached = new Map<string, string>();
  const visit = (file: string) => {
    if (reached.has(file)) {
      return;
    }
    const source = readFileSync(file, 'utf8');
    reached.set(file, source);
    const imports = importsOf(source);
    for (const path of [...imports.runtime, ...(types ? imports.types : [])]) {
      if (!path.startsWith('.')) {
        continue;
      }
      const base = join(dirname(file), path);
      const next = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(
        existsSync,
      );
      if (next) {
        visit(next);
      }
    }
  };
  visit(entry);
  return reached;
}

describe('the portable entry', () => {
  const folder = join(__dirname, '..', 'portable');
  const reached = reachedFrom(join(folder, 'index.ts'));

  it('reaches no module outside its folder at run time', () => {
    // A phone's Metro graph takes lib/portable/* and nothing else of Agent
    // Runtimes (MOBILE M-006): a module it reaches elsewhere is refused there.
    for (const file of reached.keys()) {
      expect(dirname(file), file).toBe(folder);
    }
    expect(reached.size).toBeGreaterThan(5);
  });

  it('reaches no package at run time: no React, DOM, Jupyter, Reactor or Node module', () => {
    for (const [file, source] of reached) {
      const runtime = importsOf(source).runtime.filter(
        path => !path.startsWith('.'),
      );
      expect(runtime, file).toEqual([]);
    }
  });

  it('reaches no DOM global', () => {
    // tsconfig.app.json includes the DOM lib: type-checking lets them through.
    for (const [file, source] of reached) {
      expect(withoutComments(source).match(DOM_GLOBAL)?.[0], file).toBe(
        undefined,
      );
    }
  });

  it('reads every form of import, comments aside', () => {
    expect(
      importsOf(
        [
          "import a from './a';",
          "import type { B } from './b';",
          "export * from './c';",
          "import 'side-effect';",
          "const d = await import('./d');",
          "const e = require('node:e');",
          "// import f from 'f';",
        ].join('\n'),
      ),
    ).toEqual({
      runtime: ['./a', './c', 'side-effect', './d', 'node:e'],
      types: ['./b'],
    });
  });

  it('carries the reducer (DISCORD DC-005)', () => {
    expect(
      [...reached.keys()].map(file => file.slice(folder.length + 1)),
    ).toEqual(expect.arrayContaining(['semantic.ts', 'semanticOfAgUi.ts']));
  });
});

describe('the hosts entry (DC-004)', () => {
  const portable = join(__dirname, '..', 'portable');
  const folder = join(portable, 'hosts');
  const reached = reachedFrom(join(folder, 'index.ts'));
  const withTypes = reachedFrom(join(folder, 'index.ts'), { types: true });
  const PACKAGES = ['zod', 'node:crypto', 'node:http'];

  it('reaches src/portable and src/portable/hosts only, types included', () => {
    for (const file of withTypes.keys()) {
      expect([portable, folder], file).toContain(dirname(file));
    }
    expect(reached.size).toBeGreaterThan(15);
  });

  it('reaches no package at run time but zod, node:crypto and node:http', () => {
    for (const [file, source] of reached) {
      const runtime = importsOf(source).runtime.filter(
        path => !path.startsWith('.'),
      );
      for (const name of runtime) {
        expect(PACKAGES, `${file}: ${name}`).toContain(name);
      }
    }
  });

  it("never imports '../index', so it never reaches ChatMessage's type chain", () => {
    for (const [file, source] of withTypes) {
      if (dirname(file) !== folder) {
        continue;
      }
      const { runtime, types } = importsOf(source);
      for (const path of [...runtime, ...types]) {
        expect(path, file).not.toMatch(/^\.\.(\/index)?$/);
      }
    }
    expect([...withTypes.keys()]).not.toContain(join(portable, 'index.ts'));
    expect([...withTypes.keys()]).not.toContain(join(portable, 'sessions.ts'));
    expect([...withTypes.keys()]).not.toContain(join(portable, 'thread.ts'));
  });

  it('reaches no DOM global', () => {
    for (const [file, source] of withTypes) {
      expect(withoutComments(source).match(DOM_GLOBAL)?.[0], file).toBe(
        undefined,
      );
    }
  });

  it('is never reached from the portable entry a phone takes', () => {
    const fromMobile = reachedFrom(join(portable, 'index.ts'), { types: true });
    for (const file of fromMobile.keys()) {
      expect(dirname(file), file).not.toBe(folder);
    }
  });
});
