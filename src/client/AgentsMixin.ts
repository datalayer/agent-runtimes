/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agents mixin providing durable agent management functionality.
 *
 * Wraps the ai-agents API functions into the DatalayerClient mixin pattern,
 * providing methods for listing, inspecting, pausing, resuming, and monitoring
 * durable agents, their checkpoints, tool approvals, notifications, evals, and costs.
 *
 * This mixin is designed to be composed into a DatalayerClient instance from
 * `@datalayer/core`. Import and compose it alongside the other core mixins.
 *
 * @module client/AgentsMixin
 */

import * as agents from '../api/agents';
import * as toolApprovals from '../api/tool-approvals';
import * as notifications from '../api/notifications';
import * as events from '../api/events';
import * as output from '../api/output';
import * as evals from '../api/evals';
import * as context from '../api/context';
import type {
  AgentEvent,
  CreateAgentEventRequest,
  GetAgentEventResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  UpdateAgentEventRequest,
  RunningAgent,
  AgentUsageSummary,
  ConversationCheckpoint,
  ToolApproval,
  ToolApprovalFilters,
  AgentNotification,
  NotificationFilters,
  OutputArtifact,
  EvalReport,
  RunEvalsRequest,
  ContextUsage,
  CostUsage,
} from '../api/types';
import type { Constructor } from '@datalayer/core/lib/client/utils/mixins';

