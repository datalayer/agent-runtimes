/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentSubagentsExample
 *
 * Multi-agent delegation with the in-repo subagents capability. The
 * orchestrator runs on the local agent-runtimes server, created there by the
 * Loop from the `example-subagents` blueprint; its researcher and writer are
 * subagents inside its process, each run in an isolated child run.
 *
 * - The chat is the demonstration: no notebook or document beside it
 * - The sidebar keeps the live run in view and lists the subagents the spec
 *   declares, badged "Running" while a delegation to one is going
 */

/// <reference types="vite/client" />

import React, { useMemo } from 'react';
import { Text, Spinner, Heading, Label, Timeline } from '@primer/react';
import { PeopleIcon, PersonIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { AgentSubagentsPlugin } from '../loop/plugins/agent-subagents';
import { SubagentChatPanel } from '../chat/messages/ChatMessageList';
import {
  useAgentRuntimeActiveSubagentToolCallId,
  useAgentRuntimeRunningSubagentNames,
} from '../stores';
import { getAgentspecs } from '../specs/agents';
import type { SubAgentspecConfig } from '../types/agentspecs';

const LOOP_PLUGINS_AGENTSUB = [AgentSubagentsPlugin];

const AGENT_NAME = 'subagents-example-agent';
const AGENTSPEC_ID = 'example-subagents';

/** The subagents the orchestrator can delegate to, from its spec. */
const declaredSubagents = (): readonly SubAgentspecConfig[] =>
  getAgentspecs(AGENTSPEC_ID)?.subagents?.subagents ?? [];

/** Fixed height (px) for the active-subagent chat viewport. */
const ACTIVE_PANEL_HEIGHT = 280;

/**
 * Shows the currently active (running) subagent and its streamed messages.
 * Falls back to a placeholder when no subagent is active.
 */
const ActiveSubagentPanel: React.FC = () => {
  const activeToolCallId = useAgentRuntimeActiveSubagentToolCallId();
  return (
    <Box
      sx={{
        p: 3,
        borderBottom: '1px solid',
        borderColor: 'border.default',
      }}
    >
      <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
        Active Subagent
      </Heading>
      {activeToolCallId ? (
        <SubagentChatPanel
          toolCallId={activeToolCallId}
          height={ACTIVE_PANEL_HEIGHT}
        />
      ) : (
        <Box
          sx={{
            height: ACTIVE_PANEL_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid',
            borderColor: 'border.muted',
            borderRadius: 2,
            bg: 'canvas.subtle',
          }}
        >
          <Text sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
            No active Subagent
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * The subagents the spec declares, each badged "Running" while a delegation
 * to it is going, so the roster answers "who is working right now" without
 * reading the active panel.
 */
const SubagentRoster: React.FC<{
  subagents: readonly SubAgentspecConfig[];
}> = ({ subagents }) => {
  const running = useAgentRuntimeRunningSubagentNames();
  return (
    <Timeline>
      {subagents.map(sa => {
        const isRunning = running.includes(sa.name);
        return (
          <Timeline.Item
            key={sa.name}
            data-subagent-roster={sa.name}
            data-subagent-running={isRunning ? 'true' : undefined}
          >
            <Timeline.Badge>
              <PersonIcon />
            </Timeline.Badge>
            <Timeline.Body>
              <Box
                sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>{sa.name}</Text>
                {isRunning ? (
                  <>
                    <Spinner size="small" />
                    <Label variant="accent" size="small">
                      Running
                    </Label>
                  </>
                ) : null}
              </Box>
              <Text
                as="p"
                sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}
              >
                {sa.description}
              </Text>
            </Timeline.Body>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
};

const AgentSubagentsExample: React.FC = () => {
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const subagents = useMemo(declaredSubagents, []);

  return (
    <ThemedProvider>
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            flexShrink: 0,
          }}
        >
          <PeopleIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
            Subagents Demo
          </Heading>
          <Label variant="accent">local</Label>
          <Label variant="accent">
            {subagents.length} subagent{subagents.length === 1 ? '' : 's'}
          </Label>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* The Loop creates the orchestrator on the Local target from the
                capacity plugin's blueprint, the way the hooks and A2A examples
                do; an agent made by hand for another transport answers the
                Loop's AG-UI calls with Not Found. The agent-target switch
                stays visible: with it hidden the Loop pins the agent to the
                page, and delegation happens on the server. */}
            <LoopEmbed
              serverUrl={resolveExampleAgentRuntimesUrl('local')}
              target="local"
              showAgentVariants
              agentId={agentName}
              // The chat alone: delegation is the point here, and a notebook
              // or a document beside it would only invite the wrong request.
              editors={false}
              showHeader
              plugins={LOOP_PLUGINS_AGENTSUB}
            />
          </Box>

          <Box
            sx={{
              width: 320,
              borderLeft: '1px solid',
              borderColor: 'border.default',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
            }}
          >
            <ActiveSubagentPanel />

            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
                Available Subagents
              </Heading>
              <SubagentRoster subagents={subagents} />
            </Box>

            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
                Delegation Tools
              </Heading>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                  {
                    name: 'delegate_task',
                    desc: 'Run a named subagent on a task and return its answer',
                    icon: PeopleIcon,
                  },
                ].map(tool => (
                  <Box
                    key={tool.name}
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <tool.icon size={14} />
                    <Box>
                      <Text
                        sx={{
                          fontSize: 1,
                          fontWeight: 'bold',
                          fontFamily: 'mono',
                        }}
                      >
                        {tool.name}
                      </Text>
                      <Text
                        as="p"
                        sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 0 }}
                      >
                        {tool.desc}
                      </Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box sx={{ p: 3 }}>
              <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
                How It Works
              </Heading>
              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                The orchestrator agent delegates tasks to specialised subagents
                using the <code>delegate_task</code> tool. Each subagent runs in
                an isolated child run with its own model and instructions.
              </Text>
              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 0 }}>
                Token and request usage from each delegation is forwarded to the
                parent run, so budget limits stay accurate across delegation.
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default AgentSubagentsExample;
