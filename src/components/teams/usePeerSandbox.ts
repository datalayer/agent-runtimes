/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A peer's code sandbox, for its *Code Sandbox Details…*: the codemode
 * sandbox of the runtime it is served from, as that runtime reports it.
 *
 * @module components/teams/usePeerSandbox
 */

import { useEffect, useState } from 'react';
import {
  assistantSandboxOf,
  type AssistantSandbox,
} from '../../chat/assistant/assistantDetails';

/**
 * The runtime an A2A address is served from: its base, before
 * `/api/v1/a2a/agents/<id>`.
 */
export function runtimeBaseOfA2AUrl(url: string): string {
  return url
    .replace(/\/api\/v1\/a2a\/agents\/[^/]+\/?$/, '')
    .replace(/\/+$/, '');
}

/**
 * The sandbox of the runtime a peer answers from, read again each time
 * `refresh` changes (when a turn ends, it may have started one). Until the
 * runtime says, or when it does not answer, the peer's sandbox is offered
 * as not running, with the runtime it would be on.
 */
export function usePeerSandbox(
  a2aUrl: string,
  refresh?: unknown,
): AssistantSandbox {
  const serverUrl = runtimeBaseOfA2AUrl(a2aUrl);
  const [sandbox, setSandbox] = useState<AssistantSandbox>({
    kind: 'runtime',
    status: 'not running',
    serverUrl,
  });
  useEffect(() => {
    let current = true;
    fetch(`${serverUrl}/api/v1/configure/codemode/status`)
      .then(response => (response.ok ? response.json() : null))
      .then((status: { sandbox?: Record<string, unknown> | null } | null) => {
        if (!current) {
          return;
        }
        setSandbox(
          assistantSandboxOf(status?.sandbox, { serverUrl }) ?? {
            kind: 'runtime',
            status: 'not running',
            serverUrl,
          },
        );
      })
      .catch(() => {
        if (current) {
          setSandbox({ kind: 'runtime', status: 'unreachable', serverUrl });
        }
      });
    return () => {
      current = false;
    };
  }, [serverUrl, refresh]);
  return sandbox;
}
