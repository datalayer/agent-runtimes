/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Heading,
  Label,
  Spinner,
  Text,
  TextInput,
} from '@primer/react';
import {
  AgentIcon,
  BeakerIcon,
  BookIcon,
  BugIcon,
  CheckCircleFillIcon,
  CloudIcon,
  CodeIcon,
  CopilotIcon,
  CpuIcon,
  DatabaseIcon,
  DependabotIcon,
  EyeIcon,
  FileIcon,
  GearIcon,
  GitBranchIcon,
  GlobeIcon,
  GraphIcon,
  HeartIcon,
  HomeIcon,
  IssueOpenedIcon,
  LightBulbIcon,
  LinkIcon,
  MailIcon,
  MegaphoneIcon,
  NoteIcon,
  PackageIcon,
  PencilIcon,
  PeopleIcon,
  PlayIcon,
  PlugIcon,
  PulseIcon,
  RocketIcon,
  SearchIcon,
  ShareIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesFillIcon,
  SquirrelIcon,
  StarIcon,
  SyncIcon,
  TableIcon,
  TagIcon,
  TelescopeIcon,
  TerminalIcon,
  ToolsIcon,
  ZapIcon,
  type Icon,
} from '@primer/octicons-react';

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
  /** The chat protocol the spec is written for: ``ag-ui`` or ``vercel-ai``. */
  protocol?: string;
};

/** A currently-registered/running agent from ``GET /api/v1/agents``. */
type RunningAgent = {
  agent_id?: string;
  id?: string;
  agent_spec_id?: string;
  name?: string;
  protocol?: string;
};

/** The transports a node launches agents with, and the chat can speak. */
export type AgentTransport = 'ag-ui' | 'vercel-ai';

/**
 * The transport to launch a spec with: its own when it names one the node
 * can serve, AG-UI otherwise. A spec written for Vercel AI launched as AG-UI
 * answered on an endpoint its chat never called.
 */
export const transportForSpec = (spec: {
  protocol?: string;
}): AgentTransport =>
  spec.protocol === 'vercel-ai' || spec.protocol === 'vercel-ai-jupyter'
    ? 'vercel-ai'
    : 'ag-ui';

export type AgentNodeGalleryProps = {
  /** Base URL of the local Agent Runtimes server. */
  baseUrl: string;
  /** Bearer token used for authenticated requests. */
  token?: string | null;
  /** Id of the agent currently marked active on the node, if any. */
  activeAgentId?: string | null;
  /** Called with the launched agent id once it is running and set active. */
  onLaunched: (agentId: string, protocol: AgentTransport) => void;
  /** Called once the active agent is terminated and cleared on the node. */
  onTerminated?: (agentId: string) => void;
  /** Optional callback used by parent to display launch errors (e.g. toast). */
  onLaunchError?: (message: string) => void;
};

const GRID_TEMPLATE = ['1fr', '1fr 1fr', 'repeat(5, minmax(0, 1fr))'];

const ICON_REGISTRY: Record<string, Icon> = {
  // Primary agentspec icon values.
  agent: AgentIcon,
  database: DatabaseIcon,
  globe: GlobeIcon,
  'git-branch': GitBranchIcon,
  'trending-up': GraphIcon,
  'share-2': ShareIcon,

  // Additional mappings used across the agentspec catalog.
  rocket: RocketIcon,
  sparkles: SparklesFillIcon,
  search: SearchIcon,
  code: CodeIcon,
  cpu: CpuIcon,
  beaker: BeakerIcon,
  book: BookIcon,
  bug: BugIcon,
  cloud: CloudIcon,
  copilot: CopilotIcon,
  dependabot: DependabotIcon,
  eye: EyeIcon,
  file: FileIcon,
  gear: GearIcon,
  graph: GraphIcon,
  heart: HeartIcon,
  home: HomeIcon,
  lightbulb: LightBulbIcon,
  link: LinkIcon,
  mail: MailIcon,
  megaphone: MegaphoneIcon,
  note: NoteIcon,
  package: PackageIcon,
  pencil: PencilIcon,
  people: PeopleIcon,
  play: PlayIcon,
  plug: PlugIcon,
  pulse: PulseIcon,
  'issue-opened': IssueOpenedIcon,
  shield: ShieldIcon,
  'shield-check': ShieldCheckIcon,
  squirrel: SquirrelIcon,
  star: StarIcon,
  sync: SyncIcon,
  table: TableIcon,
  tag: TagIcon,
  telescope: TelescopeIcon,
  terminal: TerminalIcon,
  tools: ToolsIcon,
  zap: ZapIcon,
};

