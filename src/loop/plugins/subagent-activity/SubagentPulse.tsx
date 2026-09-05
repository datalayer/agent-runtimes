/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The pulse: a delegated agent's icon, fading in and out in the prompt's
 * header band for as long as that agent is working.
 *
 * Read from the agent runtime store, which both the server's monitoring
 * stream and the in-page loop fill with the same events — so the pulse does
 * not care where the delegation runs. The icon is the member's own when the
 * name is a team member's, and the generic agent mark otherwise; the tooltip
 * says who it is.
 *
 * @module loop/plugins/subagent-activity/SubagentPulse
 */

import type { JSX } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import {
  useAgentRuntimeActiveSubagentToolCallId,
  useAgentRuntimeSubagentActivity,
} from '../../../stores';
import { agentIcon } from '../agents/agentIcons';
import { AGENTS_PLUGIN_NAME, type AgentsOutput } from '../agents/plugin';

export const PULSE_ANIMATION = 'loop-subagent-pulse';

const KEYFRAMES = `@keyframes ${PULSE_ANIMATION} {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}`;

export function SubagentPulse(): JSX.Element | null {
  const activeKey = useAgentRuntimeActiveSubagentToolCallId();
  const events = useAgentRuntimeSubagentActivity(activeKey ?? undefined);
  // Optional: the pulse may be drawn where no reactor runs, and then it
  // simply has no team to look the icon up in.
  const reactor = useOptionalReactorPlatform();
  const name = events[0]?.subagentName ?? activeKey ?? '';
  const member = reactor
    ?.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)
    ?.team?.members.find(entry => entry.name === name);
  const Icon = agentIcon(member?.icon);

  if (!activeKey) {
    return null;
  }

  const label = `${name} is working…`;
  return (
    <>
      <style>{KEYFRAMES}</style>
      <Tooltip text={label} direction="n">
        {/* A button, because Primer's tooltip wants something interactive
            to describe — and a pulse a person can focus and read is better
            than one they cannot. It does nothing when pressed. */}
        <Box
          as="button"
          type="button"
          aria-label={label}
          data-subagent-pulse={name}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            p: 0,
            border: 0,
            bg: 'transparent',
            color: 'accent.fg',
            cursor: 'default',
            animation: `${PULSE_ANIMATION} 1.4s ease-in-out infinite`,
          }}
        >
          <Icon size={16} />
        </Box>
      </Tooltip>
    </>
  );
}

export default SubagentPulse;
