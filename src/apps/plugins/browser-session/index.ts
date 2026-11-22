/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-browser-session` — a person's own browser session
 * for an MCP server that reads through one, signed in from the chat (the
 * user, 15 November 2026: "for linkedin, we need to use the embedded browser
 * with the mcp server to allow full access").
 *
 * It contributes *Sign in to LinkedIn* to the chat's title bar
 * (`AgentSlots.chatHeader`; `Chat`'s `browserSessions` draws the same button), drawn only when the runtime's agents use the
 * linkedin server and it holds no live session, never for an anonymous
 * visitor (who gets *Sign in to LinkedIn* locked instead, signing them in to
 * Datalayer: `locked-ui`). The button opens the runtime's own browser at LinkedIn's login,
 * in a dialog; *Done* keeps the session on that runtime, for that server
 * alone (`agent_runtimes.mcp.browser_session`).
 *
 * @module apps/plugins/browser-session
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { AgentSlots } from '../../core';
import { BrowserSessionSlot } from './BrowserSessionButton';
import { uiManifestOf } from '../../uiManifest';

export const BROWSER_SESSION_PLUGIN_NAME =
  '@datalayer/agent-plugin-browser-session';

export const BrowserSessionPlugin = definePlugin({
  name: BROWSER_SESSION_PLUGIN_NAME,
  ...uiManifestOf('browser-session'),
  build() {
    return {
      components: [
        {
          slot: AgentSlots.chatHeader,
          id: 'browser-session-linkedin',
          Component: BrowserSessionSlot as never,
        },
      ],
    };
  },
}) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;

export {
  BrowserSessionButton,
  BrowserSessionDialog,
  BrowserSessionSlot,
} from './BrowserSessionButton';
export * from './browserSession';
export default BrowserSessionPlugin;