const DEFAULT_ICON = SparklesFillIcon;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function resolveAgentspecIcon(iconId: string | undefined, seed: string): Icon {
  if (iconId) {
    return ICON_REGISTRY[iconId] || DEFAULT_ICON;
  }
  const iconValues = Object.values(ICON_REGISTRY);
  if (iconValues.length === 0) {
    return DEFAULT_ICON;
  }
  return iconValues[hashString(seed) % iconValues.length];
}

/**
 * URL (optionally with `?token=`) of the LOCAL Jupyter server that the node's
 * agents should use as their `jupyter` code sandbox. This mirrors
 * `NotebookAgentExample`: the agent and the chat's ephemeral notebook share the
 * same local Jupyter server directly — no proxy or tunnel is involved. When it
 * is undefined (e.g. SaaS deployments) the launch falls back to the backend's
 * default sandbox configuration.
 */
const LOCAL_JUPYTER_SANDBOX_URL: string | undefined =
  import.meta.env.VITE_JUPYTER_SANDBOX_URL || undefined;

/**
 * Agent gallery picker shown on the Agent Node.
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
        
          // If a same-name agent exists but is not tied to this spec,
          // recreate it so configure/spec lookups and sandbox settings
          // match the selected gallery card.
          if (existing && existing.agent_spec_id !== spec.id) {
            const staleId = String(existing.agent_id || existing.id || '').trim();
            if (staleId) {
              await fetch(
                `${baseUrl}/api/v1/agents/${encodeURIComponent(staleId)}`,
                {
                  method: 'DELETE',
                  headers: authHeaders,
                },
              );
            }
            agentId = null;
          }
        }
 * Sources cards from the agentspec library and highlights the agent that is
 * already running on the node. Launching a card creates the agent locally and
 * marks it active so tunneled prompts from the main UI reach it.
 */
