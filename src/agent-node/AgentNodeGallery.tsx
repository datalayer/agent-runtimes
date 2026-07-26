/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Heading, Label, Spinner, Text } from '@primer/react';
import { CheckCircleFillIcon, RocketIcon } from '@primer/octicons-react';

/**
 * A single agent specification returned by ``GET /api/v1/agents/library``.
 * Only the fields consumed by the gallery cards are typed here.
 */
export type AgentspecSummary = {
  id: string;
  version?: string;
  name?: string;
  description?: string;
  tags?: string[];
  enabled?: boolean;
  model?: string;
  inference_provider?: string;
  icon?: string;
  emoji?: string;
  color?: string;
};

/** A currently-registered/running agent from ``GET /api/v1/agents``. */
type RunningAgent = {
  agent_id?: string;
  id?: string;
  agent_spec_id?: string;
  name?: string;
};

export type AgentNodeGalleryProps = {
  /** Base URL of the local Agent Runtimes server. */
  baseUrl: string;
  /** Bearer token used for authenticated requests. */
  token?: string | null;
  /** Id of the agent currently marked active on the node, if any. */
  activeAgentId?: string | null;
  /** Called with the launched agent id once it is running and set active. */
  onLaunched: (agentId: string) => void;
  /** Optional callback used by parent to display launch errors (e.g. toast). */
  onLaunchError?: (message: string) => void;
};

const GRID_TEMPLATE = ['1fr', '1fr 1fr', '1fr 1fr 1fr'];

/**
 * Agent gallery picker shown on the Agent Node.
 *
 * Sources cards from the agentspec library and highlights the agent that is
 * already running on the node. Launching a card creates the agent locally and
 * marks it active so tunneled prompts from the main UI reach it.
 */
