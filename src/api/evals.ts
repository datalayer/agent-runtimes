/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Evaluation runs API functions.
 *
 * Provides functions for triggering, listing, and retrieving
 * evaluation reports for agents.
 *
 * @module api/evals
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import type { EvalReport, RunEvalsRequest } from './types';

/**
 * Trigger an evaluation run for the specified agent.
 * @param token - Authentication token
 * @param agentId - Agent ID
 * @param request - Eval run request body
 * @param baseUrl - Base URL
 * @returns Promise resolving to the eval report
 */
export const runEvals = async (
  token: string,
  agentId: string,
  request: RunEvalsRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<EvalReport> => {
  validateToken(token);
  return requestDatalayerAPI<EvalReport>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(agentId)}/evals/run`,
    method: 'POST',
    token,
    body: request,
  });
};

/**
 * List past evaluation runs for an agent.
 * @param token - Authentication token
 * @param agentId - Agent ID
 * @param baseUrl - Base URL
 * @returns Promise resolving to list of eval reports
 */
export const listEvals = async (
  token: string,
  agentId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<EvalReport[]> => {
  validateToken(token);
  return requestDatalayerAPI<EvalReport[]>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(agentId)}/evals`,
    method: 'GET',
    token,
  });
};

/**
 * Get a specific evaluation report.
 * @param token - Authentication token
 * @param agentId - Agent ID
 * @param evalId - Eval run ID
 * @param baseUrl - Base URL
 * @returns Promise resolving to the eval report
 */
export const getEval = async (
  token: string,
  agentId: string,
  evalId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<EvalReport> => {
  validateToken(token);
  return requestDatalayerAPI<EvalReport>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(agentId)}/evals/${encodeURIComponent(evalId)}`,
    method: 'GET',
    token,
  });
};
