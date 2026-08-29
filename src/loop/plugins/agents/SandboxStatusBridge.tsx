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
 * @module loop/plugins/agents/SandboxStatusBridge
 */

import { useEffect } from 'react';
import { useSignalValue } from '@datalayer/reactor/react';
import type { LoopWorkspaceContext } from '../../core';
import {
  IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  IDLE_SANDBOX_TARGET_SIGNAL,
} from '../../core';
import { useOptionalSandboxService } from './useSandboxService';

export function SandboxStatusBridge({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const service = useOptionalSandboxService();
  const snapshot = useSignalValue(
    service?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );
  // Watched as a signal so a switch re-renders this bridge, and carried into
  // the snapshot so it re-renders everyone reading the workspace.
  const target = useSignalValue(service?.target ?? IDLE_SANDBOX_TARGET_SIGNAL);
  const { setSandbox, agentId } = workspace;

  useEffect(() => service?.connect(agentId), [service, agentId]);

  useEffect(() => {
    if (service) {
      setSandbox({ ...snapshot, target });
    }
  }, [service, snapshot, target, setSandbox]);

  return null;
}
