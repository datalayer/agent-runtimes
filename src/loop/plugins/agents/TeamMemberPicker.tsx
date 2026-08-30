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
import { agentIcon } from './agentIcons';
import { useOptionalTeamSelection } from './useTeamSelection';

/** One member's mark, as its spec names it. */
function MemberIcon({ icon }: { icon?: string }): JSX.Element {
  const Icon = agentIcon(icon);
  return <Icon />;
}

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
      // 480px. `AnchoredOverlay` sizes through Primer's `Overlay`, which reads
      // a named width off `data-width-*` — so an `sx` width on the child is
      // not enough on its own, and the box below states the same number from
      // the inside for the case where it loses.
      width="large"
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
      {/* Bounded, and the descriptions wrap inside it.
          `ActionList.Description` lays a description on one line and lets the
          overlay grow to hold it, so a sentence about an agent produced a menu
          wider than the workspace. */}
      {/* Wide enough for a sentence about an agent to wrap two or three times
          rather than ten. `ActionList.Description` lays one out on a single
          line and lets the overlay grow to hold it, so the width is set here
          or by whichever description happens to be longest. */}
      <Box sx={{ width: 440, maxWidth: 'calc(100vw - 16px)' }}>
        {/*
          `role="listbox"`, stated rather than left to default.
          
          Primer decides what a group heading must be from the list's role, and
          throws either way round: with no role it is a plain list and the
          heading *needs* an `as`; with `listbox` or `menu` the heading is
          presentational and an `as` is refused. This overlay is a chooser with
          one selected option at a time, which is a listbox — saying so makes
          the heading below correct instead of correct-by-accident, and stops
          this crashing the moment it opens.
        */}
        <ActionList
          selectionVariant="single"
          role="listbox"
          aria-label={`Agents in ${selection.team.name}`}
        >
          <ActionList.GroupHeading>
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
              {/*
                The agent's own icon, and nothing beside it.

                `selectionVariant="single"` already draws a tick for the
                selected row, so the one added here made two — a check in the
                leading slot and another in the trailing one, for a single
                fact. Primer's is the one to keep: it is the same mark this
                list draws in every other menu.
              */}
              <ActionList.LeadingVisual>
                {/* The octicon its agentspec asked for. An emoji was the same
                    picture for every agent that had not set one, so the column
                    said nothing — and the `@` menu and the footer's chooser
                    both draw the spec's icon, which left this one list
                    disagreeing with the other two about what an agent looks
                    like. */}
                <MemberIcon icon={member.icon} />
              </ActionList.LeadingVisual>
              <Box
                as="span"
                sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                {member.name}
                {member.isSupervisor ? (
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    supervisor
                  </Text>
                ) : null}
              </Box>
              {member.description ? (
                <ActionList.Description
                  variant="block"
                  /* Wrapped and breakable. `minWidth: 0` is the load-bearing
                   one: a grid item defaults to `min-content`, so without it
                   the description refuses to be narrower than its longest
                   unbroken run and pushes the row wide. */
                  sx={{
                    display: 'block',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                  }}
                >
                  {member.description}
                </ActionList.Description>
              ) : null}
            </ActionList.Item>
          ))}
        </ActionList>
      </Box>
    </AnchoredOverlay>
  );
}

export default TeamMemberPicker;
