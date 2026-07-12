/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * User-related Spacer API functions for the Datalayer platform.
 *
 * Provides functions for user-specific operations in the Spacer service.
 *
 * @module api/spacer/users
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { SpacesForUserResponse } from '../../models/SpaceDTO';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';

/**
 * Get all spaces for the current authenticated user.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the API (defaults to production Spacer URL)
 * @returns Promise resolving to the user's spaces
 * @throws {Error} If authentication token is missing or invalid
 */
export const getMySpaces = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<SpacesForUserResponse> => {
  validateToken(token);

  return requestDatalayerAPI<SpacesForUserResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/users/me`,
    method: 'GET',
    token,
  });
};
