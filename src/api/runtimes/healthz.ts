/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Health check API functions for the Datalayer Runtimes service.
 *
 * Provides functions for checking the health status of the Runtimes service.
 *
 * @module api/runtimes/healthz
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import type { HealthzPingResponse } from '@datalayer/core/lib/models/Common';

/**
 * Health check ping endpoint for Runtimes service
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Health check response
 * @throws {Error} If the health check fails
 *
 * @remarks
 * This endpoint provides a basic health check for the Runtimes service.
 * It returns the current status of the service.
 *
 * Expected status codes:
 * - 200: Service is healthy
 */
export const ping = async (
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<HealthzPingResponse> => {
  try {
    const response = await requestDatalayerAPI<HealthzPingResponse>({
      url: `${baseUrl}${API_BASE_PATHS.RUNTIMES}/ping`,
      method: 'GET',
    });

    return response;
  } catch (error: any) {
    // Check if it's a response error with status code information
    if (error.response) {
      const status = error.response.status;
      throw new Error(
        `Health check failed: Service unhealthy (status ${status}) - ${error.message}`,
      );
    }

    // Re-throw other errors (network errors, etc.)
    throw new Error(`Health check failed: ${error.message}`);
  }
};
