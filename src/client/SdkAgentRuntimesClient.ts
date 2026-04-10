/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Default implementation of {@link IAgentRuntimesClient} that delegates to a
 * `DatalayerClient` composed with `AgentsMixin`.
 *
 * This is the implementation used by browser, Node, JupyterLab, and standalone
 * examples of the chat component. The VSCode extension provides its own
 * implementation (`BridgeAgentRuntimesClient`) that tunnels calls through a
 * message-passing bridge to an extension-host instance of this same class.
 *
 * @module client/SdkAgentRuntimesClient
 */

import type {
  AgentEvent,
  AgentNotification,
  AgentUsageSummary,
  ChatMessage,
  ContextSnapshotData,
  ContextUsage,
  ConversationCheckpoint,
  CostUsage,
  CreateAgentEventRequest,
  EvalReport,
  GetAgentEventResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  McpToolsetsStatusResponse,
  NotificationFilters,
  OutputArtifact,
  RemoteConfig,
  RunEvalsRequest,
  RunningAgent,
  SandboxStatusData,
  SkillsResponse,
  UpdateAgentEventRequest,
} from '../types';
import type {
  CreateAgentRuntimeRequest,
  CreateRuntimeApiResponse,
} from '../types/agents-lifecycle';
import type {
  ToolApproval,
  ToolApprovalFilters,
} from '../types/tool-approvals';

import type { IAgentRuntimesClient } from './IAgentRuntimesClient';

/**
 * Structural type describing the subset of methods {@link SdkAgentRuntimesClient}
 * needs on the underlying SDK instance. Any `DatalayerClient` composed with
 * `AgentsMixin` satisfies this shape; accepting it structurally avoids a
 * hard type dependency on `@datalayer/core` inside this file, which keeps the
 * default implementation drop-in replaceable in alternative deployments.
 */
export interface AgentsSdkLike {
  /** Lists every running agent across runtimes the caller can see. */
  getRunningAgents(): Promise<RunningAgent[]>;
  /** Retrieves the detailed status of a specific running agent. */
  getAgentStatus(podName: string, agentId?: string): Promise<RunningAgent>;
  /** Pauses a running agent. */
  pauseAgent(podName: string): Promise<void>;
  /** Resumes a previously paused agent. */
  resumeAgent(podName: string): Promise<void>;
  /** Lists conversation checkpoints for an agent. */
  getAgentCheckpoints(
    podName: string,
    agentId?: string,
  ): Promise<ConversationCheckpoint[]>;
  /** Retrieves the token and cost usage summary for an agent. */
  getAgentUsage(podName: string, agentId?: string): Promise<AgentUsageSummary>;
  /** Lists tool approval requests with optional filters. */
  getToolApprovals(filters?: ToolApprovalFilters): Promise<ToolApproval[]>;
  /** Approves a pending tool execution request. */
  approveToolRequest(approvalId: string): Promise<void>;
  /** Rejects a pending tool execution request. */
  rejectToolRequest(approvalId: string, reason?: string): Promise<void>;
  /** Lists agent notifications with optional filters. */
  getNotifications(filters?: NotificationFilters): Promise<AgentNotification[]>;
  /** Marks a single notification as read. */
  markNotificationRead(notificationId: string): Promise<void>;
  /** Marks every notification for the caller as read. */
  markAllNotificationsRead(): Promise<void>;
  /** Creates a new event for an agent. */
  createEvent(
    data: CreateAgentEventRequest,
  ): Promise<{ success: boolean; event: AgentEvent }>;
  /** Lists events for an agent. */
  listEvents(
    agentId: string,
    params?: Omit<ListAgentEventsParams, 'agent_id'>,
  ): Promise<ListAgentEventsResponse>;
  /** Retrieves a single event. */
  getEvent(agentId: string, eventId: string): Promise<GetAgentEventResponse>;
  /** Updates an event. */
  updateEvent(
    agentId: string,
    eventId: string,
    data: UpdateAgentEventRequest,
  ): Promise<GetAgentEventResponse>;
  /** Lists output artifacts for an agent. */
  getAgentOutputs(agentId: string): Promise<OutputArtifact[]>;
  /** Retrieves a single output artifact. */
  getAgentOutput(agentId: string, outputId: string): Promise<OutputArtifact>;
  /** Generates a new output artifact. */
  generateAgentOutput(
    agentId: string,
    format: string,
    options?: Record<string, unknown>,
  ): Promise<OutputArtifact>;
  /** Runs an evaluation batch. */
  runEvals(agentId: string, request: RunEvalsRequest): Promise<EvalReport>;
  /** Lists eval reports for an agent. */
  listEvals(agentId: string): Promise<EvalReport[]>;
  /** Retrieves a single eval report. */
  getEval(agentId: string, evalId: string): Promise<EvalReport>;
  /** Retrieves context window usage. */
  getContextUsage(agentId: string): Promise<ContextUsage>;
  /** Retrieves cost usage. */
  getCostUsage(agentId: string): Promise<CostUsage>;
  /** Creates a new agent runtime. */
  createAgentRuntime(
    data: CreateAgentRuntimeRequest,
  ): Promise<CreateRuntimeApiResponse>;
}

