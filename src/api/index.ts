/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * API client functions for the agents backend.
 *
 * Provides functions to create, list, and manage agents
 * via the agent-runtimes REST API.
 *
 * @module api
 */

// Agents Service API (agents, notifications, etc.)
// Tool approvals are intentionally NOT exposed over REST here — all
// approval interactions flow over the websocket stream; see
// `hooks/useToolApprovals` and `components/ToolApprovalBanner`.
export * as agents from './agents';
export * as context from './context';
export * as evals from './evals';
export * as events from './events';
export * as notifications from './notifications';
export * as output from './output';
