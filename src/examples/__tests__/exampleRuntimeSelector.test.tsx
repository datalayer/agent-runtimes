/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every example shows where it runs, and is the example it says it is (the
 * user, 22 November 2026): the runtime selector — Browser, Local, Jupyter,
 * Datalayer — is the shared header's, on every registered example, a target
 * an example cannot run on disabled with why; each example key loads a module
 * of its own, and a load that lands after another was asked never mounts.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  ExampleRuntimeSelector,
  unavailableReason,
} from '../components/ExampleRuntimeSelector';
import { getExampleEntries } from '../example-selector';
import { RUNTIME_TARGETS } from '../utils/runtimeTargetStore';

afterEach(() => cleanup());

const examplesDir = join(__dirname, '..');
const source = (file: string) => readFileSync(join(examplesDir, file), 'utf8');

describe('the runtime selector, on every example', () => {
  it.each(getExampleEntries().map(entry => [entry.id, entry] as const))(
    '%s: the four targets, those it cannot run on disabled with why',
    (_id, entry) => {
      const { container } = render(
        <ThemeProvider>
          <ExampleRuntimeSelector
            target="local"
            signedIn
            unavailable={entry.unavailableTargets}
            onChange={() => undefined}
          />
        </ThemeProvider>,
      );
      for (const target of RUNTIME_TARGETS) {
        const button = container.querySelector(
          `[data-example-runtime-target="${target}"]`,
        ) as HTMLButtonElement | null;
        expect(button, `${entry.id}: ${target}`).not.toBeNull();
        const reason = entry.unavailableTargets?.[target];
        expect(
          button!.getAttribute('aria-disabled') === 'true' || button!.disabled,
          `${entry.id}: ${target}`,
        ).toBe(Boolean(reason));
        if (reason) {
          expect(button!.getAttribute('title')).toContain(reason);
        }
      }
    },
  );

  it('asks for a sign-in on the targets that need one', () => {
    expect(unavailableReason('datalayer', { signedIn: false })).toBe(
      'Sign in to use it.',
    );
    expect(unavailableReason('local', { signedIn: false })).toBeUndefined();
  });

  it('is the shared header’s, never hidden for an example', () => {
    const main = source('main.tsx');
    expect(main).toMatch(
      /\{!shouldShowAuthScreen && \(\s*<ExampleRuntimeSelector/,
    );
    expect(main).not.toContain('owns-sandbox-control');
    for (const entry of getExampleEntries()) {
      expect(entry.tags, entry.id).not.toContain('owns-sandbox-control');
    }
  });

  it('is what the Agent examples and the Agent Application run on', () => {
    for (const file of [
      'AgentWorkspaceExample.tsx',
      'AgentShellExample.tsx',
      'AgentComputerExample.tsx',
      'AgentApplicationExample.tsx',
    ]) {
      expect(source(file), file).toContain(
        'useRuntimeTargetStore(state => state.target)',
      );
    }
  });
});

describe('each example is the one it says', () => {
  it('loads a module of its own for each key', () => {
    const modules = getExampleEntries().map(
      entry =>
        /["'](?:\.|\/src\/examples)\/([A-Za-z0-9]+)(?:\.tsx)?["']/.exec(
          entry.loader.toString(),
        )?.[1],
    );
    expect(modules.every(Boolean)).toBe(true);
    expect(new Set(modules).size).toBe(modules.length);
    for (const [index, entry] of getExampleEntries().entries()) {
      expect(modules[index], entry.id).toBe(entry.id);
    }
  });

  it('says the Agent Application’s words in the Agent Application only', () => {
    const files = readdirSync(examplesDir).filter(file => /\.tsx?$/.test(file));
    const saying = files.filter(file =>
      source(file).includes('Added by this page'),
    );
    expect(saying).toEqual(['AgentApplicationExample.tsx']);
  });

  it('never mounts a load that lands after another was asked', () => {
    const main = source('main.tsx');
    expect(main).toContain('const request = ++loadRequest.current;');
    expect(main).toMatch(
      /const module = await exampleLoader\(\);\s*if \(request !== loadRequest\.current\) \{\s*return;\s*\}\s*setExampleComponent/,
    );
  });
});
