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

import { type ReactNode, useMemo } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state';
import { Chat } from '../chat';
import { useAgentRuntimes } from '../hooks/useAgentRuntimes';
import { getAgentspecs } from '../specs';
import type { AgentConfig } from '../types/config';
import type { Protocol, Suggestion } from '../types';

/**
 * Props for {@link AgentRuntimeChat}.
 */
export interface AgentRuntimeChatProps {
  /** Agentspec id to launch, e.g. `gallery-analyze-excel-spreadsheet`. */
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
}: AgentRuntimeChatProps) {
  const { token } = useIAMStore();
  const spec = useMemo(() => getAgentspecs(agentSpecId), [agentSpecId]);

  const { runtime, isReady, endpoint, error } = useAgentRuntimes({
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

  // The chat is "launching" whenever we intend to launch but no live endpoint
  // is ready yet (covers connecting, launching, and agent-creation phases).
  const launching = launch && !error && (!isReady || !endpoint);
  const launchingError = launch ? error : null;
  const runtimeBaseUrl = runtime?.agentBaseUrl || null;
  const runtimeAgentId = runtime?.agentId || 'default';

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
  if (launch && isReady && endpoint) {
    return (
      <Chat
        {...commonChatProps}
        baseUrl={runtimeBaseUrl || endpoint}
        agentId={runtimeAgentId}
        runtimeId="default"
        authToken={authToken}
        historyEndpoint={`${runtimeBaseUrl || endpoint}/api/v1/history`}
        showTokenUsage
        autoFocus
      />
    );
  }

  // Launching (or gated by `launch=false`): show the plain shell disabled with
  // a spinner overlay, or an explicit overlay (e.g. sign-in) when provided.
  return (
    <Chat
      {...commonChatProps}
      disableInputPrompt
      launching={launching}
      launchingMessage={`Launching your ${resolvedTitle} agent…`}
      overlay={overlay}
    />
  );
}

export default AgentRuntimeChat;
