/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Items API functions for the Datalayer platform.
 *
 * Provides functions for managing items in spaces.
 *
 * @module api/spacer/items
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  DeleteSpaceItemResponse,
  GetSpaceItemResponse,
  GetSpaceItemsResponse,
} from '../../models/SpaceDTO';

/**
 * Get the items of a space.
 * @param token - Authentication token
 * @param spaceId - The space ID
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the items response
 */
export const getSpaceItems = async (
  token: string,
  spaceId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetSpaceItemsResponse> => {
  return requestDatalayerAPI<GetSpaceItemsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${spaceId}/items`,
    method: 'GET',
    token,
  });
};

/**
 * Get a single item from a space.
 * @param token - Authentication token
 * @param id - The item ID to retrieve
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the item response
 */
export const getItem = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetSpaceItemResponse> => {
  return requestDatalayerAPI<GetSpaceItemResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/items/${id}`,
    method: 'GET',
    token,
  });
};

/**
 * Delete an item from a space.
 * @param token - Authentication token
 * @param id - The item ID to delete
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving when deletion is complete
 */
export const deleteItem = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<DeleteSpaceItemResponse> => {
  return requestDatalayerAPI<DeleteSpaceItemResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/items/${id}`,
    method: 'DELETE',
    token,
  });
};
