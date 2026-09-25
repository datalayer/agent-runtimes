/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-subagent-activity` — a delegation, visible.
 *
 * While an agent has handed work to a subagent, that subagent's icon pulses
 * in the composer's own header — the band inside the prompt box, above the
 * text — where a person is looking while they wait. Without it a delegation
 * was a pause: the parent went quiet, and whether anything was happening
 * showed only in a side panel a host may not draw.
 *
 * @module loop/plugins/subagent-activity
 */

import { definePlugin } from '@datalayer/reactor';
import { LoopSlots } from '../../core';
import { InputPromptPlugin } from '../input-prompt';
import { SubagentPulse } from './SubagentPulse';

export const SUBAGENT_ACTIVITY_PLUGIN_NAME =
  '@datalayer/loop-plugin-subagent-activity';

export const SubagentActivityPlugin = definePlugin({
  name: SUBAGENT_ACTIVITY_PLUGIN_NAME,
  displayName: 'Subagent activity',
  description:
    "A delegated agent's icon, pulsing in the prompt's header while it works.",
  octicon: 'people',
  emoji: '\u{1F465}',
  // The band it pulses in is the composer's: no composer, nowhere to be.
  dependencies: [InputPromptPlugin],
  build: () => ({
    components: [
      {
        id: 'subagent-pulse',
        slot: LoopSlots.inpromptMenu,
        // In the prompt's header band, beside the agent chip.
        order: 0,
        Component: SubagentPulse,
      },
    ],
  }),
});

export { SubagentPulse } from './SubagentPulse';
export default SubagentActivityPlugin;
