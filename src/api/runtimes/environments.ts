/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Computing environments API functions for the Datalayer platform.
 *
 * Provides functions for managing computing environment configurations.
 *
 * @module api/runtimes/environments
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { ListEnvironmentsResponse } from '../../models/EnvironmentDTO';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';

/**
 * List all available computing environments.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to list of available environments
 * @throws {Error} If authentication token is missing or invalid
 */
export const listEnvironments = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<ListEnvironmentsResponse> => {
  validateToken(token);

  return requestDatalayerAPI<ListEnvironmentsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/environments`,
    method: 'GET',
    token,
  });
};
