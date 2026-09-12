/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Who answers, shown inside the prompt.
 *
 * The same choice `AgentsMenu` offers under the prompt, drawn as a chip above
 * where the typing goes. Two places for one control is deliberate: the footer
 * is where a person goes to *change* things, and this says who they are
 * addressing while they write it — the question a half-typed message raises,
 * answered without leaving the box.
 *
 * `Inline` is the naming for anything drawn inside the prompt rather than in
 * the bar beneath it.
 *
 * @module chat/prompt/menus/InlineAgentsMenu
 */

import type { JSX } from 'react';
import { Text, Button, ActionMenu, ActionList, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';

import type { FooterAgent } from '../../../types';

export function InlineAgentsMenu({
  agents,
  selectedAgentId,
  onSelectAgent,
}: {
  agents: FooterAgent[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
}): JSX.Element {
  const active = agents.find(agent => agent.id === selectedAgentId);
  const ActiveIcon = active?.icon ?? AiAgentIcon;
  const label = [
    active ? `Answering: ${active.name}` : 'Choose an agent',
    `${agents.length} available`,
  ].join(' · ');

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        {/* The icon alone. The name is one hover away and the strip above the
            typing is the last place on screen to spend width on a label. */}
        <Tooltip text={label} direction="s">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={label}
            leadingVisual={ActiveIcon}
            sx={{ px: 1, color: 'fg.muted' }}
          >
            <Text sx={{ fontSize: 0 }}>{agents.length}</Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-bottom" align="start" width="large">
        {/* Bounded, and the descriptions wrap inside it: `ActionList.Description`
            lays one out on a single line and lets the overlay grow to hold it. */}
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

export default InlineAgentsMenu;
