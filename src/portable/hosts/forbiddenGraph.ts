/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What may never reach a host service's production code (SLACK §4.2, S-005;
 * DISCORD §4.2): Jupyter, JupyterLab, Lumino, Datalayer's Jupyter packages,
 * React, Primer, Reactor and the other host services. Checked over the
 * service's source imports, its esbuild bundle's module graph
 * (`forbiddenInBundle`, over the metafile) and the installed graph of the
 * bundle's externals (`npm ls --omit=dev --omit=peer --all`). Pure functions:
 * each service reads its files and runs them. Moved from the Slack service
 * (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/forbiddenGraph
 */

export const FORBIDDEN: readonly RegExp[] = [
  /^@jupyter\//,
  /^@jupyterlab\//,
  /^@jupyter-widgets\//,
  /^@lumino\//,
  /^@datalayer\/jupyter-/,
  /^react-dom$/,
  /^react$/,
  /^@primer\//,
  /^@datalayer\/reactor$/,
  /^@datalayer\/slack$/,
  /^@datalayer\/discord$/,
];

/** A package reached, with the chain of dependencies that reached it. */
export type Reached = Readonly<{ chain: string[]; name: string }>;

type LockPackage = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

/** A lockfile, v2 or v3: its `packages`. */
export type Lockfile = { packages?: Record<string, LockPackage> };

/** What `npm ls --json` answers: each package and its own dependencies. */
export type InstalledTree = {
  dependencies?: Record<string, InstalledTree | undefined>;
};

export const isForbidden = (name: string): boolean =>
  FORBIDDEN.some(pattern => pattern.test(name));

/** The package name an import specifier names: `@scope/name/deep` → `@scope/name`. */
export function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('node:'))
    return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Every bare import of one source file. */
export function importsOf(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\sfrom\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns)
    for (const match of source.matchAll(pattern)) {
      const name = packageOf(match[1] ?? '');
      if (name) found.add(name);
    }
  return [...found];
}

/**
 * The production graph of a lockfile (v2/v3 `packages`): from the root's
 * `dependencies` and `optionalDependencies` (never `devDependencies`), each
 * package's own dependencies resolved the way Node resolves them — the
 * nearest `node_modules` up from the dependent. Answers each package reached
 * with the chain that reached it.
 */
export function productionGraph(lock: Lockfile): Reached[] {
  const packages = lock.packages ?? {};
  const root = packages[''] ?? {};
  const resolve = (from: string, name: string): string | undefined => {
    let base = from;
    while (true) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
      if (packages[candidate]) return candidate;
      if (!base) return undefined;
      const index = base.lastIndexOf('/node_modules/');
      base = index >= 0 ? base.slice(0, index) : '';
    }
  };
  const reached = new Map<string, Reached>();
  const queue: Array<{ chain: string[]; from: string; name: string }> = [];
  for (const name of Object.keys({
    ...root.dependencies,
    ...root.optionalDependencies,
  }))
    queue.push({ chain: [name], from: '', name });
  while (queue.length > 0) {
    const { chain, from, name } = queue.shift() as (typeof queue)[number];
    const path = resolve(from, name);
    if (!path || reached.has(path)) continue;
    reached.set(path, { chain, name });
    const meta = packages[path] ?? {};
    for (const next of Object.keys({
      ...meta.dependencies,
      ...meta.optionalDependencies,
      ...meta.peerDependencies,
    }))
      if (!(
        meta.peerDependenciesMeta?.[next]?.optional && !resolve(path, next)
      ))
        queue.push({ chain: [...chain, next], from: path, name: next });
  }
  return [...reached.values()];
}

/**
 * The production graph as `npm ls --omit=dev --all --json` answers it, from
 * what is installed: what the service runs with, whether a lockfile is kept
 * or not (the monorepo keeps none). Each package with the chain reaching it.
 */
export function installedGraph(tree: InstalledTree): Reached[] {
  const reached: Reached[] = [];
  const seen = new Set<string>();
  const walk = (
    dependencies: InstalledTree['dependencies'],
    chain: string[],
  ): void => {
    for (const [name, node] of Object.entries(dependencies ?? {})) {
      const id = `${chain.join('>')}>${name}`;
      if (seen.has(id) || chain.includes(name)) continue;
      seen.add(id);
      reached.push({ chain: [...chain, name], name });
      walk(node?.dependencies, [...chain, name]);
    }
  };
  walk(tree.dependencies, []);
  return reached;
}

/** The forbidden packages an installed graph reaches, each with its chain. */
export function forbiddenInInstalled(tree: InstalledTree): string[] {
  return installedGraph(tree)
    .filter(one => isForbidden(one.name))
    .map(one => one.chain.join(' → '));
}

/** The forbidden packages a lockfile's production graph reaches, each with its chain. */
export function forbiddenInGraph(lock: Lockfile): string[] {
  return productionGraph(lock)
    .filter(one => isForbidden(one.name))
    .map(one => one.chain.join(' → '));
}

/** The parts of an esbuild metafile the bundle gate reads. */
export type BundleMetafile = {
  inputs: Record<string, unknown>;
  outputs: Record<
    string,
    { imports?: ReadonlyArray<{ path: string; external?: boolean }> }
  >;
};

/** Where agent-runtimes' portable code lies, by the real path esbuild reads it from. */
const PORTABLE = /(^|\/)agent-runtimes\/lib\/portable\//;

/**
 * What a service's esbuild bundle may hold (DISCORD §4.2): its own sources,
 * and agent-runtimes' `lib/portable` (by its real path: the monorepo's
 * workspace link resolves to `ai/agent-runtimes/lib/portable/…`). Every
 * other module is a package's, and refused; every external is a `node:`
 * builtin or a name in the service's `dependencies`; nothing matches
 * `FORBIDDEN`. Answers each violation in words.
 */
export function forbiddenInBundle(
  metafile: BundleMetafile,
  dependencies: readonly string[],
): string[] {
  const violations: string[] = [];
  for (const input of Object.keys(metafile.inputs)) {
    const portable = PORTABLE.test(input);
    const modules = input.lastIndexOf('node_modules/');
    const name =
      modules >= 0
        ? packageOf(input.slice(modules + 'node_modules/'.length))
        : undefined;
    if (name && isForbidden(name))
      violations.push(`${input}: ${name} is forbidden`);
    else if (!portable && (modules >= 0 || input.startsWith('../')))
      violations.push(
        `${input}: bundled from outside the service and agent-runtimes' lib/portable`,
      );
  }
  const externals = new Set<string>();
  for (const output of Object.values(metafile.outputs))
    for (const one of output.imports ?? [])
      if (one.external) externals.add(one.path);
  for (const path of externals) {
    if (path.startsWith('node:')) continue;
    const name = packageOf(path);
    if (!name) violations.push(`${path}: a relative external`);
    else if (isForbidden(name))
      violations.push(`${path}: ${name} is forbidden`);
    else if (!dependencies.includes(name))
      violations.push(
        `${path}: external, but ${name} is not one of the service's dependencies`,
      );
  }
  return violations;
}
