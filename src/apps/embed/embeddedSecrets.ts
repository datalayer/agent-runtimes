/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What no file the embed ships may hold (B-02): the PAP SDK's
 * emitted-bundle test (`src/__tests__/canaries.test.mjs`, `EMBEDDED_SECRETS`)
 * extended to the embed, a browser artifact anybody's page loads. Its build
 * fails on a file holding one (`vite.embed.config.ts`), naming the kind and
 * the file, never what matched.
 *
 * Found 2026-10-13: the embed then served at datalayer.ai held the builder's
 * Datalayer API key, because `import.meta.env` read whole (`env?.VITE_…`) is
 * every `VITE_` variable of the environment it was built in.
 *
 * @module apps/embed/embeddedSecrets
 */

export const EMBEDDED_SECRETS: ReadonlyArray<readonly [string, RegExp]> = [
  // Key material after the header: a library may name the header to refuse it.
  [
    'a PEM private key',
    /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/=]{40,}/,
  ],
  ['a private JWK member', /["']d["']\s*:\s*["'][A-Za-z0-9_-]{32,}["']/],
  [
    'a compact JWT',
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  ],
  ['a Bearer or DPoP token', /(?:Bearer|DPoP) [A-Za-z0-9_-]{20,}/],
];

/** The kinds of secret a file's text holds, by name: empty when none. */
export function secretsIn(text: string): string[] {
  return EMBEDDED_SECRETS.filter(([, pattern]) => pattern.test(text)).map(
    ([kind]) => kind,
  );
}
