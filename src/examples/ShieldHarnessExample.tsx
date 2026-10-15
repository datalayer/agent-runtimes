/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A coding agent behind the Shield, in the web chat (SHIELD §4.3, SH-16; SH-23).
 *
 * The chat talks AG-UI to a local runtime whose agent is a harness: what the
 * agent changed is drawn as a **diff** in the file's language, what it ran
 * as a **terminal** with its output, through the `shield-displays` plugin
 * the Loop preset mounts (here, registered on its own); an action a rule
 * asks first about waits in the chat's approval banner, answered there.
 *
 * It needs the local runtime with a harness, which this page does not
 * start. From agent-runtimes' `examples/shield`:
 *
 *     python harness_on_the_runtime.py --serve
 *
 * serves the fake agent (no model, no key) as the agent `chat` on
 * http://127.0.0.1:8765, its workspace a fresh directory; with
 * `--harness claude-code` and a funded `ANTHROPIC_API_KEY`, Claude Code
 * instead. The openers below are the fake agent's words: `edit` writes
 * `hello.txt` (do it, shown as a diff), `run echo hello` asks first (the
 * banner), `outside` reads outside the workspace (refused in a sentence).
 *
 * @module examples/ShieldHarnessExample
 */

import React, { useEffect, useMemo } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { ThemedProvider } from './utils/themedProvider';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { Chat } from '../chat';
import { createShieldDisplaysPlugin } from '../apps/plugins/shield-displays';
import {
  SHIELD_HARNESS_AGENT,
  SHIELD_HARNESS_OPENERS,
} from './shield/shieldHarness';

const ShieldHarnessExample: React.FC = () => {
  const baseUrl = resolveExampleAgentRuntimesUrl('local');
  // The diff and terminal renderers, registered for the chat to resolve
  // `_meta["reactor.ui/display"]` with — what the Loop preset does.
  const reactor = useMemo(
    () => buildReactorFromPlugins([createShieldDisplaysPlugin() as never]),
    [],
  );
  useEffect(() => {
    reactor.start();
    registerReactor(reactor);
    return () => registerReactor(null);
  }, [reactor]);
  return (
    <ThemedProvider>
      <Box display="flex" flexDirection="column" height="100vh" minHeight={0}>
        <Box p={3} borderBottom="1px solid" borderColor="border.default">
          <Text as="p" sx={{ m: 0, fontSize: 1, color: 'fg.muted' }}>
            Needs the local runtime with a harness:{' '}
            <code>
              python examples/shield/harness_on_the_runtime.py --serve
            </code>{' '}
            (the fake agent on {baseUrl}, no key).
          </Text>
        </Box>
        <Box flex={1} minHeight={0}>
          <Chat
            protocol="ag-ui"
            baseUrl={baseUrl}
            agentId={SHIELD_HARNESS_AGENT}
            title="A coding agent behind the Shield"
            description="Its changes as diffs, its commands as terminals, what a rule asks first in the banner."
            showToolApprovalBanner
            suggestions={SHIELD_HARNESS_OPENERS}
            height="100%"
          />
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default ShieldHarnessExample;
