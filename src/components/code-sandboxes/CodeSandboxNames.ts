/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The given name of a code sandbox of a Jupyter Server or of the browser.
 *
 * A sandbox of the platform is named when it is launched — `given_name`, the
 * field the launcher fills from the template of its environment — and it
 * carries that name everywhere it is listed. A kernel of a Jupyter Server has
 * no such field: the API gives its identifier and its kernelspec, and nothing
 * that is the name of THIS sandbox. `python3` is what it runs, and reads the
 * same on every one of them.
 *
 * The name was taken from the session instead, and that was the wrong place:
 * a session is a standard Jupyter session, it ties a kernel to a document, it
 * comes and goes as documents open and close, and several can name one kernel.
 * A sandbox then wore the name of a document, changed name when another
 * document took it, and kept the name of a document that had been closed.
 *
 * The given name is held here, by kernel, and given on first sight — from the
 * kernelspec, which is what the launcher does for a runtime of the platform.
 * It is kept in the browser: the kernels of a server outlive the page that
 * lists them, so the name has to outlive it too, and the server has nowhere to
 * put it.
 *
 * @module components/code-sandboxes/CodeSandboxNames
 */

/** Where the names are kept, and under which key. */
const STORAGE_KEY = 'datalayer:code-sandbox-names';

/** The names, by kernel identifier, as they were last written. */
let names: Record<string, string> | undefined;

function load(): Record<string, string> {
  if (names) {
    return names;
  }
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    names = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    // A browser that refuses its storage keeps the names for this page only.
    names = {};
  }
  return names;
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    /* the names stay in memory */
  }
}

/**
 * The given name of a sandbox, when it has one.
 *
 * @param kernelId Kernel of the sandbox
 */
export function getCodeSandboxGivenName(kernelId?: string): string | undefined {
  return kernelId ? load()[kernelId] : undefined;
}

/**
 * Name a sandbox, or rename it.
 *
 * @param kernelId Kernel of the sandbox
 * @param givenName What to call it; empty forgets the name
 */
export function setCodeSandboxGivenName(
  kernelId: string,
  givenName: string
): void {
  const stored = load();
  if (givenName) {
    stored[kernelId] = asGivenName(givenName);
  } else {
    delete stored[kernelId];
  }
  save();
}

/**
 * Drop the names of the sandboxes that are no longer running.
 *
 * @param runningKernelIds The kernels that are still there
 */
export function pruneCodeSandboxGivenNames(
  runningKernelIds: Iterable<string>
): void {
  const alive = new Set(runningKernelIds);
  const stored = load();
  let dropped = false;
  Object.keys(stored).forEach(kernelId => {
    if (!alive.has(kernelId)) {
      delete stored[kernelId];
      dropped = true;
    }
  });
  if (dropped) {
    save();
  }
}

/**
 * A name a sandbox can wear, out of whatever it was built from.
 *
 * A kernelspec is free to call itself with a picture — a laptop, a snake —
 * and some do. A glyph makes a poor name: it says nothing about WHICH sandbox
 * this is, it reads as a broken character in the fonts of the toolbar, and it
 * is not what anyone would type. Pictures and their variation selectors are
 * dropped, and a name left with nothing is replaced rather than shown empty.
 */
function asGivenName(base: string): string {
  const stripped = (base ?? '')
    // Pictographs, their skin tones, their joiners and their selectors.
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || 'Code Sandbox';
}

/**
 * Every given name in use by a sandbox of a server or of the browser.
 */
export function listCodeSandboxGivenNames(): string[] {
  return Object.values(load());
}

/**
 * The next free name built on a base, numbered when the base is taken.
 *
 * "Python 3 (ipykernel)", then "Python 3 (ipykernel) 2", then 3 — one rule for
 * the name a sandbox is given on first sight and for the name the launcher
 * offers, so what the launcher proposes is what an unnamed one would get.
 *
 * @param base What to call it, before any numbering
 * @param taken The names already in use
 */
export function nextCodeSandboxGivenName(
  base: string,
  taken: Iterable<string>
): string {
  const used = new Set(taken);
  const stem = asGivenName(base);
  let candidate = stem;
  let ordinal = 1;
  while (used.has(candidate)) {
    ordinal += 1;
    candidate = `${stem} ${ordinal}`;
  }
  return candidate;
}

/**
 * The given name of a sandbox, giving it one when it has none.
 *
 * The name of what it runs, and a number when a sandbox of that kind is
 * already named — the way two runtimes of one environment are told apart.
 * Assigned once and kept: a name that changed with what else is running would
 * be no name at all.
 *
 * @param kernelId Kernel of the sandbox
 * @param specDisplayName What the kernelspec of the sandbox is called
 */
export function ensureCodeSandboxGivenName(
  kernelId: string,
  specDisplayName: string
): string {
  const existing = getCodeSandboxGivenName(kernelId);
  if (existing) {
    return existing;
  }
  const candidate = nextCodeSandboxGivenName(
    specDisplayName,
    listCodeSandboxGivenNames()
  );
  setCodeSandboxGivenName(kernelId, candidate);
  return candidate;
}

export default ensureCodeSandboxGivenName;
