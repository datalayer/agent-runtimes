/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent picker: which specialist this session is talking to.
 *
 * The browser half of `/agents use`. Both go through the same endpoint, which
 * goes through `configure-from-spec` — one way to reconfigure a running agent
 * rather than two that can disagree.
 *
 * @module loop/plugins/agents/AgentspecPicker
 */

import { useCallback, useEffect, useState } from 'react';
import { ActionList, ActionMenu, Box, Spinner, Text } from '@primer/react';
import type { LoopWorkspaceContext } from '../../core';

type AgentSummary = {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
};

export function AgentspecPicker({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [switching, setSwitching] = useState(false);
  const [active, setActive] = useState(workspace.agentId);

  // Re-read when the sandbox moves, not only once on mount.
  //
  // Choosing a target can *create* an agent — the Local target brings up the
  // agent whose own Jupyter sandbox backs it — and a list fetched before that
  // happened does not contain it. The indicator then names an agent that is no
  // longer the one in use, which reads as the switch having done nothing.
  const sandboxTarget = workspace.sandbox.target;
  const sandboxState = workspace.sandbox.state;

  useEffect(() => {
    let cancelled = false;
    void fetch(`${workspace.serverUrl}/api/v1/agents`)
      .then(response => (response.ok ? response.json() : { agents: [] }))
      .then(payload => {
        if (!cancelled) {
          setAgents(payload.agents ?? []);
        }
      })
      .catch(() => {
        // A picker that cannot list agents shows the current one and no menu,
        // which is more useful than an error where a name should be.
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.serverUrl, sandboxTarget, sandboxState]);

  // The workspace can be pointed at a different agent while this is mounted —
  // the host re-renders it with a new `agentId` — and a name captured once at
  // mount would go on showing the old one.
  useEffect(() => {
    setActive(workspace.agentId);
  }, [workspace.agentId]);

  const choose = useCallback(
    async (agentId: string) => {
      setSwitching(true);
      try {
        const response = await fetch(
          `${workspace.serverUrl}/api/v1/loop/sessions/${encodeURIComponent(
            workspace.conversationId || workspace.agentId || 'session',
          )}/agent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ agent_id: agentId }),
          },
        );
        if (response.ok) {
          setActive(agentId);
        }
      } finally {
        setSwitching(false);
      }
    },
    [workspace.agentId, workspace.conversationId, workspace.serverUrl],
  );

  const current = agents.find(agent => agent.id === active);
  const label = current?.name || active || 'Agent';

  if (agents.length === 0) {
    return <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {switching ? <Spinner size="small" /> : null}
      <ActionMenu>
        <ActionMenu.Button variant="invisible" size="small">
          {current?.emoji ? `${current.emoji} ` : ''}
          {label}
        </ActionMenu.Button>
        <ActionMenu.Overlay width="medium">
          <ActionList selectionVariant="single">
            {agents.map(agent => (
              <ActionList.Item
                key={agent.id}
                selected={agent.id === active}
                onSelect={() => void choose(agent.id)}
              >
                {agent.emoji ? `${agent.emoji} ` : ''}
                {agent.name || agent.id}
                {agent.description ? (
                  <ActionList.Description variant="block">
                    {agent.description}
                  </ActionList.Description>
                ) : null}
              </ActionList.Item>
            ))}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
    </Box>
  );
}

export default AgentspecPicker;
