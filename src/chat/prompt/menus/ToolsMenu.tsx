/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the agent may call besides its MCP servers: the runtime's tools and
 * the frontend tools (the ones the page runs), each drawn with its mark. The
 * MCP servers, their tools and codemode are switched in their own overlay
 * (`EquipmentMenu`), the one the composer's MCP dot opens too.
 *
 * @module chat/prompt/menus/ToolsMenu
 */

import { Text, Button, ActionMenu, ActionList, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ToolsIcon } from '@primer/octicons-react';

import type { BuiltinTool } from '../../../types';
import {
  SpecMark,
  hasMark,
  marksOfFrontendTool,
  marksOfRuntimeTool,
  type Marks,
} from '../../marks';

/**
 * A tool's mark, as the leading visual of its row: on the name's line.
 *
 * Called as a function, never drawn as a component of its own: `ActionList.Item`
 * places a leading visual by finding `ActionList.LeadingVisual` among its
 * direct children, and one wrapped in a component of ours was not found —
 * drawn in the label instead, the mark on one line and the name under it.
 */
function leadingMark(marks: Marks, fallback = false) {
  return hasMark(marks) || fallback ? (
    <ActionList.LeadingVisual>
      {hasMark(marks) ? (
        <SpecMark icon={marks.icon} emoji={marks.emoji} size={16} />
      ) : (
        <ToolsIcon size={16} aria-hidden="true" />
      )}
    </ActionList.LeadingVisual>
  ) : null;
}

export function ToolsMenu({
  availableTools,
  availableFrontendTools = [],
}: {
  availableTools: BuiltinTool[];
  /** The frontend tools: the ones the page runs for the agent. */
  availableFrontendTools?: BuiltinTool[];
}) {
  /*
   * A count, not a word.
   *
   * Four labelled buttons on one row is most of the width of a chat panel, and
   * the icon already says which menu this is. What the word was carrying — the
   * name, and what is behind it — moves to the tooltip, where it costs nothing
   * until somebody asks.
   */
  const summary = [
    `${availableTools.length} tool${availableTools.length === 1 ? '' : 's'}`,
    availableFrontendTools.length > 0
      ? `${availableFrontendTools.length} frontend tool${availableFrontendTools.length === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={`Tools — ${summary}`} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={`Tools — ${summary}`}
            leadingVisual={ToolsIcon}
          >
            <Text sx={{ fontSize: 0 }}>
              {availableTools.length + availableFrontendTools.length}
            </Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box maxHeight="60vh" overflowY="auto">
          <ActionList>
            {/*
              The tools the agent actually has. Not togglable — they are what
              the agent was built with, or what this page handed it — so they
              are stated rather than offered.
            */}
            {availableTools.length > 0 ? (
              <ActionList.Group title="Tools">
                {availableTools.map(tool => (
                  <ActionList.Item key={tool.id} disabled>
                    {leadingMark(marksOfRuntimeTool(tool.name))}
                    {tool.name}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            ) : null}

            {/*
              The frontend tools: the ones the page runs, named apart from the
              runtime's, each with the mark of its frontend tool set.
            */}
            {availableFrontendTools.length > 0 ? (
              <ActionList.Group title="Frontend tools">
                {availableFrontendTools.map(tool => (
                  <ActionList.Item key={tool.id} disabled>
                    {leadingMark(marksOfFrontendTool(tool.name), true)}
                    {tool.name}
                    <ActionList.Description variant="block">
                      {tool.description || 'Runs in this page.'}
                    </ActionList.Description>
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            ) : null}

            {availableTools.length + availableFrontendTools.length === 0 ? (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                  No tools
                </Text>
              </ActionList.Item>
            ) : null}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
