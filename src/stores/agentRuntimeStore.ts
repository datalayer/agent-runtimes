/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Unified Zustand store for the agent-runtime layer.
 *
 * Manages three concerns in a single store:
 *
 * 1. **Agent Registry** (persisted) — URL-addressable agents that were
 *    previously connected. Each entry has a `baseUrl` + protocol pair.
 *
 * 2. **Runtime Connection** (ephemeral) — a single currently-connected pod
 *    (launch, connect, create agent, disconnect).
 *
 * 3. **WebSocket Stream** (ephemeral) — monitoring snapshot pushed by the
 *    agent-runtime server over `/api/v1/tool-approvals/ws` (tool approvals,
 *    context, MCP status, cost usage, codemode status, full context).
 *
 * @module stores/agentRuntimeStore
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import {
  persist,
  createJSONStorage,
  subscribeWithSelector,
} from 'zustand/middleware';
import type { ServiceManager } from '@jupyterlab/services';
import type { INotebookContent } from '@jupyterlab/nbformat';
import type { IRuntimeOptions } from '../runtimes/apis';
import type {
  AgentStatus,
  AgentConnection,
  AgentConfig,
  Protocol,
} from '../types';
import type {
  AgentStreamSnapshotPayload,
  AgentStreamToolApprovalPayload,
  CodemodeStatusData,
} from '../types/stream';
import type { ContextSnapshotData } from '../types/context';
import type { McpToolsetsStatusResponse } from '../types/mcp';
import type { LoadedSkillInfo } from '../types/skills';
import type { EphemeralSurfaceMode } from '../types/chat';

// ---------------------------------------------------------------------------
// Agent Registry types
// ---------------------------------------------------------------------------

/**
 * A URL-addressable agent that has been previously connected.
 * May originate from an agent runtime pod OR from the stable agents service.
 */
export interface AgentRegistryEntry {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  protocol: Protocol;
  status: AgentStatus;
  error?: string | null;
  lastUpdated: number;
  documentId?: string;
  runtimeId?: string;
  author?: string;
  avatarUrl?: string;
}

// ---------------------------------------------------------------------------
// WebSocket types
// ---------------------------------------------------------------------------

export type AgentRuntimeWsState = 'closed' | 'connecting' | 'connected';

export interface LocalTokenTurn {
  turnNumber: number;
  timestampMs: number;
  systemPromptTokens: number;
  toolsDescriptionTokens: number;
  userMessageTokens: number;
  aiMessageTokens: number;
  toolsUsageTokens: number;
  totalTokens: number;
}

export interface LocalCostPoint {
  timestampMs: number;
  cumulativeUsd: number;
}

export interface MonitoringCacheEntry {
  tokenTurns: LocalTokenTurn[];
  costPoints: LocalCostPoint[];
}

