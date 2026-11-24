/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-side-panels` — the agent opens and closes the
 * workspace's side panels (the user, 18 November 2026: "the agent can open,
 * close and fill them through frontend tools"). Two frontend tools of the
 * `side-panels` set, run in the page:
 *
 * - `open_side_panel({side, tab?})`: opens the `left` or the `right` panel,
 *   optionally on a contribution named by its visible tab or stable id —
 *   refused in a sentence when nothing is placed there or the name is not;
 * - `close_side_panel({side})`: closes it.
 *
 * What fills a panel is the UI placed there and its own tools (the deck's,
 * the sheet's); what is open is the conversation's, read from these calls by
 * the shell (`apps/shell/SidePanel`), so a conversation opened again shows
 * its panels as they stood. Each call is a line in the conversation.
 *
 * @module apps/plugins/side-panels
 */

import type { JSX } from 'react';
import { SidebarExpandIcon } from '@primer/octicons-react';
import type { ToolCallRenderContext } from '../../../types/chat';
import type { FrontendToolDefinition } from '../../../types/tools';
import { CallLine, cardRole, toolOf } from '../../pageTools/cards';
import {
  CLOSE_SIDE_PANEL,
  OPEN_SIDE_PANEL,
  SIDE_PANELS_SHOWN,
  SIDE_PANEL_SIDES,
  type SidePanelSide,
} from '../../shell/SidePanel';
import { defineToolCardPlugin } from '../../toolCards/kit';

export const SIDE_PANELS_PLUGIN_NAME = '@datalayer/agent-plugin-side-panels';

export const SIDE_PANELS_TOOL_NAMES = [OPEN_SIDE_PANEL, CLOSE_SIDE_PANEL];

export const SIDE_PANELS_WORDS = {
  opened: (side: string, tab?: string) =>
    `Opened the ${side} panel${tab ? ` on ${tab}` : ''}`,
  closed: (side: string) => `Closed the ${side} panel`,
  writing: 'Changing a side panel…',
  noSide: `Say which panel: "side" is "left" or "right".`,
  empty: (side: string) =>
    `Nothing is placed in the ${side} panel of this chat: it was not opened.`,
  noTab: (side: string, tab: string, offered: readonly string[]) =>
    `There is no tab named "${tab}" in the ${side} panel. Choose one of: ${offered.join(', ')}.`,
} as const;

const SIDE_PARAMETER = {
  type: 'object',
  properties: {
    side: {
      type: 'string',
      enum: [...SIDE_PANEL_SIDES],
      description: 'Which panel: left (beside the start of the chat) or right.',
    },
  },
  required: ['side'],
  additionalProperties: false,
};

const OPEN_PARAMETERS = {
  ...SIDE_PARAMETER,
  properties: {
    ...SIDE_PARAMETER.properties,
    tab: {
      type: 'string',
      description:
        'Optional visible tab name or stable component id to show, exactly as the panel offers it.',
    },
  },
};

const sideOf = (args: Record<string, unknown>): SidePanelSide => {
  if (!SIDE_PANEL_SIDES.includes(args.side as SidePanelSide)) {
    throw new Error(SIDE_PANELS_WORDS.noSide);
  }
  return args.side as SidePanelSide;
};

/** The two tools, checked in the page. */
export function sidePanelsTools(): FrontendToolDefinition[] {
  return [
    {
      name: OPEN_SIDE_PANEL,
      description:
        'Opens a side panel of the chat, left or right, to show the person what is placed there (the deck, the sheet, what you set). When it has several tabs, name the tab to show by its visible name or component id. It runs in the page and changes nothing else. Open it when what it shows helps the person now; they can close it.',
      parameters: OPEN_PARAMETERS,
      handler: async args => {
        const side = sideOf(args);
        if (SIDE_PANELS_SHOWN[side].length === 0) {
          throw new Error(SIDE_PANELS_WORDS.empty(side));
        }
        const asked = typeof args.tab === 'string' ? args.tab.trim() : '';
        const named = asked.toLocaleLowerCase();
        const tab = asked
          ? SIDE_PANELS_SHOWN[side].find(
              candidate =>
                candidate.id.toLocaleLowerCase() === named ||
                candidate.label.toLocaleLowerCase() === named,
            )
          : undefined;
        if (asked && !tab) {
          throw new Error(
            SIDE_PANELS_WORDS.noTab(
              side,
              asked,
              SIDE_PANELS_SHOWN[side].map(candidate => candidate.label),
            ),
          );
        }
        return { side, open: true, ...(tab ? { tab: tab.id } : {}) };
      },
      summaryOf: args =>
        SIDE_PANELS_WORDS.opened(
          String(args.side),
          typeof args.tab === 'string' ? args.tab : undefined,
        ),
    },
    {
      name: CLOSE_SIDE_PANEL,
      description:
        'Closes a side panel of the chat, left or right. It runs in the page and changes nothing else.',
      parameters: SIDE_PARAMETER,
      handler: async args => ({ side: sideOf(args), open: false }),
      summaryOf: args => SIDE_PANELS_WORDS.closed(String(args.side)),
    },
  ];
}

/** A call, as a line in the conversation. */
export function SidePanelCallCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const tool = toolOf(context, SIDE_PANELS_TOOL_NAMES);
  const side = String(context.args?.side ?? '');
  const tab =
    typeof context.args?.tab === 'string' ? context.args.tab : undefined;
  return (
    <CallLine icon={SidebarExpandIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? SIDE_PANELS_WORDS.writing
        : tool === OPEN_SIDE_PANEL
          ? SIDE_PANELS_WORDS.opened(side, tab)
          : SIDE_PANELS_WORDS.closed(side)}
    </CallLine>
  );
}

export const SidePanelsPlugin = defineToolCardPlugin({
  id: 'side-panels',
  displayName: 'Side panels',
  description:
    'The agent opens and closes the chat’s left and right panels, with tools run in the page.',
  octicon: 'sidebar-expand',
  emoji: '\u{1F5C2}\u{FE0F}',
  tools: SIDE_PANELS_TOOL_NAMES,
  Card: SidePanelCallCard,
  frontendTools: sidePanelsTools(),
});

export default SidePanelsPlugin;
