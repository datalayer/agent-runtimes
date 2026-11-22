/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-limited-preview` — an anonymous visitor's limited
 * preview, as one indicator beside the composer's controls, and the page
 * tools that read and mark it (the user, 20 November 2026: "Don't show
 * 'Limited preview: …' as a separated box … create a reactor plugin that will
 * add an indicator on the number of remaining turns … make sure the
 * agent/app has frontend tools to update the indicator").
 *
 * - The indicator (`AgentSlots.promptStatus`, the composer's footer, usable
 *   while the composer is closed):
 *   *Limited preview · 7/10 turns today*, opening onto what signing in keeps,
 *   what is disabled, and *Sign in* (`LimitedPreviewIndicator`).
 * - Two frontend tools, offered with the chat's extras like every page tool
 *   (`preview_status`, `preview_indicator_update`; `preview`): the runtime
 *   sees them as `external`, so a visitor's agent may call them.
 *
 * Each plugin holds its own board (`PreviewBoard`), handed to its indicator
 * and its tools: nothing of it is the page's.
 *
 * Mounted by the preset for a visitor only (`runAsAnonymous`), with the
 * names of what the visitor does not get of the agent's UI (`disabledUiOf`).
 *
 * @module apps/plugins/limited-preview
 */

import type { JSX } from 'react';
import { EyeIcon } from '@primer/octicons-react';
import type { PluginRef } from '@datalayer/reactor';
import type { ToolCallRenderContext } from '../../../types/chat';
import { AgentSlots } from '../../core';
import { CallLine, cardRole, toolOf } from '../../pageTools/cards';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { LimitedPreviewIndicator } from './LimitedPreviewIndicator';
import {
  LIMITED_PREVIEW_TOOL_NAMES,
  LIMITED_PREVIEW_WORDS,
  PREVIEW_STATUS,
  PreviewBoard,
  limitedPreviewTools,
} from './preview';

export const LIMITED_PREVIEW_PLUGIN_NAME =
  '@datalayer/agent-plugin-limited-preview';

/** A call, as a line in the conversation. */
export function LimitedPreviewCallCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const tool = toolOf(context, LIMITED_PREVIEW_TOOL_NAMES);
  const note =
    typeof context.args?.note === 'string' ? context.args.note.trim() : '';
  return (
    <CallLine icon={EyeIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? LIMITED_PREVIEW_WORDS.reading
        : tool === PREVIEW_STATUS
          ? LIMITED_PREVIEW_WORDS.read
          : LIMITED_PREVIEW_WORDS.updated(note)}
    </CallLine>
  );
}

/** The plugin, for a visitor: the indicator naming what is disabled, and its tools. */
export function limitedPreviewPlugin(disabled: readonly string[]): PluginRef {
  const named = [...disabled];
  // This chat's own: two anonymous embeds on a page never share a preview.
  const board = new PreviewBoard();
  function Indicator(): JSX.Element | null {
    return <LimitedPreviewIndicator disabled={named} board={board} />;
  }
  return defineToolCardPlugin({
    id: 'limited-preview',
    displayName: 'Limited preview',
    description:
      'An anonymous visitor’s limited preview: the turns left today beside the composer, what signing in keeps, and page tools for the agent to read and mark it.',
    octicon: 'eye',
    emoji: '\u{1F441}\u{FE0F}',
    tools: LIMITED_PREVIEW_TOOL_NAMES,
    Card: LimitedPreviewCallCard,
    frontendTools: limitedPreviewTools(board),
    components: [
      {
        // Beside the composer's controls, outside its disabled region: once
        // no turn is left, it still opens onto the refusal and Sign in.
        slot: AgentSlots.promptStatus,
        id: 'limited-preview-indicator',
        Component: Indicator as never,
      },
    ],
  });
}

export { LimitedPreviewIndicator } from './LimitedPreviewIndicator';
export * from './preview';
export default limitedPreviewPlugin;