export function getMonitoringCacheKey(
  serviceName?: string,
  agentId?: string,
): string {
  return `${serviceName || '__unknown_service__'}::${agentId || '__unknown_agent__'}`;
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

export interface AgentRuntimeStoreState {
  // ─── Registry (persisted) ────────────────────────────────────────
  agents: readonly AgentRegistryEntry[];

  // ─── Runtime connection (ephemeral) ──────────────────────────────
  runtime: AgentConnection | null;
  status: AgentStatus;
  error: string | null;
  isLaunching: boolean;

  // ─── WebSocket stream (ephemeral) ────────────────────────────────
  wsState: AgentRuntimeWsState;
  approvals: AgentStreamToolApprovalPayload[];
  pendingApprovalCount: number;
  contextSnapshot: ContextSnapshotData | null;
  costUsage: ContextSnapshotData['costUsage'] | null;
  mcpStatus: McpToolsetsStatusResponse | null;
  codemodeStatus: CodemodeStatusData | null;
  fullContext: Record<string, unknown> | null;
  monitoringCache: Record<string, MonitoringCacheEntry>;
  loadedSkillsByAgentId: Record<string, LoadedSkillInfo[]>;
  ephemeralNotebookModels: Record<string, INotebookContent>;
  /**
   * Persisted in-memory ephemeral document (Lexical) editor states, keyed by
   * document id. The value is a serialized Lexical editor state (JSON string)
   * so the document survives navigation away from and back to a runtime page.
   */
  ephemeralDocumentModels: Record<string, string>;
  /**
   * Persisted companion editor choice (`none` | `notebook` | `document`) keyed
   * by runtime id, so the chosen editor is restored when navigating away from
   * and back to a runtime page.
   */
  editorModeByRuntime: Record<string, EphemeralSurfaceMode>;
}

export interface AgentRuntimeStoreActions {
  // ─── Registry ────────────────────────────────────────────────────
  upsertAgent: (
    agent: Partial<AgentRegistryEntry> & {
      id: string;
      baseUrl: string;
      protocol: Protocol;
    },
  ) => void;
  getAgentById: (id: string) => AgentRegistryEntry | undefined;
  getAgentByUrl: (
    baseUrl: string,
    protocol: Protocol,
  ) => AgentRegistryEntry | undefined;
  updateAgentStatus: (
    id: string,
    status: AgentStatus,
    error?: string | null,
  ) => void;
  toggleAgentStatus: (id: string) => void;
  deleteAgent: (id: string) => void;
  clearAgents: () => void;
  setLoadedSkillsForAgent: (agentId: string, skills: LoadedSkillInfo[]) => void;
  getLoadedSkillsForAgent: (agentId: string) => LoadedSkillInfo[];
  clearLoadedSkillsForAgent: (agentId: string) => void;
  setEphemeralNotebookModel: (
    notebookId: string,
    model: INotebookContent,
  ) => void;
  getEphemeralNotebookModel: (notebookId: string) => INotebookContent | null;
  clearEphemeralNotebookModel: (notebookId: string) => void;
  setEphemeralDocumentModel: (documentId: string, model: string) => void;
  getEphemeralDocumentModel: (documentId: string) => string | null;
  clearEphemeralDocumentModel: (documentId: string) => void;
  setEditorMode: (runtimeId: string, mode: EphemeralSurfaceMode) => void;
  getEditorMode: (runtimeId: string) => EphemeralSurfaceMode | null;

  // ─── Runtime connection ──────────────────────────────────────────
  launchAgent: (options: LaunchAgentOptions) => Promise<AgentConnection>;
  connectAgent: (connection: {
    podName: string;
    environmentName: string;
    serviceManager?: ServiceManager.IManager;
    jupyterBaseUrl?: string;
    kernelId?: string;
  }) => void;
  createAgent: (
    config?: AgentConfig,
  ) => Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>>;
  disconnect: () => void;
  clearError: () => void;
  setError: (error: string) => void;

  // ─── WebSocket stream ────────────────────────────────────────────
  setWsState: (state: AgentRuntimeWsState) => void;
  setWs: (ws: WebSocket | null, agentId?: string) => void;
  applySnapshot: (payload: AgentStreamSnapshotPayload) => void;
  upsertApproval: (approval: AgentStreamToolApprovalPayload) => void;
  removeApproval: (approvalId: string) => void;
  sendDecision: (
    approvalId: string,
    approved: boolean,
    note?: string,
    toolCallId?: string,
    agentId?: string,
  ) => boolean;
  requestRefresh: (agentId?: string) => boolean;
  sendRawMessage: (
    payload: Record<string, unknown>,
    agentId?: string,
  ) => boolean;
  appendLocalTokenTurn: (params: {
    serviceName?: string;
    agentId?: string;
    timestampMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void;
  mergeTokenTurns: (params: {
    serviceName?: string;
    agentId?: string;
    turns: LocalTokenTurn[];
  }) => void;
  appendLocalTokenTurnFull: (params: {
    serviceName?: string;
    agentId?: string;
    timestampMs: number;
    systemPromptTokens: number;
    toolsDescriptionTokens: number;
    userMessageTokens: number;
    aiMessageTokens: number;
    toolsUsageTokens: number;
    totalTokens: number;
  }) => void;
  upsertLocalCostPoint: (params: {
    serviceName?: string;
    agentId?: string;
    timestampMs: number;
    cumulativeUsd: number;
  }) => void;
  mergeCostPoints: (params: {
    serviceName?: string;
    agentId?: string;
    points: LocalCostPoint[];
  }) => void;

  // ─── Reset ───────────────────────────────────────────────────────
  reset: () => void;
  resetWs: () => void;
}

export type AgentRuntimeStore = AgentRuntimeStoreState &
  AgentRuntimeStoreActions;

export interface LaunchAgentOptions extends IRuntimeOptions {
  /** Optional runtimes API base URL override for runtime creation. */
  runtimesUrl?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTransportEndpoint(
  baseUrl: string,
  transport: string,
  agentId: string,
): string {
  switch (transport) {
    case 'vercel-ai':
      return `${baseUrl}/api/v1/vercel-ai/${agentId}`;
    case 'a2a':
      return `${baseUrl}/api/v1/a2a/agents/${agentId}/`;
    case 'acp':
      return `${baseUrl}/api/v1/acp/ws/${agentId}`;
    case 'ag-ui':
    default:
      return `${baseUrl}/api/v1/ag-ui/${agentId}/`;
  }
}

async function createAgentOnRuntime(
  agentBaseUrl: string,
  agentId: string,
  config: AgentConfig = {},
): Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>> {
  if (!config.protocol && !config.agentSpecId) {
    throw new Error(
      'Agent protocol is required. Provide config.protocol from the selected spec/config.',
    );
  }
  const transport = config.protocol || 'vercel-ai';
  if (!config.model && !config.agentSpecId) {
    throw new Error(
      'Agent model is required. Provide config.model from the selected spec/config.',
    );
  }
  const payload: Record<string, unknown> = {
    name: config.name || agentId,
    description: config.description || 'AI assistant',
    agent_library: config.agentLibrary || 'pydantic-ai',
    transport,
    model: config.model,
    system_prompt: config.systemPrompt || 'You are a helpful AI assistant.',
  };

  if (config.agentSpecId) {
    payload.agent_spec_id = config.agentSpecId;
  }
  if (typeof config.enableSkills === 'boolean') {
    payload.enable_skills = config.enableSkills;
  }
  if (Array.isArray(config.tools)) {
    payload.tools = config.tools;
  }
  if (config.inferenceProvider) {
    payload.inferenceProvider = config.inferenceProvider;
  }
  if (typeof config.enableCodemode === 'boolean') {
    payload.enable_codemode = config.enableCodemode;
  }
  if (config.sandboxVariant) {
    payload.sandbox_variant = config.sandboxVariant;
  }
  if (config.jupyterSandbox) {
    payload.jupyter_sandbox = config.jupyterSandbox;
  }

  if (config.createPayload && typeof config.createPayload === 'object') {
    Object.assign(payload, config.createPayload);
  }

  const response = await fetch(`${agentBaseUrl}/api/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.ok || response.status === 400 || response.status === 409) {
    const endpoint = getTransportEndpoint(agentBaseUrl, transport, agentId);
    return { agentId, endpoint, isReady: true };
  }

  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.detail || `Failed to create agent: ${response.status}`,
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialRuntimeState: Pick<
  AgentRuntimeStoreState,
  'runtime' | 'status' | 'error' | 'isLaunching'
> = {
  runtime: null,
  status: 'idle',
  error: null,
  isLaunching: false,
};

const initialWsState: Pick<
  AgentRuntimeStoreState,
  | 'wsState'
  | 'approvals'
  | 'pendingApprovalCount'
  | 'contextSnapshot'
  | 'costUsage'
  | 'mcpStatus'
  | 'codemodeStatus'
  | 'fullContext'
  | 'monitoringCache'
  | 'loadedSkillsByAgentId'
> = {
  wsState: 'closed',
  approvals: [],
  pendingApprovalCount: 0,
  contextSnapshot: null,
  costUsage: null,
  mcpStatus: null,
  codemodeStatus: null,
  fullContext: null,
  monitoringCache: {},
  loadedSkillsByAgentId: {},
};

const initialNotebookState: Pick<
  AgentRuntimeStoreState,
  'ephemeralNotebookModels' | 'ephemeralDocumentModels' | 'editorModeByRuntime'
> = {
  ephemeralNotebookModels: {},
  ephemeralDocumentModels: {},
  editorModeByRuntime: {},
};

const countPendingApprovals = (
  approvals: AgentStreamToolApprovalPayload[],
): number => approvals.filter(approval => approval.status === 'pending').length;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Internal ref kept outside React to avoid re-renders on WS assignment. */
let _ws: WebSocket | null = null;
const _wsByAgentId = new Map<string, WebSocket>();

function _resolveWs(agentId?: string): WebSocket | null {
  const hasAgentScopedSockets = _wsByAgentId.size > 0;

  if (agentId) {
    const wsForAgent = _wsByAgentId.get(agentId);
    if (wsForAgent && wsForAgent.readyState === WebSocket.OPEN) {
      return wsForAgent;
    }
    // In multi-agent mode, avoid falling back to an arbitrary global socket.
    if (hasAgentScopedSockets) {
      return null;
    }
  }

  // When any agent-scoped sockets are registered, require explicit routing.
  if (hasAgentScopedSockets) {
    return null;
  }

  if (_ws && _ws.readyState === WebSocket.OPEN) {
    return _ws;
  }
  return null;
}

export const agentRuntimeStore = createStore<AgentRuntimeStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // ── Registry ──────────────────────────────────────────────────
        agents: [],

        upsertAgent: agentData => {
          set(state => {
            const existingIndex = state.agents.findIndex(
              a => a.id === agentData.id,
            );
            const now = Date.now();
            if (existingIndex >= 0) {
              const updatedAgents = [...state.agents];
              updatedAgents[existingIndex] = {
                ...updatedAgents[existingIndex],
                ...agentData,
                lastUpdated: now,
              };
              return { agents: updatedAgents };
            }
            const newAgent: AgentRegistryEntry = {
              name: agentData.name || agentData.id,
              description: agentData.description || '',
              status: agentData.status || 'initializing',
              lastUpdated: now,
              ...agentData,
            };
            return { agents: [...state.agents, newAgent] };
          });
        },

        getAgentById: (id: string) => get().agents.find(a => a.id === id),

        getAgentByUrl: (baseUrl: string, protocol: Protocol) =>
          get().agents.find(
            a => a.baseUrl === baseUrl && a.protocol === protocol,
          ),

        updateAgentStatus: (id, status, error = null) => {
          set(state => {
            const index = state.agents.findIndex(a => a.id === id);
            if (index >= 0) {
              const updatedAgents = [...state.agents];
              updatedAgents[index] = {
                ...updatedAgents[index],
                status,
                error,
                lastUpdated: Date.now(),
              };
              return { agents: updatedAgents };
            }
            return {};
          });
        },

        toggleAgentStatus: (id: string) => {
          set(state => {
            const index = state.agents.findIndex(a => a.id === id);
            if (index >= 0) {
              const updatedAgents = [...state.agents];
              const currentStatus = updatedAgents[index].status;
              updatedAgents[index] = {
                ...updatedAgents[index],
                status: currentStatus === 'running' ? 'paused' : 'running',
                lastUpdated: Date.now(),
              };
              return { agents: updatedAgents };
            }
            return {};
          });
        },

        deleteAgent: (id: string) => {
          set(state => {
            const { [id]: _removed, ...remainingLoadedSkills } =
              state.loadedSkillsByAgentId;
            return {
              agents: state.agents.filter(a => a.id !== id),
              loadedSkillsByAgentId: remainingLoadedSkills,
            };
          });
        },

        clearAgents: () => {
          set({ agents: [] });
        },

        setLoadedSkillsForAgent: (agentId, skills) => {
          set(state => ({
            loadedSkillsByAgentId: {
              ...state.loadedSkillsByAgentId,
              [agentId]: skills,
            },
          }));
        },

        getLoadedSkillsForAgent: agentId =>
          get().loadedSkillsByAgentId[agentId] ?? [],

        clearLoadedSkillsForAgent: agentId => {
          set(state => {
            if (!(agentId in state.loadedSkillsByAgentId)) {
              return {};
            }
            const { [agentId]: _removed, ...remaining } =
              state.loadedSkillsByAgentId;
            return { loadedSkillsByAgentId: remaining };
          });
        },

        setEphemeralNotebookModel: (notebookId, model) => {
          set(state => ({
            ephemeralNotebookModels: {
              ...state.ephemeralNotebookModels,
              [notebookId]: model,
            },
          }));
        },

        getEphemeralNotebookModel: notebookId =>
          get().ephemeralNotebookModels[notebookId] ?? null,

        clearEphemeralNotebookModel: notebookId => {
          set(state => {
            if (!(notebookId in state.ephemeralNotebookModels)) {
              return {};
            }
            const { [notebookId]: _removed, ...remaining } =
              state.ephemeralNotebookModels;
            return { ephemeralNotebookModels: remaining };
          });
        },

        setEphemeralDocumentModel: (documentId, model) => {
          set(state => ({
            ephemeralDocumentModels: {
              ...state.ephemeralDocumentModels,
              [documentId]: model,
            },
          }));
        },

        getEphemeralDocumentModel: documentId =>
          get().ephemeralDocumentModels[documentId] ?? null,

        clearEphemeralDocumentModel: documentId => {
          set(state => {
            if (!(documentId in state.ephemeralDocumentModels)) {
              return {};
            }
            const { [documentId]: _removed, ...remaining } =
              state.ephemeralDocumentModels;
            return { ephemeralDocumentModels: remaining };
          });
        },

        setEditorMode: (runtimeId, mode) => {
          if (!runtimeId) {
            return;
          }
          set(state => ({
            editorModeByRuntime: {
              ...state.editorModeByRuntime,
              [runtimeId]: mode,
            },
          }));
        },

        getEditorMode: runtimeId =>
          get().editorModeByRuntime[runtimeId] ?? null,

        // ── Runtime connection ────────────────────────────────────────
        ...initialRuntimeState,

        connectAgent: connection => {
          const baseUrl =
            connection.jupyterBaseUrl ||
            connection.serviceManager?.serverSettings.baseUrl;
          if (!baseUrl) {
            throw new Error(
              'connectAgent requires either jupyterBaseUrl or serviceManager',
            );
          }
          const agentBaseUrl = baseUrl.replace(
            '/jupyter/server/',
            '/agent-runtimes/',
          );
          set({
            runtime: {
              podName: connection.podName,
              environmentName: connection.environmentName,
              jupyterBaseUrl: baseUrl,
              agentBaseUrl,
              serviceManager: connection.serviceManager,
              status: 'ready',
              kernelId: connection.kernelId,
            },
            status: 'ready',
            error: null,
          });
        },

        launchAgent: async config => {
          set({ status: 'launching', error: null, isLaunching: true });
          try {
            const { createRuntime } = await import('../runtimes/actions');
            const { runtimesStore } = await import('../state/substates');
            if (config.runtimesUrl) {
              runtimesStore.setState({
                runtimesUrl: config.runtimesUrl,
              });
            }

            const { runtimesUrl: _runtimesUrl, ...runtimeOptions } = config;
            const runtimePod = await createRuntime({
              environmentName: runtimeOptions.environmentName,
              creditsLimit: runtimeOptions.creditsLimit,
              type: runtimeOptions.type || 'notebook',
              givenName: runtimeOptions.givenName,
              capabilities: runtimeOptions.capabilities,
              snapshot: runtimeOptions.snapshot,
            });
            set({ status: 'connecting' });
            const jupyterBaseUrl = runtimePod.ingress;
            const agentBaseUrl = jupyterBaseUrl.replace(
              '/jupyter/server/',
              '/agent-runtimes/',
            );
            const conn: AgentConnection = {
              podName: runtimePod.pod_name,
              environmentName: runtimePod.environment_name,
              jupyterBaseUrl,
              agentBaseUrl,
              status: 'ready',
            };
            set({ runtime: conn, status: 'ready', isLaunching: false });
            return conn;
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Failed to launch runtime';
            set({ status: 'error', error: errorMessage, isLaunching: false });
            throw err;
          }
        },

        createAgent: async (config = {}) => {
          const { runtime } = get();
          if (!runtime) {
            throw new Error(
              'No runtime connected. Launch or connect to a runtime first.',
            );
          }
          try {
            const agentId = config.name || runtime.podName;
            const agentConnection = await createAgentOnRuntime(
              runtime.agentBaseUrl,
              agentId,
              config,
            );
            set({
              runtime: {
                ...runtime,
                agentId: agentConnection.agentId,
                endpoint: agentConnection.endpoint,
                isReady: agentConnection.isReady,
              },
            });
            return agentConnection;
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Failed to create agent';
            set({ error: errorMessage });
            throw err;
          }
        },

        disconnect: () => {
          set({ runtime: null, status: 'disconnected', error: null });
        },

        clearError: () => set({ error: null }),

        setError: error => set({ error, status: 'error' }),

        // ── WebSocket stream ──────────────────────────────────────────
        ...initialWsState,
        ...initialNotebookState,

        setWsState: wsState => set({ wsState }),

        setWs: (ws, agentId) => {
          _ws = ws;
          if (agentId) {
            if (ws) {
              _wsByAgentId.set(agentId, ws);
            } else {
              _wsByAgentId.delete(agentId);
            }
          }
        },

        applySnapshot: payload =>
          set(state => ({
            // Tool-approval list/count are sourced from ai-agents WS only.
            approvals: state.approvals,
            pendingApprovalCount: state.pendingApprovalCount,
            contextSnapshot: payload.contextSnapshot ?? null,
            costUsage: payload.costUsage ?? null,
            mcpStatus: payload.mcpStatus ?? null,
            codemodeStatus: payload.codemodeStatus ?? null,
            fullContext: payload.fullContext ?? null,
          })),

        upsertApproval: approval =>
          set(state => {
            const filtered = state.approvals.filter(a => a.id !== approval.id);
            const approvals = [approval, ...filtered];
            return {
              approvals,
              pendingApprovalCount: countPendingApprovals(approvals),
            };
          }),

        removeApproval: approvalId =>
          set(state => {
            const approvals = state.approvals.filter(a => a.id !== approvalId);
            return {
              approvals,
              pendingApprovalCount: countPendingApprovals(approvals),
            };
          }),

        sendDecision: (approvalId, approved, note, toolCallId, agentId) => {
          const targetWs = _resolveWs(agentId);
          if (!targetWs) {
            return false;
          }
          targetWs.send(
            JSON.stringify({
              type: 'tool_approval_decision',
              approvalId,
              approved,
              ...(note ? { note } : {}),
              ...(toolCallId ? { toolCallId } : {}),
            }),
          );
          return true;
        },

        requestRefresh: agentId => {
          const targetWs = _resolveWs(agentId);
          if (!targetWs) {
            return false;
          }
          targetWs.send(JSON.stringify({ type: 'request_snapshot' }));
          targetWs.send(JSON.stringify({ type: 'request_otel_flush' }));
          return true;
        },

        sendRawMessage: (
          payload: Record<string, unknown>,
          agentId?: string,
        ) => {
          const targetWs = _resolveWs(agentId);
          if (!targetWs) {
            return false;
          }
          targetWs.send(JSON.stringify(payload));
          return true;
        },

        appendLocalTokenTurn: ({
          serviceName,
          agentId,
          timestampMs,
          promptTokens,
          completionTokens,
          totalTokens,
        }) => {
          set(state => {
            const key = getMonitoringCacheKey(serviceName, agentId);
            const existing = state.monitoringCache[key] ?? {
              tokenTurns: [],
              costPoints: [],
            };
            const tokenTurns = [...existing.tokenTurns];
            const lastTurn = tokenTurns[tokenTurns.length - 1];

            if (
              lastTurn &&
              lastTurn.userMessageTokens === promptTokens &&
              lastTurn.aiMessageTokens === completionTokens &&
              lastTurn.systemPromptTokens === 0 &&
              lastTurn.toolsDescriptionTokens === 0 &&
              lastTurn.toolsUsageTokens === 0 &&
              lastTurn.totalTokens === totalTokens
            ) {
              tokenTurns[tokenTurns.length - 1] = {
                ...lastTurn,
                timestampMs: Math.max(lastTurn.timestampMs, timestampMs),
              };

              return {
                monitoringCache: {
                  ...state.monitoringCache,
                  [key]: {
                    ...existing,
                    tokenTurns,
                  },
                },
              };
            }

            const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;

            tokenTurns.push({
              turnNumber,
              timestampMs,
              systemPromptTokens: 0,
              toolsDescriptionTokens: 0,
              userMessageTokens: promptTokens,
              aiMessageTokens: completionTokens,
              toolsUsageTokens: 0,
              totalTokens,
            });

            return {
              monitoringCache: {
                ...state.monitoringCache,
                [key]: {
                  ...existing,
                  tokenTurns,
                },
              },
            };
          });
        },

        mergeTokenTurns: ({ serviceName, agentId, turns }) => {
          if (turns.length === 0) return;
          set(state => {
            const key = getMonitoringCacheKey(serviceName, agentId);
            const existing = state.monitoringCache[key] ?? {
              tokenTurns: [],
              costPoints: [],
            };
            const byTurn = new Map<number, LocalTokenTurn>();
            for (const turn of existing.tokenTurns) {
              byTurn.set(turn.turnNumber, turn);
            }
            for (const turn of turns) {
              byTurn.set(turn.turnNumber, turn);
            }
            const tokenTurns = Array.from(byTurn.values()).sort(
              (a, b) => a.turnNumber - b.turnNumber,
            );
            return {
              monitoringCache: {
                ...state.monitoringCache,
                [key]: {
                  ...existing,
                  tokenTurns,
                },
              },
            };
          });
        },

        appendLocalTokenTurnFull: ({
          serviceName,
          agentId,
          timestampMs,
          systemPromptTokens,
          toolsDescriptionTokens,
          userMessageTokens,
          aiMessageTokens,
          toolsUsageTokens,
          totalTokens,
        }) => {
          set(state => {
            const key = getMonitoringCacheKey(serviceName, agentId);
            const existing = state.monitoringCache[key] ?? {
              tokenTurns: [],
              costPoints: [],
            };
            const tokenTurns = [...existing.tokenTurns];
            const lastTurn = tokenTurns[tokenTurns.length - 1];

            if (
              lastTurn &&
              lastTurn.systemPromptTokens === systemPromptTokens &&
              lastTurn.toolsDescriptionTokens === toolsDescriptionTokens &&
              lastTurn.userMessageTokens === userMessageTokens &&
              lastTurn.aiMessageTokens === aiMessageTokens &&
              lastTurn.toolsUsageTokens === toolsUsageTokens &&
              lastTurn.totalTokens === totalTokens
            ) {
              tokenTurns[tokenTurns.length - 1] = {
                ...lastTurn,
                timestampMs: Math.max(lastTurn.timestampMs, timestampMs),
              };

              return {
                monitoringCache: {
                  ...state.monitoringCache,
                  [key]: {
                    ...existing,
                    tokenTurns,
                  },
                },
              };
            }

            const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;

            tokenTurns.push({
              turnNumber,
              timestampMs,
              systemPromptTokens,
              toolsDescriptionTokens,
              userMessageTokens,
              aiMessageTokens,
              toolsUsageTokens,
              totalTokens,
            });

            return {
              monitoringCache: {
                ...state.monitoringCache,
                [key]: {
                  ...existing,
                  tokenTurns,
                },
              },
            };
          });
        },

        upsertLocalCostPoint: ({
          serviceName,
          agentId,
          timestampMs,
          cumulativeUsd,
        }) => {
          set(state => {
            const key = getMonitoringCacheKey(serviceName, agentId);
            const existing = state.monitoringCache[key] ?? {
              tokenTurns: [],
              costPoints: [],
            };
            const costPoints = [...existing.costPoints];
            const existingIdx = costPoints.findIndex(
              point => Math.abs(point.timestampMs - timestampMs) < 1,
            );
            if (existingIdx >= 0) {
              costPoints[existingIdx] = {
                ...costPoints[existingIdx],
                cumulativeUsd: Math.max(
                  costPoints[existingIdx].cumulativeUsd,
                  cumulativeUsd,
                ),
              };
            } else {
              costPoints.push({ timestampMs, cumulativeUsd });
            }
            costPoints.sort((a, b) => a.timestampMs - b.timestampMs);
            return {
              monitoringCache: {
                ...state.monitoringCache,
                [key]: {
                  ...existing,
                  costPoints,
                },
              },
            };
          });
        },

        mergeCostPoints: ({ serviceName, agentId, points }) => {
          if (points.length === 0) return;
          set(state => {
            const key = getMonitoringCacheKey(serviceName, agentId);
            const existing = state.monitoringCache[key] ?? {
              tokenTurns: [],
              costPoints: [],
            };
            const byTs = new Map<number, LocalCostPoint>();
            for (const point of existing.costPoints) {
              byTs.set(point.timestampMs, point);
            }
            for (const point of points) {
              const prev = byTs.get(point.timestampMs);
              if (!prev) {
                byTs.set(point.timestampMs, point);
              } else {
                byTs.set(point.timestampMs, {
                  timestampMs: point.timestampMs,
                  cumulativeUsd: Math.max(
                    prev.cumulativeUsd,
                    point.cumulativeUsd,
                  ),
                });
              }
            }
            const costPoints = Array.from(byTs.values()).sort(
              (a, b) => a.timestampMs - b.timestampMs,
            );
            return {
              monitoringCache: {
                ...state.monitoringCache,
                [key]: {
                  ...existing,
                  costPoints,
                },
              },
            };
          });
        },

        // ── Reset ─────────────────────────────────────────────────────
        reset: () => {
          // Close any live WebSocket so the backend tears down its
          // per-connection state (subscriptions, approvals, monitoring).
          if (_ws) {
            try {
              _ws.close(1000, 'reset');
            } catch {
              // Ignore close errors — socket may already be in a closing
              // state or the runtime may have been killed.
            }
          }
          _ws = null;
          _wsByAgentId.clear();
          set(state => ({
            ...initialRuntimeState,
            ...initialWsState,
            // Keep persisted notebook models across navigation/reset cycles.
            ephemeralNotebookModels: state.ephemeralNotebookModels,
            ephemeralDocumentModels: state.ephemeralDocumentModels,
            editorModeByRuntime: state.editorModeByRuntime,
          }));
        },

        resetWs: () => {
          if (_ws) {
            try {
              _ws.close(1000, 'reset');
            } catch {
              // Ignore.
            }
          }
          _ws = null;
          _wsByAgentId.clear();
          set(state => ({
            ...initialWsState,
            // Preserve notebook models when the chat websocket reconnects.
            ephemeralNotebookModels: state.ephemeralNotebookModels,
            ephemeralDocumentModels: state.ephemeralDocumentModels,
            editorModeByRuntime: state.editorModeByRuntime,
          }));
        },
      }),
      {
        name: 'agent-runtimes-storage',
        storage: createJSONStorage(() => localStorage),
        partialize: state => ({
          agents: state.agents.map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            baseUrl: agent.baseUrl,
            transport: agent.protocol,
            status: agent.status,
            lastUpdated: agent.lastUpdated,
            documentId: agent.documentId,
            runtimeId: agent.runtimeId,
          })),
          monitoringCache: state.monitoringCache,
          loadedSkillsByAgentId: state.loadedSkillsByAgentId,
          ephemeralNotebookModels: state.ephemeralNotebookModels,
          ephemeralDocumentModels: state.ephemeralDocumentModels,
          editorModeByRuntime: state.editorModeByRuntime,
        }),
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useAgentRuntimeStore(): AgentRuntimeStore;
export function useAgentRuntimeStore<T>(
  selector: (state: AgentRuntimeStore) => T,
): T;
export function useAgentRuntimeStore<T>(
  selector?: (state: AgentRuntimeStore) => T,
) {
  const resolvedSelector = selector
    ? selector
    : (state: AgentRuntimeStore) => state as unknown as T;
  return useStore(agentRuntimeStore, resolvedSelector);
}

// Attach getState / subscribe for non-React consumers
type AgentRuntimeStoreHook = typeof useAgentRuntimeStore & {
  getState: typeof agentRuntimeStore.getState;
  subscribe: typeof agentRuntimeStore.subscribe;
};

const useAgentRuntimeStoreWithStatics =
  useAgentRuntimeStore as AgentRuntimeStoreHook;
useAgentRuntimeStoreWithStatics.getState = agentRuntimeStore.getState;
useAgentRuntimeStoreWithStatics.subscribe = agentRuntimeStore.subscribe;

// ---------------------------------------------------------------------------
// Selector hooks — Registry
// ---------------------------------------------------------------------------

export const useAgentRuntimeConnection = () =>
  useAgentRuntimeStore(s => s.runtime);

export const useAgentRuntimeStatus = () => useAgentRuntimeStore(s => s.status);

export const useAgentRuntimeError = () => useAgentRuntimeStore(s => s.error);

export const useAgentRuntimeIsLaunching = () =>
  useAgentRuntimeStore(s => s.isLaunching);

// ---------------------------------------------------------------------------
// Selector hooks — WebSocket stream
// ---------------------------------------------------------------------------

export const useAgentRuntimeApprovals = () =>
  useAgentRuntimeStore(s => s.approvals);

export const useAgentRuntimePendingCount = () =>
  useAgentRuntimeStore(s => s.pendingApprovalCount);

export const useAgentRuntimeMcpStatus = () =>
  useAgentRuntimeStore(s => s.mcpStatus);

export const useAgentRuntimeFullContext = () =>
  useAgentRuntimeStore(s => s.fullContext);

export const useAgentRuntimeContextSnapshot = () =>
  useAgentRuntimeStore(s => s.contextSnapshot);

export const useAgentRuntimeCostUsage = () =>
  useAgentRuntimeStore(s => s.costUsage);

export const useAgentRuntimeCodemodeStatus = () =>
  useAgentRuntimeStore(s => s.codemodeStatus);

export const useAgentRuntimeWsState = () =>
  useAgentRuntimeStore(s => s.wsState);

export const useAgentRuntimeLoadedSkills = (agentId?: string) =>
  useAgentRuntimeStore(s =>
    agentId ? (s.loadedSkillsByAgentId[agentId] ?? []) : [],
  );

// ---------------------------------------------------------------------------
// Non-React access
// ---------------------------------------------------------------------------

export const getAgentRuntimeState = () => agentRuntimeStore.getState();
export const subscribeToAgentRuntime = agentRuntimeStore.subscribe;
