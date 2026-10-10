/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's code in the page's sandbox (STUDIO E-11): the tool its
 * agent runs its code with when it turns in the page — `execute_code`,
 * Python in this browser — and its documents put there before its first run
 * (`browserSandbox`).
 *
 * Handed to the agent only while the sandbox is the browser's: on a runtime
 * the agent has a sandbox of its own, and a tool of the page would be a
 * second one beside it. `AppRenderer` adds the plugin for an application
 * whose agent computes in code (`runsCodeInSandbox`).
 *
 * @module apps/apps/AppBrowserSandbox
 */

import { definePlugin } from '@datalayer/reactor';
import type { AppSpec } from '../../types/agentspecs';
import { LoopFrontendTool } from '../core';
import {
  AGENTS_PLUGIN_NAME,
  AgentsPlugin,
  type AgentsOutput,
} from '../plugins/agents';
import { browserCodeTool } from './browserSandbox';

export const APP_BROWSER_SANDBOX_PLUGIN_NAME =
  '@datalayer/loop-plugin-app-browser-sandbox';

/**
 * The plugin, for one application. Made once per application — a new plugin
 * rebuilds the workspace.
 */
export function defineAppBrowserSandboxPlugin(
  app: Pick<AppSpec, 'id' | 'name' | 'samples'>,
) {
  return definePlugin({
    name: `${APP_BROWSER_SANDBOX_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: its code in the browser`,
    description: `What ${app.name} computes, run in Python in this browser when it turns in the page.`,
    octicon: 'code',
    emoji: '\u{1F40D}',
    // The sandbox is the Agents plugin's: built first, read here.
    dependencies: [AgentsPlugin],
    register({ contribute, reactor }) {
      const sandbox =
        reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)?.sandbox;
      if (!sandbox) {
        return;
      }
      // One tool for the life of the workspace: its documents are put in the
      // kernel once, before its first run.
      const tool = browserCodeTool(app, code => sandbox.execute(code));
      return contribute(
        LoopFrontendTool,
        {
          id: `app-browser-sandbox-${app.id}`,
          tools: workspace =>
            workspace.sandbox.target === 'browser' ? [tool] : [],
          // It changes no editor: kept in the chat view and beside a page.
          chatView: true,
        },
        { id: `app-browser-sandbox-${app.id}` },
      );
    },
  });
}
