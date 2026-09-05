// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * AgentRuntimeChat - Generic, full-page chat surface for a live agent runtime.
 *
 * This is the shared component used to render the plain (non-floating) chat
 * view for an agent runtime. It is designed to be reused across the app:
 * - The agent runtime detail page (e.g. `/agents/runtime-...`).
 * - Gallery example pages (e.g. `/gallery/agents/analyze-excel-spreadsheet`).
 *
 * Behaviour:
 * - It launches (or connects to) a runtime from the given `agentSpecId` using
 *   {@link useAgentRuntimes}.
 * - The plain chat shell is shown as soon as possible. While the runtime is
 *   still being created/launched, the input and controls are disabled and a
 *   spinner overlay is shown (via the `launching` prop of {@link Chat}).
 * - When ready, the same shell becomes interactive with the live endpoint.
 * - An optional `overlay` (e.g. a sign-in gate) can be shown on top of the
 *   disabled chat for anonymous users.
 *
 * @module agents/AgentRuntimeChat
 */

import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state';
import { Chat } from '../chat';
import { useAgentRuntimes } from '../hooks/useAgentRuntimes';
import { getAgentspecs } from '../specs';
import type { AgentConfig } from '../types/config';
import type { AgentConnection } from '../types/connection';
import type { Protocol, Suggestion } from '../types';

/**
 * Props for {@link AgentRuntimeChat}.
 */
export interface AgentRuntimeChatProps {
  /** Agentspec id to launch, e.g. `example-analyze-excel-spreadsheet`. */
  agentSpecId: string;
  /** Human-friendly title shown in the chat header. */
  title?: string;
  /** Custom brand icon rendered in the header / empty state. */
  brandIcon?: ReactNode;
  /** Description shown in the empty state. */
  description?: string;
  /** Transport protocol (default: `vercel-ai`). */
  protocol?: Protocol;
  /** Chat height (default: `100%` so it fills the enclosing box). */
  height?: string | number;
  /** Suggestion chips shown in the empty state. */
  suggestions?: Suggestion[];
  /** Optional overlay rendered above the (disabled) chat, e.g. a sign-in gate. */
  overlay?: ReactNode;
  /**
   * When false, the runtime is not launched and the chat renders in a disabled
   * launching state. Useful for anonymous users who must sign in first.
   * @default true
   */
  launch?: boolean;
  /** Show the model selector control (default: true). */
  showModelSelector?: boolean;
  /** Show the tools menu control (default: true). */
  showToolsMenu?: boolean;
  /** Show the skills menu control (default: true). */
  showSkillsMenu?: boolean;
  /** Show the chat header (default: true). */
  showHeader?: boolean;
  /** Show the "powered by" tag (default: false). */
  showPoweredBy?: boolean;
  /** Override the agent config used when creating the agent. */
  agentConfig?: Partial<AgentConfig>;
  /** Optional callback invoked when runtime connection state changes. */
  onRuntimeChange?: (runtime: AgentConnection | null) => void;
}

/**
 * Full-page chat surface for a live agent runtime, with a launching state.
 *
 * @param props - Component props.
 * @returns The rendered chat surface.
 */
