/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2A sidebar: the agents the chat's agent reaches over A2A, what each
 * is doing, and the run under way — the same boxed live run the chat shows
 * under the delegation's tool card, kept in view here while the chat scrolls.
 *
 * What it knows comes from two places. The agentspec behind the workspace's
 * agent blueprint declares the subagents with an `a2a` target; the runtime
 * store holds the `agent.subagent` events, and the ones marked
 * `transport: 'a2a'` say where each agent was launched, its card, its task
 * and how far it has got.
 *
 * @module loop/plugins/a2a-sidebar/A2ASidebar
 */

import React, { useMemo } from 'react';
import { Heading, Label, Link, Text, Timeline } from '@primer/react';
import {
  AlertIcon,
  BroadcastIcon,
  CheckCircleIcon,
  CloudIcon,
  DependabotIcon,
  DeviceDesktopIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { useContributions } from '@datalayer/reactor/react';
import { LoopAgentBlueprint, type LoopWorkspaceContext } from '../../core';
import { getAgentspecs } from '../../../specs/agents';
import { SubagentChatPanel } from '../../../chat/messages/ChatMessageList';
import {
  useAgentRuntimeActiveSubagentToolCallId,
  useAgentRuntimeStore,
} from '../../../stores/agentRuntimeStore';
import type { AgentStreamSubagentPayload } from '../../../types/stream';
import type { SubAgentspecConfig } from '../../../types/agentspecs';

/** Fixed height (px) of the live run box. */
export const A2A_ACTIVE_PANEL_HEIGHT = 280;

export type A2ARemoteStatus =
  'idle' | 'launching' | 'working' | 'done' | 'failed';

/** One A2A agent as the sidebar shows it. */
export interface A2ARemoteAgentView {
  name: string;
  description?: string;
  /** The agentspec it is launched from, as `<id>:<version>`. */
  ref?: string;
  /** `local`, `cloud`, `remote`, or the `auto` not yet decided. */
  launch?: string;
  url?: string;
  taskId?: string | null;
  card?: AgentStreamSubagentPayload['agentCard'];
  runtimeUid?: string;
  status: A2ARemoteStatus;
}

type Activity = Record<string, readonly AgentStreamSubagentPayload[]>;

/** Where a remote run stands, from its events. */
export function remoteStatusOf(
  events: readonly AgentStreamSubagentPayload[] | undefined,
): A2ARemoteStatus {
  if (!events || events.length === 0) return 'idle';
  if (events.some(event => event.phase === 'error')) return 'failed';
  if (events.some(event => event.phase === 'end')) return 'done';
  let state: string | undefined;
  for (const event of events) {
    if (event.phase === 'status' && event.state) state = event.state;
  }
  return state === 'launching' ? 'launching' : 'working';
}

/**
 * The A2A agents to show: the ones the spec declares, each with what its
 * latest run said about it, plus any the events name that the spec did not.
 */
export function describeRemoteAgents(
  declared: readonly SubAgentspecConfig[],
  activity: Activity,
): A2ARemoteAgentView[] {
  const views: A2ARemoteAgentView[] = declared
    .filter(subagent => subagent.a2a)
    .map(subagent => ({
      name: subagent.name,
      description: subagent.description,
      ref: subagent.ref,
      launch: subagent.a2a?.launch ?? 'auto',
      url: subagent.a2a?.url,
      status: 'idle' as const,
    }));

  // Runs are keyed by tool call; the ones over A2A, in the order they were
  // opened, so the last run seen for a name is the latest.
  for (const events of Object.values(activity)) {
    const first = events[0];
    if (!first || !events.some(event => event.transport === 'a2a')) continue;
    let view = views.find(entry => entry.name === first.subagentName);
    if (!view) {
      view = { name: first.subagentName, status: 'idle' };
      views.push(view);
    }
    view.status = remoteStatusOf(events);
    for (const event of events) {
      if (event.url) view.url = event.url;
      if (event.launch && event.launch !== 'auto') view.launch = event.launch;
      if (event.taskId) view.taskId = event.taskId;
      if (event.agentCard) view.card = event.agentCard;
      if (event.runtimeUid) view.runtimeUid = event.runtimeUid;
    }
  }
  return views;
}

const STATUS_LABEL: Record<
  A2ARemoteStatus,
  { text: string; variant: 'secondary' | 'accent' | 'success' | 'danger' }
> = {
  idle: { text: 'idle', variant: 'secondary' },
  launching: { text: 'launching', variant: 'accent' },
  working: { text: 'working', variant: 'accent' },
  done: { text: 'done', variant: 'success' },
  failed: { text: 'failed', variant: 'danger' },
};

function StatusBadge({
  status,
}: {
  status: A2ARemoteStatus;
}): React.ReactElement {
  switch (status) {
    case 'done':
      return (
        <Box sx={{ color: 'success.fg', display: 'flex' }}>
          <CheckCircleIcon />
        </Box>
      );
    case 'failed':
      return (
        <Box sx={{ color: 'danger.fg', display: 'flex' }}>
          <AlertIcon />
        </Box>
      );
    case 'launching':
    case 'working':
      return (
        <Box sx={{ color: 'accent.fg', display: 'flex' }}>
          <DependabotIcon />
        </Box>
      );
    default:
      return <BroadcastIcon />;
  }
}

function LaunchChip({
  launch,
}: {
  launch?: string;
}): React.ReactElement | null {
  if (!launch) return null;
  const Icon =
    launch === 'cloud'
      ? CloudIcon
      : launch === 'local'
        ? DeviceDesktopIcon
        : BroadcastIcon;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontSize: 0,
        color: 'fg.muted',
      }}
    >
      <Icon size={12} />
      <Text sx={{ fontSize: 0 }}>{launch}</Text>
    </Box>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
      {children}
    </Heading>
  );
}

