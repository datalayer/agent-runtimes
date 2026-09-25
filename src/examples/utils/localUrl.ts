/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whether a URL names a service on this machine.
 *
 * Asked this way round on purpose. The test it replaces was "is this prod1?",
 * which took every host it did not recognise for a local one — so once the
 * configured service moved to `r1`, Local mode accepted the cloud URL as its
 * own and the browser dialled it from `localhost`, where CORS refused it.
 *
 * The set of remote hosts is open — `prod1`, `r1`, whatever a deployment adds
 * next — while the set of local ones is not, so the closed set is the one
 * worth enumerating.
 *
 * Shared rather than copied because the same mistake is available to every
 * "local" URL the examples resolve, and it was made twice: once for the
 * Jupyter server, and once — unfixed until now — for the agent-runtimes
 * server, where `VITE_DATALAYER_AGENT_RUNTIMES_URL` defaults to the cloud and
 * was being handed back as the address of a server running on this laptop.
 *
 * @module examples/utils/localUrl
 */

/** Hosts that mean "this machine", exhaustively. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

export function isLocalUrl(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    // Not a whole URL — a bare `localhost:8765`, say. Match on the text.
    return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)([:/]|$)/.test(
      value,
    );
  }
  return (
    LOCAL_HOSTS.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

export default isLocalUrl;