export function AgentNodeGallery({
  baseUrl,
  token,
  activeAgentId,
  onLaunched,
  onLaunchError,
}: AgentNodeGalleryProps): JSX.Element {
  const [specs, setSpecs] = useState<AgentspecSummary[]>([]);
  const [running, setRunning] = useState<RunningAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [libraryResponse, agentsResponse] = await Promise.all([
        fetch(`${baseUrl}/api/v1/agents/library`, { headers: authHeaders }),
        fetch(`${baseUrl}/api/v1/agents`, { headers: authHeaders }),
      ]);
      if (!libraryResponse.ok) {
        throw new Error(
          `Failed to load agent library (${libraryResponse.status})`,
        );
      }
      const libraryPayload = await libraryResponse.json().catch(() => null);
      const nextSpecs: AgentspecSummary[] = Array.isArray(libraryPayload)
        ? libraryPayload
        : libraryPayload?.agents || libraryPayload?.items || [];
      setSpecs(nextSpecs);

      if (agentsResponse.ok) {
        const agentsPayload = await agentsResponse.json().catch(() => null);
        const nextRunning: RunningAgent[] = Array.isArray(agentsPayload)
          ? agentsPayload
          : agentsPayload?.agents || agentsPayload?.items || [];
        setRunning(nextRunning);
      }
    } catch (reason: any) {
      setError(reason?.message || 'Unable to load agents.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const runningBySpec = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of running) {
      const agentId = agent.agent_id || agent.id;
      if (agent.agent_spec_id && agentId) {
        map.set(agent.agent_spec_id, agentId);
      }
    }
    return map;
  }, [running]);

  const launch = useCallback(
    async (spec: AgentspecSummary) => {
      setLaunchingId(spec.id);
      setError(null);
      try {
        // Reuse the already-running agent for this spec when present so we do
        // not spawn duplicates on the node.
        let agentId = runningBySpec.get(spec.id) || null;
        if (!agentId) {
          const requestedName = spec.id;
          const createResponse = await fetch(`${baseUrl}/api/v1/agents`, {
            method: 'POST',
            headers: authHeaders,
            // Keep local node launches aligned with the working examples:
            // POST /api/v1/agents requires `name` and optionally agent_spec_id.
            body: JSON.stringify({
              name: requestedName,
              agent_spec_id: spec.id,
            }),
          });
          if (!createResponse.ok && createResponse.status === 409) {
            // If the named agent already exists, reload running agents and try
            // to reuse the matching instance instead of failing the launch.
            const reloadResponse = await fetch(`${baseUrl}/api/v1/agents`, {
              headers: authHeaders,
            });
            if (reloadResponse.ok) {
              const reloadPayload = await reloadResponse
                .json()
                .catch(() => null);
              const nextRunning: RunningAgent[] = Array.isArray(reloadPayload)
                ? reloadPayload
                : reloadPayload?.agents || reloadPayload?.items || [];
              setRunning(nextRunning);
              const existing = nextRunning.find(candidate => {
                const candidateId = candidate.agent_id || candidate.id || '';
                return (
                  candidate.agent_spec_id === spec.id ||
                  candidate.name === requestedName ||
                  candidateId === requestedName
                );
              });
              agentId = existing?.agent_id || existing?.id || null;
            }
          }
          if (!createResponse.ok && !agentId) {
            throw new Error(
              `Failed to launch agent (${createResponse.status})`,
            );
          }
          if (!agentId && createResponse.ok) {
            const createPayload = await createResponse.json().catch(() => null);
            agentId =
              createPayload?.agent_id ||
              createPayload?.id ||
              createPayload?.agent?.agent_id ||
              createPayload?.agent?.id ||
              null;
          }
        }
        if (!agentId) {
          throw new Error('Launch did not return an agent id.');
        }
        const activeResponse = await fetch(
          `${baseUrl}/api/v1/agent-node/active-agent`,
          {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ agent_id: agentId }),
          },
        );
        if (!activeResponse.ok) {
          throw new Error(
            `Failed to set active agent (${activeResponse.status})`,
          );
        }
        onLaunched(agentId);
      } catch (reason: any) {
        const message = reason?.message || 'Unable to launch agent.';
        setError(message);
        onLaunchError?.(message);
      } finally {
        setLaunchingId(null);
      }
    },
    [authHeaders, baseUrl, onLaunched, onLaunchError, runningBySpec],
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Heading as="h2" sx={{ fontSize: 3, mb: 1 }}>
          Choose an agent
        </Heading>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Pick an agent from the gallery to launch it on this node. The active
          agent handles prompts sent directly to the node and through the
          Datalayer platform.
        </Text>
      </Box>

      {error && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: 2,
            bg: 'danger.subtle',
            color: 'danger.fg',
            fontSize: 1,
          }}
        >
          {error}
        </Box>
      )}

      {specs.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            color: 'fg.muted',
          }}
        >
          No agents are available in the library yet.
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: GRID_TEMPLATE,
            gap: 3,
          }}
        >
          {specs.map(spec => {
            const isActive =
              !!activeAgentId &&
              runningBySpec.get(spec.id) === activeAgentId;
            const isLaunching = launchingId === spec.id;
            const isRunning = runningBySpec.has(spec.id);
            return (
              <Box
                key={spec.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  p: 3,
                  border: '1px solid',
                  borderColor: isActive ? 'success.emphasis' : 'border.default',
                  borderRadius: 2,
                  bg: 'canvas.default',
                  transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                  ':hover': {
                    boxShadow: 'shadow.medium',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      fontSize: 3,
                      bg: 'canvas.subtle',
                    }}
                  >
                    {spec.emoji || '🤖'}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Heading
                      as="h3"
                      sx={{
                        fontSize: 2,
                        mb: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {spec.name || spec.id}
                    </Heading>
                    {spec.version && (
                      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                        v{spec.version}
                      </Text>
                    )}
                  </Box>
                  {isActive && (
                    <Label
                      variant="success"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
                    >
                      <CheckCircleFillIcon size={12} />
                      Active
                    </Label>
                  )}
                </Box>

                {spec.description && (
                  <Text
                    sx={{
                      color: 'fg.muted',
                      fontSize: 1,
                      mb: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {spec.description}
                  </Text>
                )}

                {spec.tags && spec.tags.length > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      mb: 3,
                    }}
                  >
                    {spec.tags.slice(0, 4).map(tag => (
                      <Label key={tag} size="small" variant="secondary">
                        {tag}
                      </Label>
                    ))}
                  </Box>
                )}

                <Box sx={{ mt: 'auto', pt: 1 }}>
                  <Button
                    variant={isActive ? 'default' : 'primary'}
                    leadingVisual={RocketIcon}
                    block
                    disabled={isLaunching}
                    onClick={() => void launch(spec)}
                  >
                    {isActive
                      ? 'Open chat'
                      : isLaunching
                        ? 'Launching…'
                        : isRunning
                          ? 'Set active'
                          : 'Launch'}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default AgentNodeGallery;
