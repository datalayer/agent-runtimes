#!/usr/bin/env node
/**
 * Put `dist-embed/` in a checkout: the embed element's own bundle.
 *
 * `dist-embed/datalayer-app.js` is what a page loads to put an application on
 * someone else's site (LOOP D-08). A release carries it — `npm run build:embed`
 * runs in the release, and the npm package ships the folder — but a workspace
 * checkout has never run it, and the folder is gitignored. The landing's
 * production build refuses to ship without it, because an embed bundle that
 * does not match the runtime it talks to is worse than none:
 *
 *     Error: @datalayer/agent-runtimes has no dist-embed/datalayer-app.js …
 *             install a release that carries the embed bundle (1.3.93 or later)
 *
 * Two ways to get it, and the right one depends on what you are doing:
 *
 *     node scripts/dist-embed.mjs            # build it here, from this tree
 *     node scripts/dist-embed.mjs --release  # take the published one of this
 *                                            # package's own version
 *     node scripts/dist-embed.mjs --release 1.3.95   # or of the one named
 *
 * Build it when you changed the embed's own code and want to see it. Take the
 * release when you only need the landing to build: the download is seconds
 * against minutes, and it is byte for byte what the deployed runtime serves.
 * `--force` replaces a folder that is already there; without it, an existing
 * `dist-embed/datalayer-app.js` is left alone and said so.
 *
 * @module scripts/dist-embed
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, cpSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'dist-embed');
const MADE = join(OUT, 'datalayer-app.js');

const args = process.argv.slice(2);
const wants = (name) => args.includes(name);
/** The value after a flag, when it is not another flag. */
const after = (name) => {
  const at = args.indexOf(name);
  const value = at < 0 ? '' : String(args[at + 1] ?? '');
  return value.startsWith('-') ? '' : value;
};

const say = (line) => process.stdout.write(`${line}\n`);

const ownVersion = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/** How big the folder is, in words a person reads. */
const sizeOf = (path) => {
  const bytes = Number(
    execFileSync('du', ['-sb', path], { encoding: 'utf8' }).split(/\s+/)[0] || 0
  );
  return bytes > 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
};

function fromRelease(version) {
  const named = `@datalayer/agent-runtimes@${version}`;
  say(`Taking the embed bundle of ${named} from npm…`);
  const work = mkdtempSync(join(tmpdir(), 'dist-embed-'));
  try {
    const packed = execFileSync('npm', ['pack', named, '--silent'], {
      cwd: work,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .pop();
    const tarball = join(work, packed);
    if (!existsSync(tarball)) {
      throw new Error(`npm pack wrote no tarball for ${named}`);
    }
    execFileSync('tar', ['xzf', tarball, 'package/dist-embed'], { cwd: work });
    const taken = join(work, 'package', 'dist-embed');
    if (!existsSync(join(taken, 'datalayer-app.js'))) {
      throw new Error(`${named} carries no dist-embed/datalayer-app.js: it predates the embed bundle`);
    }
    rmSync(OUT, { recursive: true, force: true });
    cpSync(taken, OUT, { recursive: true });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function build() {
  say('Building the embed bundle from this tree (vite.embed.config.ts)…');
  execFileSync('npm', ['run', 'build:embed'], { cwd: ROOT, stdio: 'inherit' });
}

if (existsSync(MADE) && !wants('--force')) {
  say(`dist-embed is already here (${sizeOf(OUT)}): nothing done. Pass --force to replace it.`);
  process.exit(0);
}

try {
  if (wants('--release')) {
    fromRelease(after('--release') || ownVersion());
  } else {
    build();
  }
} catch (refused) {
  say(`The embed bundle could not be made: ${refused.message}`);
  process.exit(1);
}

if (!existsSync(MADE)) {
  say('The embed bundle was not made: dist-embed/datalayer-app.js is absent.');
  process.exit(1);
}
say(`dist-embed is ready: ${sizeOf(OUT)}, ${Math.round(statSync(MADE).size / 1024)} KB of loader.`);
