/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `app-elements` — what an application's code opens beside the
 * conversation (P-18): `session.show(..., where="panel")` a side panel,
 * `where="page"` a page of its own over the workspace, each closed by the
 * code (`session.close`) or by the person. Inline, an element is a message,
 * which the chat draws (P-04); this plugin draws the other two.
 *
 * The chat keeps what is open (`chat/base/loopElement`), from the session's
 * ui socket (RU-3, RU-W); this plugin draws it from the
 * workspace's root slot, positioned against the workspace, so that nothing
 * is laid out while nothing is open. It also contributes the renderer of
 * what the code asks (`QuestionView`, RU-4), drawn under the message that
 * asks it.
 *
 * @module apps/plugins/app-elements
 */

import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { Renderers } from '@datalayer/reactor/ui';
import { defineRenderer } from '@datalayer/reactor/ui/react';
import { clearLoopElements } from '../../../chat/base/loopElement';
import { LoopSlots } from '../../core';
import { AppElements } from './AppElements';
import { QUESTION_DISPLAY_TYPE, QuestionView } from './QuestionView';

export const APP_ELEMENTS_PLUGIN_NAME = '@datalayer/loop-plugin-app-elements';

/** The plugin that draws an application's side panel and pages. */
export const AppElementsPlugin = definePlugin({
  name: APP_ELEMENTS_PLUGIN_NAME,
  displayName: 'Side panel and pages',
  description:
    'What an application opens beside the conversation: a side panel, or a page of its own.',
  octicon: 'sidebar-expand',
  contributes: [
    contribution(
      Renderers,
      defineRenderer({ type: QUESTION_DISPLAY_TYPE, component: QuestionView }),
      { id: 'app-elements:question' },
    ),
  ],
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
export {
  QUESTION_DISPLAY_TYPE,
  QuestionView,
  questionOf,
} from './QuestionView';
export default AppElementsPlugin;
