/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The forbidden graph (S-005, DC-004): a
 * lockfile's and an installed production graph, and an esbuild bundle's
 * metafile. Ported from the Slack service, with the bundle gate added.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  forbiddenInBundle,
  forbiddenInGraph,
  forbiddenInInstalled,
  importsOf,
  isForbidden,
  productionGraph,
  type BundleMetafile,
} from '../forbiddenGraph';

const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('the forbidden production graph', () => {
  it('fails when a forbidden package is reachable through a production dependency', () => {
    expect(forbiddenInGraph(read('lock-with-jupyter.json'))).toEqual([
      '@datalayer/agent-runtimes → @datalayer/jupyter-react',
      '@datalayer/agent-runtimes → @datalayer/jupyter-react → @jupyterlab/services',
      '@datalayer/agent-runtimes → @datalayer/jupyter-react → @lumino/widgets',
    ]);
  });

  it('does not count development dependencies', () => {
    const names = productionGraph(read('lock-with-jupyter.json')).map(
      one => one.name,
    );
    expect(names).not.toContain('vitest');
    expect(names).not.toContain('react-dom');
  });

  it('fails on an installed graph (npm ls) that reaches a forbidden package', () => {
    expect(forbiddenInInstalled(read('npm-ls-with-jupyter.json'))).toEqual([
      '@datalayer/agent-runtimes → @datalayer/jupyter-react',
      '@datalayer/agent-runtimes → @datalayer/jupyter-react → @jupyterlab/services',
      '@datalayer/agent-runtimes → @datalayer/jupyter-react → react-dom',
    ]);
  });

  it('reads every kind of import', () => {
    expect(
      importsOf(
        'import x from "@lumino/widgets/lib/x";\nimport type { Y } from "react-dom/client";\nexport { z } from "./z.js";\nconst a = await import("@jupyterlab/services");',
      ).sort(),
    ).toEqual(['@jupyterlab/services', '@lumino/widgets', 'react-dom']);
  });

  it('forbids Reactor and the other host services too', () => {
    for (const name of [
      '@datalayer/reactor',
      '@datalayer/slack',
      '@datalayer/discord',
      '@primer/react',
      'react',
    ])
      expect(isForbidden(name), name).toBe(true);
    for (const name of ['zod', 'pg', '@datalayer/agent-runtimes', 'reactor'])
      expect(isForbidden(name), name).toBe(false);
  });
});

const bundle = (
  inputs: string[],
  externals: string[] = [],
): BundleMetafile => ({
  inputs: Object.fromEntries(inputs.map(input => [input, {}])),
  outputs: {
    'dist/index.js': {
      imports: externals.map(path => ({
        path,
        kind: 'import-statement',
        external: true,
      })),
    },
  },
});

describe('forbiddenInBundle', () => {
  const dependencies = ['zod', 'pg', 'discord-interactions'];

  it("passes the service's sources and agent-runtimes' lib/portable, by either path", () => {
    expect(
      forbiddenInBundle(
        bundle(
          [
            'src/index.ts',
            'scripts/migrate.ts',
            // The monorepo: the workspace link, resolved to its real path.
            '../../../ai/agent-runtimes/lib/portable/hosts/index.js',
            '../../../ai/agent-runtimes/lib/portable/agui.js',
            // Standalone CI and the image: the extracted tarball.
            'node_modules/@datalayer/agent-runtimes/lib/portable/hosts/client.js',
          ],
          ['node:crypto', 'node:http', 'zod', 'pg', 'discord-interactions/x'],
        ),
        dependencies,
      ),
    ).toEqual([]);
  });

  it('refuses a package bundled in, another agent-runtimes folder, and a forbidden module', () => {
    expect(
      forbiddenInBundle(
        bundle([
          'node_modules/left-pad/index.js',
          '../../../ai/agent-runtimes/lib/components/chat/Chat.js',
          'node_modules/@jupyterlab/services/lib/index.js',
        ]),
        dependencies,
      ),
    ).toEqual([
      "node_modules/left-pad/index.js: bundled from outside the service and agent-runtimes' lib/portable",
      "../../../ai/agent-runtimes/lib/components/chat/Chat.js: bundled from outside the service and agent-runtimes' lib/portable",
      'node_modules/@jupyterlab/services/lib/index.js: @jupyterlab/services is forbidden',
    ]);
  });

  it('refuses an external that is no dependency, a bare builtin, and a forbidden one', () => {
    expect(
      forbiddenInBundle(
        bundle(['src/index.ts'], ['express', 'crypto', 'react', 'node:fs']),
        dependencies,
      ),
    ).toEqual([
      "express: external, but express is not one of the service's dependencies",
      "crypto: external, but crypto is not one of the service's dependencies",
      'react: react is forbidden',
    ]);
  });
});
