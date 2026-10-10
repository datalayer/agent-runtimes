/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `app-elements` — what an application's code opens beside the
 * conversation (LOOP P-18): `session.show(..., where="panel")` a side panel,
 * `where="page"` a page of its own over the workspace, each closed by the
 * code (`session.close`) or by the person. Inline, an element is a message,
 * which the chat draws (P-04); this plugin draws the other two.
 *
 * The chat keeps what is open (`chat/base/loopElement`), from the session
 * API's `loop.element` events; this plugin draws it from the workspace's
 * root slot, positioned against the workspace, so that nothing is laid out
 * while nothing is open.
 *
 * @module apps/plugins/app-elements
 */

import { definePlugin, type ReactorPlugin } from '@datalayer/reactor';
import { clearLoopElements } from '../../../chat/base/loopElement';
import { LoopSlots } from '../../core';
import { AppElements } from './AppElements';

export const APP_ELEMENTS_PLUGIN_NAME = '@datalayer/loop-plugin-app-elements';

/** The plugin that draws an application's side panel and pages. */
export const AppElementsPlugin = definePlugin({
  name: APP_ELEMENTS_PLUGIN_NAME,
  displayName: 'Side panel and pages',
  description:
    'What an application opens beside the conversation: a side panel, or a page of its own.',
  octicon: 'sidebar-expand',
  build: () => ({
    components: [
      {
        id: 'app-elements',
        slot: LoopSlots.root,
        Component: AppElements as never,
      },
    ],
  }),
  // A workspace that goes takes what it had open with it.
  register: () => clearLoopElements,
}) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;

export { AppElements, APP_PANEL_WIDTH, elementsByPlace } from './AppElements';
export default AppElementsPlugin;
