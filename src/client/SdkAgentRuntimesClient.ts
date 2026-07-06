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
  ContextUsage,
  ConversationCheckpoint,
  CostUsage,
  CreateAgentEventRequest,
  EvalReport,
  GetAgentEventResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  NotificationFilters,
  OutputArtifact,
  RunEvalsRequest,
  RunningAgent,
  UpdateAgentEventRequest,
} from '../types';
import type {
  CreateAgentRuntimeRequest,
  CreateRuntimeApiResponse,
} from '../types/agents-lifecycle';

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
 * const sdk = new ClientWithAgents({ iamUrl, runtimesUrl, spacerUrl });
 * const client = new SdkAgentRuntimesClient(sdk);
 * ```
 */
export class SdkAgentRuntimesClient implements IAgentRuntimesClient {
  /**
   * Constructs the default client.
   *
   * @param sdk - A composed `DatalayerClient + AgentsMixin` instance whose
   *   `getToken()` / service URL resolvers already return valid values.
   *   When `null`, every method throws — pass a real SDK to use the client.
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
  async listRunningAgents(): Promise<RunningAgent[]> {
    return this.requireSdk().getRunningAgents();
  }

  /** @inheritdoc */
  async getAgentStatus(
    podName: string,
    agentId?: string,
  ): Promise<RunningAgent> {
    return this.requireSdk().getAgentStatus(podName, agentId);
  }

  /** @inheritdoc */
  async pauseAgent(podName: string): Promise<void> {
    return this.requireSdk().pauseAgent(podName);
  }

  /** @inheritdoc */
  async resumeAgent(podName: string): Promise<void> {
    return this.requireSdk().resumeAgent(podName);
  }

  /** @inheritdoc */
  async getAgentCheckpoints(
    podName: string,
    agentId?: string,
  ): Promise<ConversationCheckpoint[]> {
    return this.requireSdk().getAgentCheckpoints(podName, agentId);
  }

  /** @inheritdoc */
  async getAgentUsage(
    podName: string,
    agentId?: string,
  ): Promise<AgentUsageSummary> {
    return this.requireSdk().getAgentUsage(podName, agentId);
  }

  /** @inheritdoc */
  async listNotifications(
    filters?: NotificationFilters,
  ): Promise<AgentNotification[]> {
    return this.requireSdk().getNotifications(filters);
  }

  /** @inheritdoc */
  async markNotificationRead(notificationId: string): Promise<void> {
    return this.requireSdk().markNotificationRead(notificationId);
  }

  /** @inheritdoc */
  async markAllNotificationsRead(): Promise<void> {
    return this.requireSdk().markAllNotificationsRead();
  }

  /** @inheritdoc */
  async createEvent(
    data: CreateAgentEventRequest,
  ): Promise<{ success: boolean; event: AgentEvent }> {
    return this.requireSdk().createEvent(data);
  }

  /** @inheritdoc */
  async listEvents(
    agentId: string,
    params?: Omit<ListAgentEventsParams, 'agent_id'>,
  ): Promise<ListAgentEventsResponse> {
    return this.requireSdk().listEvents(agentId, params);
  }

  /** @inheritdoc */
  async getEvent(
    agentId: string,
    eventId: string,
  ): Promise<GetAgentEventResponse> {
    return this.requireSdk().getEvent(agentId, eventId);
  }

  /** @inheritdoc */
  async updateEvent(
    agentId: string,
    eventId: string,
    data: UpdateAgentEventRequest,
  ): Promise<GetAgentEventResponse> {
    return this.requireSdk().updateEvent(agentId, eventId, data);
  }

  /** @inheritdoc */
  async getAgentOutputs(agentId: string): Promise<OutputArtifact[]> {
    return this.requireSdk().getAgentOutputs(agentId);
  }

  /** @inheritdoc */
  async getAgentOutput(
    agentId: string,
    outputId: string,
  ): Promise<OutputArtifact> {
    return this.requireSdk().getAgentOutput(agentId, outputId);
  }

  /** @inheritdoc */
  async generateAgentOutput(
    agentId: string,
    format: string,
    options?: Record<string, unknown>,
  ): Promise<OutputArtifact> {
    return this.requireSdk().generateAgentOutput(agentId, format, options);
  }

  /** @inheritdoc */
  async runEvals(
    agentId: string,
    request: RunEvalsRequest,
  ): Promise<EvalReport> {
    return this.requireSdk().runEvals(agentId, request);
  }

  /** @inheritdoc */
  async listEvals(agentId: string): Promise<EvalReport[]> {
    return this.requireSdk().listEvals(agentId);
  }

  /** @inheritdoc */
  async getEval(agentId: string, evalId: string): Promise<EvalReport> {
    return this.requireSdk().getEval(agentId, evalId);
  }

  /** @inheritdoc */
  async getContextUsage(agentId: string): Promise<ContextUsage> {
    return this.requireSdk().getContextUsage(agentId);
  }

  /** @inheritdoc */
  async getCostUsage(agentId: string): Promise<CostUsage> {
    return this.requireSdk().getCostUsage(agentId);
  }

  /** @inheritdoc */
  async createAgentRuntime(
    data: CreateAgentRuntimeRequest,
  ): Promise<CreateRuntimeApiResponse> {
    return this.requireSdk().createAgentRuntime(data);
  }
}
