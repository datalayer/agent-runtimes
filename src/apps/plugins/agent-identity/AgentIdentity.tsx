/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Who answers, in the chat's title bar: the agent's emoji, its name, and
 * under the name what it does, all from its presentation.
 *
 * Under the name, one line that never wraps: the spec's description where
 * the title bar is wide (its row at least `IDENTITY_WIDE` pixels), held to
 * a share of the row so that the status beside it (*Ready*) and the (i) keep
 * their room, and its one-line tagline where the row is narrower — a phone,
 * a side panel — where a description would show only its first words. Cut
 * short with an ellipsis either way, the whole description on hover
 * (`title`), and the (i) still opens the agent's details.
 *
 * In its own file, loaded lazily: the plugin's module stays a manifest.
 *
 * @module apps/plugins/agent-identity/AgentIdentity
 */

import type { JSX } from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { FluentEmoji } from '@datalayer/core/lib/components/emoji';
import type { AgentWorkspaceContext } from '../../core';
import { presentationOrFail, useWorkspaceAgentId } from './agentOfWorkspace';

/** From this width of the title row, in pixels, the description is drawn in place of the tagline. */
export const IDENTITY_WIDE = 720;

/** One line, cut short with an ellipsis. */
const ONE_LINE = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export function AgentIdentity({
  workspace,
}: {
  workspace?: AgentWorkspaceContext;
}): JSX.Element {
  const agentId = useWorkspaceAgentId(workspace);
  const agent = presentationOrFail(agentId);
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={2}
      minWidth={0}
      flex="0 1 auto"
      data-agent-identity={agent.id}
    >
      <Box
        as="span"
        aria-hidden="true"
        display="inline-flex"
        flexShrink={0}
        lineHeight={1}
      >
        <FluentEmoji emoji={agent.emoji} size={24} label="" />
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        minWidth={0}
        title={agent.description}
      >
        <Heading
          as="h3"
          sx={{
            fontSize: 2,
            fontWeight: 'semibold',
            lineHeight: '20px',
            ...ONE_LINE,
          }}
          data-agent-identity-name=""
        >
          {agent.name}
        </Heading>
        <Text
          as="span"
          sx={{
            ...ONE_LINE,
            fontSize: 0,
            lineHeight: '16px',
            color: 'fg.muted',
            // A share of the row, so the status and the (i) keep their room.
            maxWidth: 'min(72ch, 40cqi)',
            [`@container (max-width: ${IDENTITY_WIDE - 1}px)`]: {
              display: 'none',
            },
          }}
          data-agent-identity-description=""
        >
          {agent.description}
        </Text>
        <Text
          as="span"
          sx={{
            ...ONE_LINE,
            fontSize: 0,
            lineHeight: '16px',
            color: 'fg.muted',
            [`@container (min-width: ${IDENTITY_WIDE}px)`]: {
              display: 'none',
            },
          }}
          data-agent-identity-tagline=""
        >
          {agent.tagline}
        </Text>
      </Box>
    </Box>
  );
}

export default AgentIdentity;