export function AgentNodeGallery({
  baseUrl,
  token,
  activeAgentId,
  onLaunched,
  onTerminated,
  onLaunchError,
}: AgentNodeGalleryProps): JSX.Element {
  const [specs, setSpecs] = useState<AgentspecSummary[]>([]);
  const [running, setRunning] = useState<RunningAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [search, setSearch] = useState('');

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

  const normalizedActiveAgentId = String(activeAgentId || '').trim();

  const activeAgent = useMemo(() => {
    if (!normalizedActiveAgentId) {
      return null;
    }
    return (
      running.find(candidate => {
        const candidateId = String(
          candidate.agent_id || candidate.id || '',
        ).trim();
        return candidateId === normalizedActiveAgentId;
      }) || null
    );
  }, [running, normalizedActiveAgentId]);

  // An "active" agent must be both configured and currently running.
  const hasActiveAgent = Boolean(normalizedActiveAgentId && activeAgent);

  const activeAgentSpec = useMemo(() => {
    if (!activeAgent) {
      return null;
    }
    const directSpecId = String(activeAgent.agent_spec_id || '').trim();
    if (directSpecId) {
      const directMatch = specs.find(spec => spec.id === directSpecId);
      if (directMatch) {
        return directMatch;
      }
    }
    const nameCandidate = String(activeAgent.name || '').trim();
    if (!nameCandidate) {
      return null;
    }
    return specs.find(spec => spec.id === nameCandidate) || null;
  }, [activeAgent, specs]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredSpecs = useMemo(() => {
    if (!normalizedSearch) {
      return specs;
    }
    return specs.filter(spec => {
      const haystack = [
        spec.id,
        spec.name,
        spec.description,
        spec.model,
        spec.inference_provider,
        ...(spec.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [specs, normalizedSearch]);

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
              transport: transportForSpec(spec),
              sandbox_variant: 'jupyter-server',
              sandboxVariant: 'jupyter-server',
              ...(LOCAL_JUPYTER_SANDBOX_URL
                ? { jupyter_sandbox: LOCAL_JUPYTER_SANDBOX_URL }
                : {}),
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

              // If a same-name agent exists but is not tied to this spec,
              // recreate it so configure/spec lookups and sandbox settings
              // match the selected gallery card.
              if (existing && existing.agent_spec_id !== spec.id) {
                const staleId = String(
                  existing.agent_id || existing.id || '',
                ).trim();
                if (staleId) {
                  await fetch(
                    `${baseUrl}/api/v1/agents/${encodeURIComponent(staleId)}`,
                    {
                      method: 'DELETE',
                      headers: authHeaders,
                    },
                  );
                }
                agentId = null;
              }
            }
          }
          if (!createResponse.ok && !agentId) {
            // Conflict with stale same-name agent is handled above by deleting
            // and recreating. Other failures remain hard errors.
            if (createResponse.status !== 409) {
              throw new Error(
                `Failed to launch agent (${createResponse.status})`,
              );
            }
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

          if (!agentId) {
            const recreateResponse = await fetch(`${baseUrl}/api/v1/agents`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                name: requestedName,
                agent_spec_id: spec.id,
                transport: transportForSpec(spec),
                sandbox_variant: 'jupyter-server',
                sandboxVariant: 'jupyter-server',
                ...(LOCAL_JUPYTER_SANDBOX_URL
                  ? { jupyter_sandbox: LOCAL_JUPYTER_SANDBOX_URL }
                  : {}),
              }),
            });
            if (!recreateResponse.ok) {
              throw new Error(
                `Failed to launch agent (${recreateResponse.status})`,
              );
            }
            const recreatePayload = await recreateResponse
              .json()
              .catch(() => null);
            agentId =
              recreatePayload?.agent_id ||
              recreatePayload?.id ||
              recreatePayload?.agent?.agent_id ||
              recreatePayload?.agent?.id ||
              null;
          }
        }
        if (!agentId) {
          throw new Error('Launch did not return an agent id.');
        }

        // Best-effort guard: if spec metadata is missing for this agent id,
        // or if it is not configured with a jupyter sandbox, recreate once
        // from the selected spec so notebook/document chat surfaces can bind
        // a live local kernel.
        const specResponse = await fetch(
          `${baseUrl}/api/v1/configure/agents/${encodeURIComponent(agentId)}/spec`,
          { headers: authHeaders },
        );
        let mustRecreateForSandbox = false;
        if (specResponse.ok) {
          const specPayload = await specResponse.json().catch(() => null);
          const variant = String(
            specPayload?.sandbox_variant || specPayload?.sandboxVariant || '',
          )
            .trim()
            .toLowerCase();
          mustRecreateForSandbox = variant !== 'jupyter-server';
        }
        if (specResponse.status === 404 || mustRecreateForSandbox) {
          await fetch(
            `${baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}`,
            {
              method: 'DELETE',
              headers: authHeaders,
            },
          );
          const recreateResponse = await fetch(`${baseUrl}/api/v1/agents`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              name: spec.id,
              agent_spec_id: spec.id,
              transport: transportForSpec(spec),
              sandbox_variant: 'jupyter-server',
              sandboxVariant: 'jupyter-server',
              ...(LOCAL_JUPYTER_SANDBOX_URL
                ? { jupyter_sandbox: LOCAL_JUPYTER_SANDBOX_URL }
                : {}),
            }),
          });
          if (!recreateResponse.ok) {
            throw new Error(
              `Failed to recreate agent with spec (${recreateResponse.status})`,
            );
          }
          const recreatePayload = await recreateResponse
            .json()
            .catch(() => null);
          agentId =
            recreatePayload?.agent_id ||
            recreatePayload?.id ||
            recreatePayload?.agent?.agent_id ||
            recreatePayload?.agent?.id ||
            null;
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
        onLaunched(agentId, transportForSpec(spec));
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

  const terminateActiveAgent = useCallback(async () => {
    if (!normalizedActiveAgentId) {
      return;
    }
    setTerminating(true);
    setError(null);
    try {
      const deleteResponse = await fetch(
        `${baseUrl}/api/v1/agents/${encodeURIComponent(normalizedActiveAgentId)}`,
        {
          method: 'DELETE',
          headers: authHeaders,
        },
      );
      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        throw new Error(
          `Failed to terminate active agent (${deleteResponse.status})`,
        );
      }

      const clearResponse = await fetch(
        `${baseUrl}/api/v1/agent-node/active-agent`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ agent_id: null }),
        },
      );
      if (!clearResponse.ok) {
        throw new Error(
          `Failed to clear active agent (${clearResponse.status})`,
        );
      }

      setRunning(prev =>
        prev.filter(candidate => {
          const candidateId = String(
            candidate.agent_id || candidate.id || '',
          ).trim();
          return candidateId !== normalizedActiveAgentId;
        }),
      );
      onTerminated?.(normalizedActiveAgentId);
    } catch (reason: any) {
      const message = reason?.message || 'Unable to terminate active agent.';
      setError(message);
      onLaunchError?.(message);
    } finally {
      setTerminating(false);
    }
  }, [
    authHeaders,
    baseUrl,
    normalizedActiveAgentId,
    onTerminated,
    onLaunchError,
  ]);

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
          {hasActiveAgent ? 'Running agent' : 'Choose an agent'}
        </Heading>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          {hasActiveAgent
            ? 'Your node is currently running an active agent. You can terminate it to go back to the gallery.'
            : 'Pick an agent from the gallery to launch it on this node. The active agent handles prompts sent directly to the node and through the Datalayer platform.'}
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

      {hasActiveAgent ? (
        <Box
          sx={{
            p: 4,
            border: '1px solid',
            borderColor: 'accent.muted',
            borderRadius: 2,
            bg: 'accent.subtle',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Label
              variant="secondary"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                color: 'accent.fg',
              }}
            >
              <CheckCircleFillIcon size={12} />
              Active agent
            </Label>
            <Text sx={{ fontWeight: 600 }}>
              {activeAgent?.name ||
                activeAgent?.agent_spec_id ||
                normalizedActiveAgentId}
            </Text>
          </Box>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Chat is enabled while an active agent is running on this node.
            Terminate it to return to the agent cards picker.
          </Text>
          {activeAgentSpec && (
            <Box
              sx={{
                p: 3,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.default',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Label size="small" variant="accent">
                  Spec
                </Label>
                <Text sx={{ fontWeight: 600 }}>
                  {activeAgentSpec.name || activeAgentSpec.id}
                </Text>
                {activeAgentSpec.version && (
                  <Label size="small" variant="secondary">
                    v{activeAgentSpec.version}
                  </Label>
                )}
              </Box>
              {activeAgentSpec.description && (
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {activeAgentSpec.description}
                </Text>
              )}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Label size="small" variant="secondary">
                  id: {activeAgentSpec.id}
                </Label>
                {activeAgentSpec.model && (
                  <Label size="small" variant="secondary">
                    model: {activeAgentSpec.model}
                  </Label>
                )}
                {activeAgentSpec.inference_provider && (
                  <Label size="small" variant="secondary">
                    provider: {activeAgentSpec.inference_provider}
                  </Label>
                )}
                {Array.isArray(activeAgentSpec.tags)
                  ? activeAgentSpec.tags.map(tag => (
                      <Label key={tag} size="small" variant="secondary">
                        {tag}
                      </Label>
                    ))
                  : null}
              </Box>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              variant="danger"
              disabled={terminating}
              onClick={() => void terminateActiveAgent()}
            >
              {terminating ? 'Terminating…' : 'Terminate'}
            </Button>
          </Box>
        </Box>
      ) : specs.length === 0 ? (
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
        <>
          <Box sx={{ mb: 3, maxWidth: 420 }}>
            <TextInput
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Filter agents by name, description, model, or tag..."
              block
            />
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE,
              gap: 3,
            }}
          >
            {filteredSpecs.map(spec => {
              const IconComponent = resolveAgentspecIcon(
                spec.icon,
                spec.name || spec.id,
              );
              const isActive =
                !!activeAgentId && runningBySpec.get(spec.id) === activeAgentId;
              const isLaunching = launchingId === spec.id;
              const isRunning = runningBySpec.has(spec.id);
              const launchLabel = isActive
                ? 'Open chat'
                : isLaunching
                  ? 'Launching…'
                  : isRunning
                    ? 'Set active'
                    : 'Launch';
              return (
                <Box
                  key={spec.id}
                  role="button"
                  tabIndex={isLaunching ? -1 : 0}
                  onClick={() => {
                    if (!isLaunching) {
                      void launch(spec);
                    }
                  }}
                  onKeyDown={event => {
                    if (
                      (event.key === 'Enter' || event.key === ' ') &&
                      !isLaunching
                    ) {
                      event.preventDefault();
                      void launch(spec);
                    }
                  }}
                  aria-label={`${launchLabel} ${spec.name || spec.id}`}
                  aria-busy={isLaunching}
                  aria-disabled={isLaunching}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    textAlign: 'left',
                    cursor: isLaunching ? 'progress' : 'pointer',
                    p: 3,
                    border: '1px solid',
                    borderColor: isActive
                      ? 'success.emphasis'
                      : 'border.default',
                    borderRadius: 2,
                    bg: 'canvas.default',
                    // Hover feedback is border + shadow only. No transform: a
                    // transform here promotes the card to its own layer and makes
                    // the line-clamped description re-rasterize (per-paragraph
                    // motion artifact).
                    transition:
                      'box-shadow 180ms ease, border-color 180ms ease',
                    '&:hover': {
                      boxShadow: 'shadow.medium',
                      borderColor: isActive
                        ? 'success.emphasis'
                        : 'accent.emphasis',
                    },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'accent.fg',
                      outlineOffset: '2px',
                    },
                    '&[aria-disabled="true"]': {
                      opacity: 0.8,
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
                      {spec.emoji ? (
                        <Text sx={{ fontSize: 3, lineHeight: 1 }}>
                          {spec.emoji}
                        </Text>
                      ) : (
                        <IconComponent size={20} />
                      )}
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
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
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
                    <Box
                      as="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: isActive
                          ? 'border.default'
                          : 'accent.muted',
                        bg: isActive ? 'canvas.subtle' : 'accent.subtle',
                        color: isActive ? 'fg.default' : 'accent.fg',
                        fontSize: 1,
                        fontWeight: 600,
                      }}
                    >
                      <IconComponent size={14} />
                      {launchLabel}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
          {filteredSpecs.length === 0 && (
            <Box
              sx={{
                mt: 3,
                p: 3,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
              }}
            >
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                No agents match this filter.
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default AgentNodeGallery;