export function AgentRuntimeChat({
  agentSpecId,
  title,
  brandIcon,
  description,
  protocol = 'vercel-ai',
  height = '100%',
  suggestions,
  overlay,
  launch = true,
  showModelSelector = true,
  showToolsMenu = true,
  showSkillsMenu = true,
  showHeader = true,
  showPoweredBy = false,
  agentConfig,
  onRuntimeChange,
}: AgentRuntimeChatProps) {
  const { token } = useIAMStore();
  const spec = useMemo(() => getAgentspecs(agentSpecId), [agentSpecId]);

  const { runtime, isReady, endpoint, error, createAgent, isCreating } =
    useAgentRuntimes({
      agentSpecId,
      autoStart: launch,
      autoCreateAgent: launch,
      agentConfig: {
        name: agentSpecId,
        agentSpecId,
        model: spec?.model,
        systemPrompt: spec?.systemPrompt,
        ...agentConfig,
      } as AgentConfig,
    });

  const resolvedTitle = title || spec?.name || 'Agent';
  const authToken = token ?? undefined;

  useEffect(() => {
    onRuntimeChange?.(runtime ?? null);
  }, [onRuntimeChange, runtime]);

  const launchingError = launch ? error : null;
  const runtimeAgentId = runtime?.agentId || '';
  const hasAssignedAgent = runtimeAgentId.trim().length > 0;
  const assignmentAttemptedForRuntimeRef = useRef<string | null>(null);
  const launchStateLogRef = useRef<string>('');
  const isInteractiveReady =
    launch && isReady && !!endpoint && hasAssignedAgent;

  useEffect(() => {
    const runtimeName = String(runtime?.runtimeName || '').trim();

    if (!runtimeName) {
      assignmentAttemptedForRuntimeRef.current = null;
      return;
    }

    if (hasAssignedAgent) {
      assignmentAttemptedForRuntimeRef.current = runtimeName;
      return;
    }

    if (!launch || !isReady || !endpoint || !!error || isCreating) {
      return;
    }

    if (assignmentAttemptedForRuntimeRef.current === runtimeName) {
      return;
    }

    assignmentAttemptedForRuntimeRef.current = runtimeName;
    void createAgent();
  }, [
    runtime?.runtimeName,
    hasAssignedAgent,
    launch,
    isReady,
    endpoint,
    error,
    isCreating,
    createAgent,
  ]);

  useEffect(() => {
    if (!launch) {
      return;
    }

    const state = launchingError
      ? 'error'
      : !isReady || !endpoint
        ? 'waiting-endpoint'
        : !hasAssignedAgent
          ? 'waiting-assignment'
          : 'ready';

    const signature = [
      state,
      String(runtime?.runtimeName || ''),
      String(endpoint || ''),
    ].join('|');
    if (launchStateLogRef.current === signature) {
      return;
    }
    launchStateLogRef.current = signature;

    if (state === 'error') {
      console.error('[AgentRuntimeChat] launch failed', {
        agentSpecId,
        runtimeName: runtime?.runtimeName,
        endpoint,
        error: launchingError,
      });
      return;
    }

    if (state === 'waiting-endpoint') {
      console.info('[AgentRuntimeChat] waiting for runtime endpoint', {
        agentSpecId,
        runtimeName: runtime?.runtimeName,
        isReady,
        endpoint,
      });
      return;
    }

    if (state === 'waiting-assignment') {
      console.info('[AgentRuntimeChat] waiting for agent assignment', {
        agentSpecId,
        runtimeName: runtime?.runtimeName,
        endpoint,
      });
      return;
    }

    console.info('[AgentRuntimeChat] runtime ready', {
      agentSpecId,
      runtimeName: runtime?.runtimeName,
      endpoint,
      agentId: runtimeAgentId,
    });
  }, [
    launch,
    launchStateLogRef,
    launchingError,
    isReady,
    endpoint,
    hasAssignedAgent,
    runtime?.runtimeName,
    runtimeAgentId,
    agentSpecId,
  ]);

  const commonChatProps = {
    protocol,
    useStore: false as const,
    title: resolvedTitle,
    brandIcon,
    description:
      description || spec?.welcomeMessage || 'Ask me to analyse your data.',
    height,
    showHeader,
    showInput: true,
    showModelSelector,
    showToolsMenu,
    showSkillsMenu,
    showPoweredBy,
    suggestions,
    // Show the in-memory ephemeral notebook next to the chat (with a footer
    // toggle to hide it) for agent runtime + gallery surfaces.
    enableEphemeralNotebook: true,
  };

  if (launchingError) {
    return (
      <Box
        sx={{
          p: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'danger.emphasis',
          bg: 'danger.subtle',
          color: 'danger.fg',
        }}
      >
        <Text sx={{ fontWeight: 600 }}>Failed to launch the agent</Text>
        <Text sx={{ display: 'block', mt: 1, fontSize: 1 }}>
          {launchingError}
        </Text>
      </Box>
    );
  }

  // Live and ready: interactive chat wired to the runtime endpoint.
  if (isInteractiveReady) {
    return (
      <Chat
        {...commonChatProps}
        baseUrl={endpoint}
        agentId={runtimeAgentId}
        runtimeId="default"
        authToken={authToken}
        historyEndpoint={`${endpoint}/api/v1/history`}
        showTokenUsage
        autoFocus
      />
    );
  }

  // Strict path: do not mount a live Chat until endpoint + assignment are
  // ready. This avoids default localhost fallback connections in launch states.
  //
  // Anonymous visitors (overlay set) still get the full chat shell — including
  // the ephemeral gallery notebook — rendered disabled underneath, with the
  // centered sign-in gate on top. `autoConnect={false}` keeps it from opening
  // any protocol connection while unauthenticated.
  if (overlay) {
    return <Chat {...commonChatProps} autoConnect={false} overlay={overlay} />;
  }

  return null;
}

export default AgentRuntimeChat;
