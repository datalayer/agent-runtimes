/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Who the next prompt goes to.
 *
 * An icon rather than a labelled control, because a team of two does not earn
 * a segmented control in a header that already carries the sandbox, the model
 * and the status. The overlay is where the names live, and a check says which
 * one is listening.
 *
 * The supervisor is marked rather than hidden. It is the team's front door and
 * the default, and a person who picks somebody else should be able to see what
 * they moved away from.
 *
 * @module loop/plugins/agents/TeamMemberPicker
 */

import { useState } from 'react';
import { ActionList, AnchoredOverlay, IconButton, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';
import { useSignalValue } from '@datalayer/reactor/react';

import type { TeamSelection } from './team';
import { useOptionalTeamSelection } from './useTeamSelection';

export function TeamMemberPicker(): JSX.Element | null {
  const selection = useOptionalTeamSelection();

  // No team, or a team of one: there is nothing to choose between, and a
  // control that opens onto a single option is furniture. Returning before the
  // inner component means its hooks are never called conditionally.
  if (!selection || selection.members.length < 2) {
    return null;
  }
  return <TeamMemberMenu selection={selection} />;
}

function TeamMemberMenu({
  selection,
}: {
  selection: TeamSelection;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedId = useSignalValue(selection.selected);
  const active = selection.members.find(member => member.id === selectedId);

  return (
    <AnchoredOverlay
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      renderAnchor={anchorProps => (
        <IconButton
          // Primer types the anchor's `aria-labelledby` and `IconButton`'s
          // `aria-label` as mutually exclusive, and the overlay supplies the
          // former. Dropped rather than fought: the label below says more
          // than an id pointing at an icon would.
          {...(anchorProps as Record<string, unknown>)}
          aria-labelledby={undefined}
          icon={AiAgentIcon}
          aria-label={
            active
              ? `Talking to ${active.name}. Choose another agent.`
              : 'Choose an agent'
          }
          variant="invisible"
          size="small"
        />
      )}
    >
      <ActionList selectionVariant="single">
        <ActionList.GroupHeading as="h3">
          {selection.team.name}
        </ActionList.GroupHeading>
        {selection.members.map(member => (
          <ActionList.Item
            key={member.id}
            selected={member.id === selectedId}
            onSelect={() => {
              selection.select(member.id);
              setOpen(false);
            }}
          >
            <ActionList.LeadingVisual>
              <Text aria-hidden>{member.emoji ?? '🤖'}</Text>
            </ActionList.LeadingVisual>
            <Box
              as="span"
              sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
            >
              {member.name}
              {member.isSupervisor ? (
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>supervisor</Text>
              ) : null}
            </Box>
            {member.description ? (
              <ActionList.Description variant="block">
                {member.description}
              </ActionList.Description>
            ) : null}
          </ActionList.Item>
        ))}
      </ActionList>
    </AnchoredOverlay>
  );
}

export default TeamMemberPicker;
