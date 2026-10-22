/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The relative module specifiers of a compiled ES module, as Node reads them.
 *
 * `tsc` with `moduleResolution: bundler` keeps a source's specifiers as they
 * are written (`'./approvals'`, `'./chat'`), which a bundler resolves and
 * Node's ESM loader refuses: it takes a relative specifier as a file path,
 * with no extension added and no directory's `index.js` looked up. So
 * `lib/` is made loadable by Node (vitest's externalized dependencies, a
 * Node service importing `lib/portable`) by writing each specifier whole
 * (`fully-specify-lib.mjs`), and the packed tarball is checked for a
 * specifier that names a file it does not carry (`check-npm-pack.mjs`).
 *
 * Comments are not read: TypeScript's own pre-processor lists the imports,
 * the exports and the dynamic imports of a file.
 */

import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/**
 * Every relative specifier of `text`, with the offset of its first
 * character in `text`.
 *
 * @param {string} text A compiled JavaScript module.
 * @returns {{ specifier: string, start: number }[]}
 */
export function relativeSpecifiers(text) {
  const { importedFiles } = ts.preProcessFile(text, true, true);
  const found = [];
  for (const { fileName, pos } of importedFiles) {
    if (!fileName.startsWith('./') && !fileName.startsWith('../')) continue;
    const start = text.indexOf(fileName, pos);
    if (start < 0) {
      throw new Error(`the specifier ${fileName} is not at ${pos}`);
    }
    found.push({ specifier: fileName, start });
  }
  return found;
}

/**
 * What a specifier of `from` names, given the files there are.
 *
 * @param {string} from The importing file, a posix path.
 * @param {string} specifier A relative specifier.
 * @param {(path: string) => boolean} isFile Whether a file is there.
 * @returns {{ status: 'whole' | 'partial' | 'missing', path?: string, whole?: string }}
 *   `whole`: the specifier names a file; `partial`: it names a file only
 *   once `.js` or `/index.js` is added (`whole` is the specifier written
 *   so); `missing`: no file.
 */
export function resolveSpecifier(from, specifier, isFile) {
  const query = specifier.search(/[?#]/);
  const bare = query < 0 ? specifier : specifier.slice(0, query);
  const target = posix.normalize(posix.join(posix.dirname(from), bare));
  if (isFile(target)) return { status: 'whole', path: target };
  if (query < 0) {
    if (isFile(`${target}.js`)) {
      return { status: 'partial', path: `${target}.js`, whole: `${bare}.js` };
    }
    const index = posix.join(target, 'index.js');
    if (isFile(index)) {
      return {
        status: 'partial',
        path: index,
        whole: `${bare.replace(/\/$/, '')}/index.js`,
      };
    }
  }
  return { status: 'missing' };
}

/**
 * The deep specifiers of a module into another package — `'@datalayer/core/lib/state'`,
 * `'pkg/lib/x'` — with where each starts in the text. A package's bare name
 * (`'react'`, `'@datalayer/core'`) is not one: its `main` or `exports` decides.
 */
export function deepSpecifiers(text) {
  const { importedFiles } = ts.preProcessFile(text, true, true);
  const found = [];
  for (const { fileName, pos } of importedFiles) {
    if (fileName.startsWith('.') || fileName.startsWith('/')) continue;
    if (fileName.includes(':') || /[?#]/.test(fileName)) continue;
    const parts = fileName.split('/');
    const nameLength = fileName.startsWith('@') ? 2 : 1;
    if (parts.length <= nameLength) continue;
    const start = text.indexOf(fileName, pos);
    if (start < 0) {
      throw new Error(`the specifier ${fileName} is not at ${pos}`);
    }
    found.push({
      specifier: fileName,
      start,
      pkg: parts.slice(0, nameLength).join('/'),
      subpath: parts.slice(nameLength).join('/'),
    });
  }
  return found;
}

/**
 * Where a package is installed, looked up from `fromDir` upwards as Node
 * does; `null` when it is not.
 */
export function packageDirOf(pkg, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', pkg);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * A deep specifier written whole, as Node's ESM loader needs it in a
 * package with no `exports` map: `'<pkg>/lib/x'` becomes `'<pkg>/lib/x.js'`
 * or `'<pkg>/lib/x/index.js'`. `whole` when it already names a file or its
 * package maps its own paths (`exports`), `partial` with the rewrite, and
 * `missing` when the package or the file is not there.
 */
export function resolveDeepSpecifier({ specifier, pkg, subpath }, fromDir) {
  const dir = packageDirOf(pkg, fromDir);
  if (!dir) return { status: 'missing' };
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (manifest.exports !== undefined) return { status: 'whole' };
  const target = join(dir, subpath);
  if (posix.extname(subpath) && existsSync(target)) return { status: 'whole' };
  if (existsSync(`${target}.js`)) {
    return { status: 'partial', whole: `${specifier}.js` };
  }
  if (existsSync(join(target, 'index.js'))) {
    return {
      status: 'partial',
      whole: `${specifier.replace(/\/$/, '')}/index.js`,
    };
  }
  return existsSync(target) ? { status: 'whole' } : { status: 'missing' };
}
