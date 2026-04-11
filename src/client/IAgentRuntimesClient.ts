/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Domain-level interface abstracting every operation the chat component and
 * hooks need against the Datalayer agent runtime platform.
 *
 * Two concrete implementations are expected:
 *
 * 1. `SdkAgentRuntimesClient` — the default browser / Node implementation
 *    that delegates to a `DatalayerClient` composed with `AgentsMixin`.
 *    Makes real HTTP calls against the configured service URLs.
 *
 * 2. A bridge implementation hosted inside the VSCode webview sandbox (lives
 *    in the `vscode-datalayer` extension, not in this package). It implements
 *    the same interface but tunnels every call to the extension host via
 *    `postMessage` correlation IDs. The extension host answers the calls
 *    using its own `SdkAgentRuntimesClient` so the webview never touches the
 *    network or the auth token directly.
 *
 * The interface is deliberately transport-agnostic: consumers depend on
 * semantic method names (`listRunningAgents`, `approveToolRequest`) rather
 * than on URLs, fetch options, or WebSocket frames.
 *
 * @module client/IAgentRuntimesClient
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

/**
 * Unified client contract for the Datalayer agent-runtimes control plane.
 *
 * Every method corresponds one-to-one with an operation on
 * `AgentsMixin`. Phase 1 of the interface covers the non-streaming
 * surface. Streaming chat (`streamChat`), chat config, history, and related
 * transport-specific operations will be added in a follow-up once
 * `AgentsMixin` grows typed wrappers for them.
 */
export interface IAgentRuntimesClient {
  // ==========================================================================
  // Running agents
  // ==========================================================================

  /**
   * Lists every running agent across all runtimes the caller can see.
   *
   * @returns Array of running agent summaries.
   */
  listRunningAgents(): Promise<RunningAgent[]>;

  /**
   * Retrieves the detailed status of a specific running agent.
   *
   * @param podName - Pod name hosting the agent.
   * @param agentId - Optional agent ID within the pod (for multi-agent pods).
   *
   * @returns The agent's current status record.
   */
  getAgentStatus(podName: string, agentId?: string): Promise<RunningAgent>;

  /**
   * Pauses a running agent (light checkpoint by default).
   *
   * @param podName - Pod name hosting the agent.
   */
  pauseAgent(podName: string): Promise<void>;

  /**
   * Resumes a previously paused / checkpointed agent.
   *
   * @param podName - Pod name hosting the agent.
   */
  resumeAgent(podName: string): Promise<void>;

  /**
   * Lists conversation checkpoints for an agent.
   *
   * @param podName - Pod name hosting the agent.
   * @param agentId - Optional agent ID within the pod.
   *
   * @returns Array of conversation checkpoints.
   */
  getAgentCheckpoints(
    podName: string,
    agentId?: string,
  ): Promise<ConversationCheckpoint[]>;

  /**
   * Retrieves the token and cost usage summary for an agent.
   *
   * @param podName - Pod name hosting the agent.
   * @param agentId - Optional agent ID within the pod.
   *
   * @returns Aggregated usage totals.
   */
  getAgentUsage(podName: string, agentId?: string): Promise<AgentUsageSummary>;

  // ==========================================================================
  // Tool approvals
  // ==========================================================================

  /**
   * Lists tool approval requests, optionally filtered by status or agent.
   *
   * @param filters - Optional filter predicates.
   *
   * @returns Array of tool approval records matching the filters.
   */
  listToolApprovals(filters?: ToolApprovalFilters): Promise<ToolApproval[]>;

  /**
   * Approves a pending tool execution request.
   *
   * @param approvalId - ID of the approval to approve.
   */
  approveToolRequest(approvalId: string): Promise<void>;

  /**
   * Rejects a pending tool execution request.
   *
   * @param approvalId - ID of the approval to reject.
   * @param reason - Optional human-readable rejection reason.
   */
  rejectToolRequest(approvalId: string, reason?: string): Promise<void>;

  // ==========================================================================
  // Notifications
  // ==========================================================================

  /**
   * Lists agent notifications, optionally filtered by level or read status.
   *
   * @param filters - Optional filter predicates.
   *
   * @returns Array of notifications matching the filters.
   */
  listNotifications(
    filters?: NotificationFilters,
  ): Promise<AgentNotification[]>;

  /**
   * Marks a single notification as read.
   *
   * @param notificationId - ID of the notification.
   */
  markNotificationRead(notificationId: string): Promise<void>;

  /**
   * Marks every notification for the caller as read.
   */
  markAllNotificationsRead(): Promise<void>;

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Creates a new event for an agent.
   *
   * @param data - Event payload.
   *
   * @returns The created event wrapped in a success envelope.
   */
  createEvent(
    data: CreateAgentEventRequest,
  ): Promise<{ success: boolean; event: AgentEvent }>;

  /**
   * Lists events for an agent with optional filters.
   *
   * @param agentId - Agent identifier whose events are being listed.
   * @param params - Optional list filters (pagination, type, status).
   *
   * @returns Paginated events response.
   */
  listEvents(
    agentId: string,
    params?: Omit<ListAgentEventsParams, 'agent_id'>,
  ): Promise<ListAgentEventsResponse>;

  /**
   * Retrieves a single event by identifier.
   *
   * @param agentId - Agent that owns the event.
   * @param eventId - Event identifier.
   *
   * @returns The requested event.
   */
  getEvent(agentId: string, eventId: string): Promise<GetAgentEventResponse>;