/**
 * {@link IAgentRuntimesClient} implementation that forwards every call to a
 * pre-composed `DatalayerClient + AgentsMixin` instance.
 *
 * Construct with:
 *
 * ```ts
 * import { DatalayerClient } from '@datalayer/core/lib/client';
 * import { AgentsMixin, SdkAgentRuntimesClient } from '@datalayer/agent-runtimes';
 *
 * const ClientWithAgents = AgentsMixin(DatalayerClient);
 * const sdk = new ClientWithAgents({ iamRunUrl, runtimesRunUrl, spacerRunUrl });
 * const client = new SdkAgentRuntimesClient(sdk);
 * ```
 */
export class SdkAgentRuntimesClient implements IAgentRuntimesClient {
  /**
   * Constructs the default client.
   *
   * @param sdk - A composed `DatalayerClient + AgentsMixin` instance whose
   *   `getToken()` / service URL resolvers already return valid values.
   *   When `null`, only chat operations (getChatConfig, getChatHistory, etc.)
   *   are available; control-plane methods throw.
   */
  constructor(private readonly sdk: AgentsSdkLike | null) {}

  /**
   * Asserts the SDK is available for control-plane operations.
   *
   * @throws When the client was constructed without an SDK.
   *
   * @returns The SDK instance.
   */
  private requireSdk(): AgentsSdkLike {
    if (!this.sdk) {
      throw new Error(
        'Control-plane operations require an SDK instance. ' +
          'Construct SdkAgentRuntimesClient with a DatalayerClient+AgentsMixin.',
      );
    }
    return this.sdk;
  }

  /** @inheritdoc */
  listRunningAgents(): Promise<RunningAgent[]> {
    return this.requireSdk().getRunningAgents();
  }

  /** @inheritdoc */
  getAgentStatus(podName: string, agentId?: string): Promise<RunningAgent> {
    return this.requireSdk().getAgentStatus(podName, agentId);
  }

  /** @inheritdoc */
  pauseAgent(podName: string): Promise<void> {
    return this.requireSdk().pauseAgent(podName);
  }

  /** @inheritdoc */
  resumeAgent(podName: string): Promise<void> {
    return this.requireSdk().resumeAgent(podName);
  }

  /** @inheritdoc */
  getAgentCheckpoints(
    podName: string,
    agentId?: string,
  ): Promise<ConversationCheckpoint[]> {
    return this.requireSdk().getAgentCheckpoints(podName, agentId);
  }

  /** @inheritdoc */
  getAgentUsage(podName: string, agentId?: string): Promise<AgentUsageSummary> {
    return this.requireSdk().getAgentUsage(podName, agentId);
  }

  /** @inheritdoc */
  listToolApprovals(filters?: ToolApprovalFilters): Promise<ToolApproval[]> {
    return this.requireSdk().getToolApprovals(filters);
  }

  /** @inheritdoc */
  approveToolRequest(approvalId: string): Promise<void> {
    return this.requireSdk().approveToolRequest(approvalId);
  }

  /** @inheritdoc */
  rejectToolRequest(approvalId: string, reason?: string): Promise<void> {
    return this.requireSdk().rejectToolRequest(approvalId, reason);
  }

  /** @inheritdoc */
  listNotifications(
    filters?: NotificationFilters,
  ): Promise<AgentNotification[]> {
    return this.requireSdk().getNotifications(filters);
  }

  /** @inheritdoc */
  markNotificationRead(notificationId: string): Promise<void> {
    return this.requireSdk().markNotificationRead(notificationId);
  }

  /** @inheritdoc */
  markAllNotificationsRead(): Promise<void> {
    return this.requireSdk().markAllNotificationsRead();
  }

  /** @inheritdoc */
  createEvent(
    data: CreateAgentEventRequest,
  ): Promise<{ success: boolean; event: AgentEvent }> {
    return this.requireSdk().createEvent(data);
  }

  /** @inheritdoc */
  listEvents(
    agentId: string,
    params?: Omit<ListAgentEventsParams, 'agent_id'>,
  ): Promise<ListAgentEventsResponse> {
    return this.requireSdk().listEvents(agentId, params);
  }

  /** @inheritdoc */
  getEvent(agentId: string, eventId: string): Promise<GetAgentEventResponse> {
    return this.requireSdk().getEvent(agentId, eventId);
  }

  /** @inheritdoc */
  updateEvent(
    agentId: string,
    eventId: string,
    data: UpdateAgentEventRequest,
  ): Promise<GetAgentEventResponse> {
    return this.requireSdk().updateEvent(agentId, eventId, data);
  }

  /** @inheritdoc */
  getAgentOutputs(agentId: string): Promise<OutputArtifact[]> {
    return this.requireSdk().getAgentOutputs(agentId);
  }

  /** @inheritdoc */
  getAgentOutput(agentId: string, outputId: string): Promise<OutputArtifact> {
    return this.requireSdk().getAgentOutput(agentId, outputId);
  }

