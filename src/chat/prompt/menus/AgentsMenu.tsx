/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Who answers the next message.
 *
 * @module chat/prompt/menus/AgentsMenu
 */

import { Text, Button, ActionMenu, ActionList, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';

import type { FooterAgent } from '../../../types';

/**
 * Who answers the next message.
 *
 * A `listbox`, stated rather than left to default. Primer decides what a group
 * heading must be from the list's role and throws either way round — with no
 * role a heading needs an `as`, with `listbox` or `menu` it refuses one — so
 * saying what this is keeps the heading correct by construction.
 */
export function AgentsMenu({
  agents,
  selectedAgentId,
  onSelectAgent,
}: {
  agents: FooterAgent[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
}) {
  const active = agents.find(agent => agent.id === selectedAgentId);
  const ActiveIcon = active?.icon ?? AiAgentIcon;
  /* Both facts, because the count alone does not say who is answering and the
     name alone does not say there is a choice. */
  const label = [
    active ? `Agent — ${active.name}` : 'Choose an agent',
    `${agents.length} available`,
  ].join(' · ');

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        {/* The icon alone, like the tools, skills and model beside it. A name
            is the widest thing on this row and it changes width as the agent
            changes, which pushes the whole bar about. */}
        <Tooltip text={label} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={label}
            leadingVisual={ActiveIcon}
          >
            {/* The number, as the tools and skills beside it do it. The name
                stays in the tooltip: it changes width as the agent changes,
                and a count does not. */}
            <Text sx={{ fontSize: 0 }}>{agents.length}</Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        {/* Bounded, and the descriptions wrap inside it: `ActionList.Description`
            lays one out on a single line and lets the overlay grow to hold it,
            so a sentence about an agent produced a menu wider than the chat. */}
        {/* Wide enough for a sentence about an agent to wrap two or three
            times rather than ten. `ActionList.Description` is the reason this
            has to be said at all: it lays a description out on one line and
            lets the overlay grow, so the width is set here or by the longest
            description there happens to be. */}
        <Box sx={{ width: 440, maxWidth: 'calc(100vw - 16px)' }}>
          <ActionList
            selectionVariant="single"
            role="listbox"
            aria-label="Agent"
          >
            {agents.map(agent => (
              <ActionList.Item
                key={agent.id}
                selected={agent.id === selectedAgentId}
                onSelect={() => onSelectAgent?.(agent.id)}
              >
                <ActionList.LeadingVisual>
                  {/* The spec's own icon, like the `@` menu draws. */}
                  {agent.icon ? <agent.icon /> : <AiAgentIcon />}
                </ActionList.LeadingVisual>
                {agent.name}
                {agent.description ? (
                  <ActionList.Description
                    variant="block"
                    /* `minWidth: 0` is the load-bearing one: a grid item
                       defaults to `min-content`, so without it the description
                       refuses to be narrower than its longest unbroken run and
                       pushes the row wide. */
                    sx={{
                      display: 'block',
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                      minWidth: 0,
                    }}
                  >
                    {agent.description}
                  </ActionList.Description>
                ) : null}
              </ActionList.Item>
            ))}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
