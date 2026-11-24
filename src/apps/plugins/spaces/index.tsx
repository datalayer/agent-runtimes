/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-spaces` — the person's Datalayer Spaces beside
 * the conversation (the user, 24 November 2026: "create a datalayer spaces
 * reactor plugin and associated frontend tools to access the spaces"). The
 * agent lists the person's spaces and their documents and notebooks, opens
 * one in a tab of the Spaces panel and saves it back (`tools`); the person
 * does the same from the panel (`SpacesPanel`). Each call is a line in the
 * conversation. Placed in a side panel, `right` by default.
 *
 * @module apps/plugins/spaces
 */

import { lazy, Suspense, type JSX } from 'react';
import { RepoIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import type { AgentWorkspaceContext } from '../../core';
import type { AgentSidePanelProps } from '../../shell/SidePanel';
import { conversationKeyOf } from '../../pageTools/conversationScope';
import { CallLine, cardRole, toolOf } from '../../pageTools/cards';
import {
  defineToolCardPlugin,
  record,
  words,
  type ToolCardPluginOptions,
} from '../../toolCards/kit';
import type { SidePlacement } from '../../toolCards/chrome';
import {
  SPACES_LIST,
  SPACES_OPEN_ITEM,
  SPACES_SAVE_ITEM,
  SPACES_TOOL_NAMES,
  SPACES_WORDS,
  spacesTools,
} from './tools';

export { SPACES_TOOL_NAMES, SPACES_WORDS, spacesTools } from './tools';

export const SPACES_PLUGIN_NAME = '@datalayer/agent-plugin-spaces';
export const SPACES_ID = 'spaces';

const Panel = lazy(() => import('./SpacesPanel'));

function SpacesSidePanel(props: AgentSidePanelProps): JSX.Element {
  // The conversation's open items: the same while the tab is hidden and
  // shown again, others on a new thread or in another workspace on the page.
  const conversation = conversationKeyOf(
    props.workspace as AgentWorkspaceContext | undefined,
  );
  return (
    <Suspense fallback={<Box minHeight={240} aria-busy="true" />}>
      <Panel key={conversation} conversation={conversation} />
    </Suspense>
  );
}

/** What a finished call says, in a line. */
export function spacesCallLine(tool: string, result: unknown): string {
  const answered = record(result) ?? {};
  const total = Number(answered.total ?? 0) || 0;
  if (tool === SPACES_LIST) {
    return SPACES_WORDS.listed(total);
  }
  if (tool === SPACES_OPEN_ITEM) {
    return SPACES_WORDS.opened(words(answered.name));
  }
  if (tool === SPACES_SAVE_ITEM) {
    return SPACES_WORDS.saved(words(answered.name));
  }
  return SPACES_WORDS.listedItems(total, words(answered.type) || undefined);
}

/** A call, as a line in the conversation. */
export function SpacesCallCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const tool = toolOf(context, SPACES_TOOL_NAMES);
  const pending =
    tool === SPACES_OPEN_ITEM
      ? SPACES_WORDS.opening
      : tool === SPACES_SAVE_ITEM
        ? SPACES_WORDS.saving
        : SPACES_WORDS.reading;
  return (
    <CallLine icon={RepoIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending' ? pending : spacesCallLine(tool, context.result)}
    </CallLine>
  );
}

const SPACES: ToolCardPluginOptions = {
  id: SPACES_ID,
  displayName: 'Datalayer Spaces',
  description:
    "The person's Datalayer Spaces: their documents and notebooks listed, opened in tabs of a side panel and saved back, by the agent with frontend tools or by the person.",
  octicon: 'repo',
  emoji: '\u{1F5C3}\u{FE0F}',
  tools: SPACES_TOOL_NAMES,
  Card: SpacesCallCard,
  frontendTools: spacesTools(),
  Panel: SpacesSidePanel,
  panelLabel: 'Spaces',
  panelWidth: 760,
};

export const SpacesPlugin = defineToolCardPlugin(SPACES);

export const spacesSidePlugin = (side: SidePlacement, tab?: string) =>
  defineToolCardPlugin(
    { ...SPACES, ...(tab ? { panelLabel: tab } : {}) },
    side,
  );

export default SpacesPlugin;