  /** @inheritdoc */
  generateAgentOutput(
    agentId: string,
    format: string,
    options?: Record<string, unknown>,
  ): Promise<OutputArtifact> {
    return this.requireSdk().generateAgentOutput(agentId, format, options);
  }

  /** @inheritdoc */
  runEvals(agentId: string, request: RunEvalsRequest): Promise<EvalReport> {
    return this.requireSdk().runEvals(agentId, request);
  }

  /** @inheritdoc */
  listEvals(agentId: string): Promise<EvalReport[]> {
    return this.requireSdk().listEvals(agentId);
  }

  /** @inheritdoc */
  getEval(agentId: string, evalId: string): Promise<EvalReport> {
    return this.requireSdk().getEval(agentId, evalId);
  }

  /** @inheritdoc */
  getContextUsage(agentId: string): Promise<ContextUsage> {
    return this.requireSdk().getContextUsage(agentId);
  }

  /** @inheritdoc */
  getCostUsage(agentId: string): Promise<CostUsage> {
    return this.requireSdk().getCostUsage(agentId);
  }

  /** @inheritdoc */
  createAgentRuntime(
    data: CreateAgentRuntimeRequest,
  ): Promise<CreateRuntimeApiResponse> {
    return this.requireSdk().createAgentRuntime(data);
  }

  // ==========================================================================
  // Chat operations — direct HTTP calls (not yet in AgentsMixin)
  // ==========================================================================

  /** @inheritdoc */
  async getChatConfig(
    baseUrl: string,
    authToken?: string,
  ): Promise<RemoteConfig> {
    const resp = await fetch(`${baseUrl}/api/v1/configure`, {
      headers: authHeaders(authToken),
    });
    if (!resp.ok) {
      throw new Error(
        `getChatConfig failed: ${resp.status} ${resp.statusText}`,
      );
    }
    return resp.json() as Promise<RemoteConfig>;
  }

  /** @inheritdoc */
  async getChatHistory(
    baseUrl: string,
    agentId?: string,
    authToken?: string,
  ): Promise<ChatMessage[]> {
    const params = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
    const resp = await fetch(`${baseUrl}/api/v1/history${params}`, {
      headers: authHeaders(authToken),
    });
    if (!resp.ok) {
      throw new Error(
        `getChatHistory failed: ${resp.status} ${resp.statusText}`,
      );
    }
    const data = (await resp.json()) as { messages?: ChatMessage[] };
    return data.messages ?? [];
  }

  /** @inheritdoc */
  async getSandboxStatus(
    baseUrl: string,
    authToken?: string,
  ): Promise<SandboxStatusData> {
    const resp = await fetch(`${baseUrl}/api/v1/configure/sandbox-status`, {
      headers: authHeaders(authToken),
    });
    if (!resp.ok) {
      throw new Error(
        `getSandboxStatus failed: ${resp.status} ${resp.statusText}`,
      );
    }
    return resp.json() as Promise<SandboxStatusData>;
  }

  /** @inheritdoc */
  async interruptSandbox(
    baseUrl: string,
    agentId?: string,
    authToken?: string,
  ): Promise<void> {
    const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
    const resp = await fetch(
      `${baseUrl}/api/v1/configure/sandbox/interrupt${query}`,
      {
        method: 'POST',
        headers: authHeaders(authToken),
      },
    );
    if (!resp.ok) {
      throw new Error(
        `interruptSandbox failed: ${resp.status} ${resp.statusText}`,
      );
    }
  }

  /** @inheritdoc */
  async getContextSnapshot(
    baseUrl: string,
    agentId: string,
    authToken?: string,
  ): Promise<ContextSnapshotData> {
    const resp = await fetch(
      `${baseUrl}/api/v1/configure/agents/${encodeURIComponent(agentId)}/context-snapshot`,
      { headers: authHeaders(authToken) },
    );
    if (!resp.ok) {
      throw new Error(
        `getContextSnapshot failed: ${resp.status} ${resp.statusText}`,
      );
    }
    return resp.json() as Promise<ContextSnapshotData>;
  }

  /** @inheritdoc */
  async getSkills(
    baseUrl: string,
    authToken?: string,
  ): Promise<SkillsResponse> {
    const resp = await fetch(`${baseUrl}/api/v1/skills`, {
      headers: authHeaders(authToken),
    });
    if (!resp.ok) {
      throw new Error(`getSkills failed: ${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<SkillsResponse>;
  }

  /** @inheritdoc */
  async getMcpStatus(
    baseUrl: string,
    authToken?: string,
  ): Promise<McpToolsetsStatusResponse> {
    const resp = await fetch(
      `${baseUrl}/api/v1/configure/mcp-toolsets-status`,
      { headers: authHeaders(authToken) },
    );
    if (!resp.ok) {
      throw new Error(`getMcpStatus failed: ${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<McpToolsetsStatusResponse>;
  }
}

/**
 * Builds Authorization headers for chat operation requests.
 *
 * @param authToken - Optional bearer token.
 *
 * @returns Headers object.
 */
function authHeaders(authToken?: string): Record<string, string> {
  if (authToken) {
    return { Authorization: `Bearer ${authToken}` };
  }
  return {};
}
