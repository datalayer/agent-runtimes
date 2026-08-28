/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Keeping the workspace told about the sandbox.
 *
 * The service owns the connection; this only carries what it learns into the
 * workspace context, where the `canOpen` gates can see it. It lives in a slot
 * rather than inside a view, because the sandbox does not stop existing when
 * someone switches to the chat tab.
 *
 * Deliberately imports nothing heavier than the reactor's React bridge: this
 * module is reached from the plugin's entry point, so anything it pulls in
 * lands in the shell's bundle.
 *
 * @module loop/plugins/code-sandbox/SandboxStatusBridge
 */

import { useEffect } from 'react';
import { useSignalValue } from '@datalayer/reactor/react';
import type { LoopWorkspaceContext } from '../../core';
import { useOptionalSandboxService } from './useSandboxService';

export function SandboxStatusBridge({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const service = useOptionalSandboxService();
  const snapshot = useSignalValue(
    service?.snapshot ?? FALLBACK_SNAPSHOT,
  );
  const { setSandbox, agentId } = workspace;

  useEffect(() => service?.connect(agentId), [service, agentId]);

  useEffect(() => {
    if (service) {
      setSandbox(snapshot);
    }
  }, [service, snapshot, setSandbox]);

  return null;
}

/** Read when the plugin is absent, so the hook order never changes. */
const FALLBACK_SNAPSHOT = {
  value: { state: 'idle' as const },
  peek: () => ({ state: 'idle' as const }),
} as never;