  /**
   * Patches an existing event.
   *
   * @param agentId - Agent that owns the event.
   * @param eventId - Event identifier.
   * @param data - Partial event fields to update.
   *
   * @returns The updated event.
   */
  updateEvent(
    agentId: string,
    eventId: string,
    data: UpdateAgentEventRequest,
  ): Promise<GetAgentEventResponse>;

  // ==========================================================================
  // Outputs
  // ==========================================================================

  /**
   * Lists every output artifact an agent has generated.
   *
   * @param agentId - Agent identifier.
   *
   * @returns Array of output artifacts.
   */
  getAgentOutputs(agentId: string): Promise<OutputArtifact[]>;

  /**
   * Retrieves a single output artifact by identifier.
   *
   * @param agentId - Agent identifier.
   * @param outputId - Output artifact identifier.
   *
   * @returns The requested output artifact.
   */
  getAgentOutput(agentId: string, outputId: string): Promise<OutputArtifact>;

  /**
   * Generates a new output artifact for an agent.
   *
   * @param agentId - Agent identifier.
   * @param format - Requested output format (e.g. `"pdf"`).
   * @param options - Optional format-specific generation options.
   *
   * @returns The newly generated output artifact.
   */
  generateAgentOutput(
    agentId: string,
    format: string,
    options?: Record<string, unknown>,
  ): Promise<OutputArtifact>;

  // ==========================================================================
  // Evals
  // ==========================================================================

  /**
   * Runs an evaluation batch against an agent.
   *
   * @param agentId - Agent identifier.
   * @param request - Eval configuration payload.
   *
   * @returns Eval report capturing results and metrics.
   */
  runEvals(agentId: string, request: RunEvalsRequest): Promise<EvalReport>;

  /**
   * Lists past eval reports for an agent.
   *
   * @param agentId - Agent identifier.
   *
   * @returns Array of eval reports in reverse-chronological order.
   */
  listEvals(agentId: string): Promise<EvalReport[]>;

  /**
   * Retrieves a single eval report by identifier.
   *
   * @param agentId - Agent identifier.
   * @param evalId - Eval report identifier.
   *
   * @returns The requested eval report.
   */
  getEval(agentId: string, evalId: string): Promise<EvalReport>;

  // ==========================================================================
  // Context & cost
  // ==========================================================================

  /**
   * Retrieves the current context window usage for an agent.
   *
   * @param agentId - Agent identifier.
   *
   * @returns Context usage details.
   */
  getContextUsage(agentId: string): Promise<ContextUsage>;

  /**
   * Retrieves the per-model cost usage for an agent.
   *
   * @param agentId - Agent identifier.
   *
   * @returns Cost usage aggregates.
   */
  getCostUsage(agentId: string): Promise<CostUsage>;

  // ==========================================================================
  // Chat operations (used by hooks and ChatBase)
  // ==========================================================================

  /**
   * Fetches the chat configuration (models, tools, MCP servers).
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param authToken - Optional auth token.
   *
   * @returns Remote configuration.
   */
  getChatConfig(baseUrl: string, authToken?: string): Promise<RemoteConfig>;

  /**
   * Fetches conversation history for a runtime.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param agentId - Optional agent ID to scope history.
   * @param authToken - Optional auth token.
   *
   * @returns Array of chat messages.
   */
  getChatHistory(
    baseUrl: string,
    agentId?: string,
    authToken?: string,
  ): Promise<ChatMessage[]>;

  /**
   * Fetches sandbox execution status.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param authToken - Optional auth token.
   *
   * @returns Sandbox status data.
   */
  getSandboxStatus(
    baseUrl: string,
    authToken?: string,
  ): Promise<SandboxStatusData>;

  /**
   * Interrupts a running sandbox execution.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param agentId - Optional agent ID.
   * @param authToken - Optional auth token.
   */
  interruptSandbox(
    baseUrl: string,
    agentId?: string,
    authToken?: string,
  ): Promise<void>;

  /**
   * Fetches the context snapshot (token usage breakdown) for an agent.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param agentId - Agent identifier.
   * @param authToken - Optional auth token.
   *
   * @returns Context snapshot data.
   */
  getContextSnapshot(
    baseUrl: string,
    agentId: string,
    authToken?: string,
  ): Promise<ContextSnapshotData>;

  /**
   * Fetches available skills.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param authToken - Optional auth token.
   *
   * @returns Skills response with skills array.
   */
  getSkills(baseUrl: string, authToken?: string): Promise<SkillsResponse>;

  /**
   * Fetches MCP toolsets status.
   *
   * @param baseUrl - Runtime base URL (ingress).
   * @param authToken - Optional auth token.
   *
   * @returns MCP toolsets status response.
   */
  getMcpStatus(
    baseUrl: string,
    authToken?: string,
  ): Promise<McpToolsetsStatusResponse>;

  // ==========================================================================
  // Agent runtime lifecycle
  // ==========================================================================

  /**
   * Creates a new agent runtime.
   *
   * @param data - Runtime creation parameters.
   *
   * @returns The creation response with the provisioned runtime descriptor.
   */
  createAgentRuntime(
    data: CreateAgentRuntimeRequest,
  ): Promise<CreateRuntimeApiResponse>;
}
