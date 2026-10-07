/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The frame a component its developer wrote is drawn in (LOOP P-17), and
 * what passes between it and the page.
 *
 * A hosted application lives on the origin where people are signed in, and
 * no script an application supplies reaches that page (LOOP D-22). A custom
 * component's module is such a script, so it never runs in the page: it runs
 * in an `<iframe sandbox="allow-scripts">` — no `allow-same-origin`, so the
 * frame has an origin of its own that is no one's: no cookie, no storage, no
 * access to the page, its DOM or its tokens — whose document allows nothing
 * but its own bootstrap and the module it is handed (`default-src 'none'`):
 * no request leaves the frame, no form, no navigation of the page.
 *
 * The page fetches the module — without credentials — checks it against the
 * hash it was reviewed with when the spec gives one (`integrity`), and hands
 * its text to the frame, which imports it from a `blob:` address. Its
 * default export draws it: `export default function (root, {props, send})`,
 * returning `{update(props)}` to be told of new properties. What it is given
 * is its properties and what it shows; what it gives back is what it sends,
 * by name, each refused unless declared.
 *
 * @module components/a2ui/custom/sandbox
 */

/** What the frame of a custom component may do: run scripts, nothing else. */
export const CUSTOM_FRAME_SANDBOX = 'allow-scripts';

/** The largest module the page hands to a frame, in bytes. */
export const MAX_MODULE_BYTES = 2 * 1024 * 1024;

/** The tag every message between the page and a frame carries. */
export const FRAME_TAG = 'loop.component';

/** What the page tells the frame. */
export type ToFrame =
  | { tag: typeof FRAME_TAG; kind: 'module'; code: string }
  | { tag: typeof FRAME_TAG; kind: 'props'; props: Record<string, unknown> };

/** What the frame tells the page. */
export type FromFrame =
  | { kind: 'ready' }
  | { kind: 'drawn' }
  | { kind: 'failed'; message: string }
  | { kind: 'send'; name: string; value: unknown };

/** The policy of the frame's document: its bootstrap, the module it is handed, nothing else. */
export function customFramePolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' blob:`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src data: blob:',
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** A nonce for one frame's bootstrap. */
export function frameNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The document of a custom component's frame (its `srcdoc`): the policy,
 * the root it draws into, and the bootstrap that imports the module it is
 * handed and passes properties in and what it sends out.
 */
export function customFrameDocument(nonce: string, label: string): string {
  const escaped = label.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${customFramePolicy(nonce)}">
<title>${escaped}</title>
<style>html,body{margin:0;padding:0;background:transparent;color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}#root{box-sizing:border-box;min-height:100vh}</style>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}">
(() => {
  const TAG = ${JSON.stringify(FRAME_TAG)};
  const root = document.getElementById('root');
  let props = {};
  let drawn = null;
  let started = false;
  const say = message => parent.postMessage(Object.assign({ tag: TAG }, message), '*');
  const send = (name, value) => say({ kind: 'send', name: String(name), value: value });
  addEventListener('message', async event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.tag !== TAG) return;
    if (data.kind === 'props') {
      props = data.props || {};
      if (drawn && typeof drawn.update === 'function') drawn.update(props);
      return;
    }
    if (data.kind !== 'module' || started) return;
    started = true;
    try {
      const url = URL.createObjectURL(new Blob([data.code], { type: 'text/javascript' }));
      const module = await import(url);
      URL.revokeObjectURL(url);
      if (typeof module.default !== 'function') {
        throw new Error('its module has no default export that draws it');
      }
      drawn = (await module.default(root, { props: props, send: send })) || {};
      say({ kind: 'drawn' });
    } catch (error) {
      say({ kind: 'failed', message: String((error && error.message) || error) });
    }
  });
  say({ kind: 'ready' });
})();
</script>
</body>
</html>`;
}

/** What a frame said, when it is a message of the frame drawn here; null otherwise. */
export function fromFrame(
  event: Pick<MessageEvent, 'source' | 'data'>,
  frame: Window | null | undefined,
): FromFrame | null {
  if (!frame || event.source !== frame) {
    return null;
  }
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || data.tag !== FRAME_TAG) {
    return null;
  }
  switch (data.kind) {
    case 'ready':
    case 'drawn':
      return { kind: data.kind };
    case 'failed':
      return { kind: 'failed', message: String(data.message ?? '') };
    case 'send':
      return typeof data.name === 'string'
        ? { kind: 'send', name: data.name, value: data.value }
        : null;
    default:
      return null;
  }
}

const ALGORITHMS: Record<string, string> = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

function base64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Whether a module's bytes are the ones its Subresource Integrity hash names. */
export async function integrityHolds(
  bytes: ArrayBuffer,
  integrity: string,
): Promise<boolean> {
  const at = integrity.indexOf('-');
  const algorithm = ALGORITHMS[integrity.slice(0, at)];
  if (at < 0 || !algorithm) {
    return false;
  }
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return base64(digest) === integrity.slice(at + 1);
}

/** The modules fetched, by address and hash: each fetched once per page. */
const MODULES = new Map<string, Promise<string>>();

/**
 * The text of a custom component's module, fetched without credentials and
 * checked against its hash when one is given. It throws, with a sentence,
 * for a module that cannot be fetched, is too large, or is not the one
 * reviewed.
 */
export function customModule(
  source: string,
  integrity: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const key = `${source}\n${integrity}`;
  let module = MODULES.get(key);
  if (!module) {
    module = (async () => {
      const response = await fetcher(source, {
        credentials: 'omit',
        mode: 'cors',
      });
      if (!response.ok) {
        throw new Error(
          `Its module could not be fetched from ${source} (${response.status}).`,
        );
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_MODULE_BYTES) {
        throw new Error(
          `Its module is larger than ${MAX_MODULE_BYTES / 1024 / 1024} MB.`,
        );
      }
      if (integrity && !(await integrityHolds(bytes, integrity))) {
        throw new Error(
          'Its module is not the one reviewed: its hash differs from its integrity.',
        );
      }
      return new TextDecoder().decode(bytes);
    })();
    // A failure is not kept: the next drawing tries again.
    module.catch(() => MODULES.delete(key));
    MODULES.set(key, module);
  }
  return module;
}
