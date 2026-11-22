/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-locked-ui` — the agent's UI that needs the
 * person's own connection, drawn locked for an anonymous visitor (the user,
 * 14–15 November 2026: "if tools/features are not available, indicate it
 * visually so user is tempted to sign up / sign in", then "the marketer is
 * not showing the login button that should be injected via the reactor
 * plugin system in the header").
 *
 * One group in the chat's title bar (`header`): a chip per locked UI —
 * *Sign in to LinkedIn*, *Sign in to link X, Bluesky*, *Sign in to post on
 * X* — each with a lock, each running the visitor's sign-in as the host said
 * (`onSignIn`, `signInUrl`, else Datalayer's sign-in page). It calls no IAM
 * nor runtime route: a visitor has no token. What each chip says is its
 * `AGENT_UI_PLUGINS` entry's `locked` (`apps/agentUiPlugins`, `lockedUiOf`).
 *
 * @module apps/plugins/locked-ui
 */

import type { JSX } from 'react';
import { Button } from '@primer/react';
import { LockIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { PluginRef } from '@datalayer/reactor';
import {
  useAnonymousChat,
  useAnonymousSignIn,
} from '../../../chat/anonymous/AnonymousChat';
import {
  ANONYMOUS_WORDS,
  type ChatAnonymous,
} from '../../../chat/anonymous/anonymousMode';
import { defineChromePlugin } from '../../toolCards/chrome';

export const LOCKED_UI_PLUGIN_NAME = '@datalayer/agent-plugin-locked-ui';

const NO_ANONYMOUS: ChatAnonymous = {};

/** The locked chips: each says what signing in opens, and signs in. */
export function LockedUiChips({
  labels,
}: {
  labels: readonly string[];
}): JSX.Element | null {
  const state = useAnonymousChat();
  // Outside an anonymous chat's provider (`Chat`): Datalayer's sign-in page.
  const fallback = useAnonymousSignIn(NO_ANONYMOUS);
  const signIn = state?.signIn ?? fallback;
  if (labels.length === 0) {
    return null;
  }
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      gap={1}
      flexWrap="wrap"
      data-locked-ui=""
    >
      {labels.map(label => (
        <Button
          key={label}
          size="small"
          variant="invisible"
          leadingVisual={LockIcon}
          title={ANONYMOUS_WORDS.lockedWhy}
          onClick={signIn}
          data-locked-ui-chip={label}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}

/** The plugin drawing these locked chips in the chat's title bar. */
export function lockedUiPlugin(labels: readonly string[]): PluginRef {
  const shown = [...labels];
  return defineChromePlugin({
    id: 'locked-ui',
    displayName: 'Locked features',
    description:
      'The agent’s features that need an account, drawn locked for a visitor: each signs in.',
    octicon: 'lock',
    emoji: '\u{1F512}',
    Component: () => <LockedUiChips labels={shown} />,
  })('header');
}

export default lockedUiPlugin;