/** Agents mixin providing durable agent management. */
export function AgentsMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    // ========================================================================
    // Running Agents
    // ========================================================================

    /**
     * List all running agents across runtimes.
     * @returns Array of running agent summaries
     */
    async getRunningAgents(): Promise<RunningAgent[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.getRunningAgents(token, baseUrl);
    }

    /**
     * Get the status of a specific agent.
     * @param podName - Pod name hosting the agent
     * @param agentId - Optional agent ID within the pod
     * @returns Detailed agent status
     */
    async getAgentStatus(
      podName: string,
      agentId?: string,
    ): Promise<RunningAgent> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.getAgentStatus(token, podName, agentId, baseUrl);
    }

    /**
     * Pause a running agent (light checkpoint by default, CRIU optional).
     * @param podName - Pod name hosting the agent
     */
    async pauseAgent(podName: string): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.pauseAgent(token, podName, baseUrl);
    }

    /**
     * Resume a paused/checkpointed agent.
     * @param podName - Pod name hosting the agent
     */
    async resumeAgent(podName: string): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.resumeAgent(token, podName, baseUrl);
    }

    /**
     * Get conversation checkpoints for an agent.
     * @param podName - Pod name
     * @param agentId - Optional agent ID
     * @returns Array of checkpoints
     */
    async getAgentCheckpoints(
      podName: string,
      agentId?: string,
    ): Promise<ConversationCheckpoint[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.getAgentCheckpoints(token, podName, agentId, baseUrl);
    }

    /**
     * Get usage summary for an agent.
     * @param podName - Pod name
     * @param agentId - Optional agent ID
     * @returns Usage summary including tokens, cost, iterations
     */
    async getAgentUsage(
      podName: string,
      agentId?: string,
    ): Promise<AgentUsageSummary> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return agents.getAgentUsage(token, podName, agentId, baseUrl);
    }

    // ========================================================================
    // Tool Approvals
    // ========================================================================

    /**
     * List tool approval requests, optionally filtered.
     * @param filters - Optional filters (status, agentId)
     * @returns Array of tool approval records
     */
    async getToolApprovals(
      filters?: ToolApprovalFilters,
    ): Promise<ToolApproval[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return toolApprovals.getToolApprovals(token, filters, baseUrl);
    }

    /**
     * Approve a tool execution request.
     * @param approvalId - ID of the approval to approve
     */
    async approveToolRequest(approvalId: string): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return toolApprovals.approveToolRequest(token, approvalId, baseUrl);
    }

    /**
     * Reject a tool execution request.
     * @param approvalId - ID of the approval to reject
     * @param reason - Optional rejection reason
     */
    async rejectToolRequest(
      approvalId: string,
      reason?: string,
    ): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return toolApprovals.rejectToolRequest(
        token,
        approvalId,
        reason,
        baseUrl,
      );
    }

    // ========================================================================
    // Notifications
    // ========================================================================

    /**
     * List notifications, optionally filtered.
     * @param filters - Optional filters (level, read status)
     * @returns Array of notifications
     */
    async getNotifications(
      filters?: NotificationFilters,
    ): Promise<AgentNotification[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return notifications.getNotifications(token, filters, baseUrl);
    }

    /**
     * Mark a single notification as read.
     * @param notificationId - ID of the notification
     */
    async markNotificationRead(notificationId: string): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return notifications.markNotificationRead(token, notificationId, baseUrl);
    }

    /**
     * Mark all notifications as read.
     */
    async markAllNotificationsRead(): Promise<void> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return notifications.markAllRead(token, undefined, baseUrl);
    }

    // ========================================================================
    // Events
    // ========================================================================

    /**
     * Create an event for an agent.
     * @param data - Event payload
     * @returns Created event
     */
    async createEvent(
      data: CreateAgentEventRequest,
    ): Promise<{ success: boolean; event: AgentEvent }> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return events.createEvent(token, data, baseUrl);
    }

    /**
     * List events with optional filters.
     * @param params - Optional list filters
     * @returns Paginated events response
     */
    async listEvents(
      params: ListAgentEventsParams = {},
    ): Promise<ListAgentEventsResponse> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return events.listEvents(token, params, baseUrl);
    }

    /**
     * Get a single event by identifier.
     * @param eventId - Event identifier
     * @returns Event response
     */
    async getEvent(eventId: string): Promise<GetAgentEventResponse> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return events.getEvent(token, eventId, baseUrl);
    }

    /**
     * Update an event.
     * @param eventId - Event identifier
     * @param data - Event patch payload
     * @returns Updated event response
     */
    async updateEvent(
      eventId: string,
      data: UpdateAgentEventRequest,
    ): Promise<GetAgentEventResponse> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return events.updateEvent(token, eventId, data, baseUrl);
    }

    // ========================================================================
    // Output
    // ========================================================================

    /**
     * List output artifacts for an agent.
     * @param agentId - Agent identifier
     * @returns Array of output artifacts
     */
    async getAgentOutputs(agentId: string): Promise<OutputArtifact[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return output.getAgentOutputs(token, agentId, baseUrl);
    }

    /**
     * Get a specific output artifact.
     * @param agentId - Agent identifier
     * @param outputId - Output artifact ID
     * @returns Output artifact details
     */
    async getAgentOutput(
      agentId: string,
      outputId: string,
    ): Promise<OutputArtifact> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return output.getAgentOutput(token, agentId, outputId, baseUrl);
    }

    /**
     * Generate a new output artifact (e.g. PDF).
     * @param agentId - Agent identifier
     * @param format - Output format
     * @param options - Generation options
     * @returns Generated output artifact
     */
    async generateAgentOutput(
      agentId: string,
      format: string,
      options?: Record<string, any>,
    ): Promise<OutputArtifact> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return output.generateAgentOutput(
        token,
        agentId,
        format,
        options,
        baseUrl,
      );
    }

    // ========================================================================
    // Evals
    // ========================================================================

    /**
     * Run evaluations on an agent.
     * @param agentId - Agent identifier
     * @param request - Eval run request parameters
     * @returns Eval report
     */
    async runEvals(
      agentId: string,
      request: RunEvalsRequest,
    ): Promise<EvalReport> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return evals.runEvals(token, agentId, request, baseUrl);
    }

    /**
     * List eval reports for an agent.
     * @param agentId - Agent identifier
     * @returns Array of eval reports
     */
    async listEvals(agentId: string): Promise<EvalReport[]> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return evals.listEvals(token, agentId, baseUrl);
    }

    /**
     * Get a specific eval report.
     * @param agentId - Agent identifier
     * @param evalId - Eval report ID
     * @returns Eval report details
     */
    async getEval(agentId: string, evalId: string): Promise<EvalReport> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return evals.getEval(token, agentId, evalId, baseUrl);
    }

    // ========================================================================
    // Context & Cost
    // ========================================================================

    /**
     * Get context window usage for an agent.
     * @param agentId - Agent identifier
     * @returns Context usage details
     */
    async getContextUsage(agentId: string): Promise<ContextUsage> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return context.getContextUsage(token, agentId, baseUrl);
    }

    /**
     * Get cost usage for an agent.
     * @param agentId - Agent identifier
     * @returns Cost usage including per-model breakdown
     */
    async getCostUsage(agentId: string): Promise<CostUsage> {
      const token = (this as any).getToken();
      const baseUrl = (this as any).getIamRunUrl();
      return context.getCostUsage(token, agentId, baseUrl);
    }
  };
}
