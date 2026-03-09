/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * API client functions for the agent-runtimes backend.
 *
 * Provides functions to create, list, and manage agents
 * via the agent-runtimes REST API.
 *
 * @module api
 */

/** Base URL for the agent-runtimes API (same-origin by default). */
const DEFAULT_BASE_URL = '/api/v1';

/**
 * Create a new agent via the agent-runtimes API.
 *
 * @param payload - Agent creation config matching CreateAgentRequest on the backend.
 * @param baseUrl - Base URL for the API (defaults to same-origin /api/v1).
 * @returns Promise resolving to the created agent response.
 */
export async function createAgent(
  payload: Record<string, unknown>,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create agent (${response.status}): ${errorText}`,
    );
  }
  return response.json();
}

/**
 * List all agents.
 *
 * @param baseUrl - Base URL for the API.
 * @returns Promise resolving to the agents list.
 */
export async function listAgents(
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/agents`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to list agents (${response.status})`);
  }
  return response.json();
}

/**
 * Get a specific agent by ID.
 *
 * @param agentId - The agent ID.
 * @param baseUrl - Base URL for the API.
 * @returns Promise resolving to the agent details.
 */
export async function getAgent(
  agentId: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${baseUrl}/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to get agent '${agentId}' (${response.status})`);
  }
  return response.json();
}

/**
 * Delete an agent by ID.
 *
 * @param agentId - The agent ID.
 * @param baseUrl - Base URL for the API.
 */
export async function deleteAgent(
  agentId: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to delete agent '${agentId}' (${response.status})`);
  }
}