export interface A2ASidebarProps {
  /** Forwarded by the shell; unused, the sidebar reads the stores. */
  workspace?: LoopWorkspaceContext;
}

export function A2ASidebar(_props: A2ASidebarProps): React.ReactElement {
  const blueprints = useContributions(LoopAgentBlueprint);
  const specId = blueprints[0]?.value.specId;
  const declared = useMemo<readonly SubAgentspecConfig[]>(
    () => (specId ? (getAgentspecs(specId)?.subagents?.subagents ?? []) : []),
    [specId],
  );
  const activity = useAgentRuntimeStore(state => state.subagentActivity);
  const agents = useMemo(
    () => describeRemoteAgents(declared, activity),
    [declared, activity],
  );
  const activeKey = useAgentRuntimeActiveSubagentToolCallId();
  const activeOverA2A =
    activeKey !== null &&
    (activity[activeKey] ?? []).some(event => event.transport === 'a2a');

  return (
    <Box
      data-a2a-sidebar
      sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <BroadcastIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, m: 0, flex: 1 }}>
          A2A agents
        </Heading>
        <Label variant="accent">{agents.length}</Label>
      </Box>

      <Box>
        <SectionHeading>Running now</SectionHeading>
        {activeKey && activeOverA2A ? (
          <SubagentChatPanel
            toolCallId={activeKey}
            height={A2A_ACTIVE_PANEL_HEIGHT}
          />
        ) : (
          <Box
            data-a2a-sidebar-idle
            sx={{
              height: A2A_ACTIVE_PANEL_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: 'border.muted',
              borderRadius: 2,
              bg: 'canvas.default',
            }}
          >
            <Text sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
              No A2A agent running
            </Text>
          </Box>
        )}
      </Box>

      <Box>
        <SectionHeading>Remote agents</SectionHeading>
        {agents.length === 0 ? (
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
            This agent declares no A2A agents.
          </Text>
        ) : (
          <Timeline>
            {agents.map(agent => {
              const status = STATUS_LABEL[agent.status];
              return (
                <Timeline.Item key={agent.name} data-a2a-agent={agent.name}>
                  <Timeline.Badge>
                    <StatusBadge status={agent.status} />
                  </Timeline.Badge>
                  <Timeline.Body>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        mb: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
                        {agent.name}
                      </Text>
                      <Label variant={status.variant} size="small">
                        {status.text}
                      </Label>
                      <LaunchChip launch={agent.launch} />
                    </Box>
                    {agent.description ? (
                      <Text
                        as="p"
                        sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}
                      >
                        {agent.description}
                      </Text>
                    ) : null}
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        fontSize: 0,
                        color: 'fg.muted',
                      }}
                    >
                      {agent.card?.name ? (
                        <Text sx={{ fontSize: 0 }}>
                          Card: {agent.card.name}
                          {agent.card.version ? ` v${agent.card.version}` : ''}
                        </Text>
                      ) : agent.ref ? (
                        <Text sx={{ fontSize: 0, fontFamily: 'mono' }}>
                          {agent.ref}
                        </Text>
                      ) : null}
                      {agent.url ? (
                        <Link
                          href={`${agent.url}/.well-known/agent-card.json`}
                          target="_blank"
                          rel="noreferrer"
                          sx={{
                            fontSize: 0,
                            fontFamily: 'mono',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                          }}
                          title={agent.url}
                        >
                          {agent.url}
                        </Link>
                      ) : null}
                      {agent.taskId ? (
                        <Text sx={{ fontSize: 0, fontFamily: 'mono' }}>
                          task {agent.taskId}
                        </Text>
                      ) : null}
                      {agent.runtimeUid ? (
                        <Text sx={{ fontSize: 0, fontFamily: 'mono' }}>
                          runtime {agent.runtimeUid}
                        </Text>
                      ) : null}
                    </Box>
                  </Timeline.Body>
                </Timeline.Item>
              );
            })}
          </Timeline>
        )}
      </Box>

      <Box>
        <SectionHeading>How it works</SectionHeading>
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
          The orchestrator delegates with <code>delegate_task</code>, as with
          in-process subagents — but each of these agents is a separate agent
          spoken to over the A2A protocol. On the first delegation it is
          launched from its agentspec: beside the orchestrator on the local
          server, or on a Datalayer runtime when the orchestrator runs in the
          cloud.
        </Text>
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 0 }}>
          The remote run streams back over <code>message/stream</code>: its
          text, its tool calls and results, and the task&apos;s states, shown
          here and in the chat as the run goes.
        </Text>
      </Box>
    </Box>
  );
}

export default A2ASidebar;
