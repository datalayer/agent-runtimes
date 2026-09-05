/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The trial clock, in the chat's own header.
 *
 * Contributed by this plugin rather than drawn by the chat, for the same
 * reason the sandbox selector is: only the plugin that owns where the agent
 * runs can say whether the visitor's key is being spent at all. On a
 * server-backed agent it is not — that runtime holds credentials of its own
 * and never saw the key — so a countdown there would be a clock on nothing.
 *
 * It reads the shared session and never starts one. The chat is what mints the
 * key, because the chat is what sends it; a header badge that could mint one
 * would start the visitor's minute the moment the workspace painted, whether
 * or not they ever asked the agent anything.
 *
 * @module loop/plugins/agents/AnonymousKeyBadge
 */

import type { JSX } from 'react';
import { Box, Text } from '@primer/react';

/* Both by file rather than through their barrels. The barrels reach the
   sign-in form and the whole in-page harness, and a plugin that only draws a
   countdown should not put either in the graph of every host that mounts
   it. */
import { AnonymousKeyTimer } from '../../../components/anonymous/AnonymousKeyTimer';
import {
  useAnonymousSession,
  useAnonymousSessionStore,
} from '../../../runtimes/browser/anonymousToken';
import type { LoopWorkspaceContext } from '../../core';
import { targetRunsAgentInPage, type SandboxTarget } from './switchable';

/**
 * The same badge, dressed for the workspace header's trailing cluster.
 *
 * Flex `order` rather than registration order: the agents plugin registers
 * before the editor selector, so in document order the badge sat on the
 * *leading* side of the selector's `marginLeft: 'auto'`. `1` puts it past
 * that margin, right beside the full-screen icon (which says `2`) — the
 * clock reads as chrome about the session, and the trailing corner is where
 * that lives.
 */
export function AnonymousKeyHeaderBadge({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element {
  return (
    <Box sx={{ order: 1, display: 'inline-flex', alignItems: 'center' }}>
      <AnonymousKeyBadge workspace={workspace} />
    </Box>
  );
}

export function AnonymousKeyBadge({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const session = useAnonymousSession();
  const target = (workspace.sandbox.target as SandboxTarget) ?? 'local';

  // Not this agent's business. A runtime authenticates itself, and whether
  // some other part of the page holds a trial key is not something this
  // conversation should be reporting.
  if (!targetRunsAgentInPage(target)) {
    return null;
  }

  /*
   * Nothing to show at either end.
   *
   * `idle` is a signed-in member, who is on no clock at all; `expired` is
   * covered by the panel that takes over the conversation, which says
   * considerably more than a spent ring would.
   */
  if (session.status === 'idle' || session.status === 'expired') {
    return null;
  }

  // Before a key lands there is no clock to draw yet — only which way it went.
  if (!session.expiresAt) {
    return (
      <Text
        sx={{ fontSize: 0, color: session.error ? 'danger.fg' : 'fg.muted' }}
        title={session.error}
      >
        {session.error ? 'No trial key' : 'Getting a trial key…'}
      </Text>
    );
  }

  return (
    <AnonymousKeyTimer
      expiresAt={session.expiresAt}
      grantedMs={session.grantedMs}
      // The countdown recomputes from the wall clock, so it notices the moment
      // has passed even where the store's own timer was throttled — a
      // backgrounded tab, a laptop that slept. Whichever gets there first
      // wins; the second call is a no-op.
      onExpire={() => useAnonymousSessionStore.getState().expire()}
    />
  );
}

export default AnonymousKeyBadge;
