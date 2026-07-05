/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Workspace spaces API functions for the Datalayer platform.
 *
 * Provides function for creating workspace spaces.
 *
 * @module api/spacer/spaces
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import {
  CreateSpaceRequest,
  CreateSpaceResponse,
  GetSpaceResponse,
  UpdateSpaceRequest,
  UpdateSpaceResponse,
  DeleteSpaceResponse,
  GetSpaceDefaultItemsResponse,
  GetSpacesByTypeResponse,
} from '../../models/SpaceDTO';

/**
 * Create a new workspace space.
 * @param token - Authentication token
 * @param data - Space creation configuration
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the created space response
 */
export const createSpace = async (
  token: string,
  data: CreateSpaceRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<CreateSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<CreateSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces`,
    method: 'POST',
    token,
    body: data,
  });
};

/**
 * Get a space by UID.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the space response
 */
export const getSpace = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<GetSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}`,
    method: 'GET',
    token,
  });
};

/**
 * Update a space (owner updating their own space).
 * @param token - Authentication token
 * @param uid - Space UID
 * @param data - Update data (supports arbitrary Solr fields)
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the updated space response
 */
export const updateSpace = async (
  token: string,
  uid: string,
  data: UpdateSpaceRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<UpdateSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<UpdateSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}`,
    method: 'PUT',
    token,
    body: data,
  });
};

/**
 * Update a user-specific space (e.g., org admin managing another user's space).
 * @param token - Authentication token
 * @param uid - Space UID
 * @param userId - User ID
 * @param data - Update data (supports arbitrary Solr fields)
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the updated space response
 */
export const updateUserSpace = async (
  token: string,
  uid: string,
  userId: string,
  data: UpdateSpaceRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<UpdateSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<UpdateSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}/users/${userId}`,
    method: 'PUT',
    token,
    body: data,
  });
};

/**
 * Delete a space and all its contents.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the delete response
 */
export const deleteSpace = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<DeleteSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<DeleteSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}`,
    method: 'DELETE',
    token,
  });
};

/**
 * Get default items (notebook UID and document UID) for a space.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the default items response
 */
export const getSpaceDefaultItems = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetSpaceDefaultItemsResponse> => {
  validateToken(token);

  return requestDatalayerAPI<GetSpaceDefaultItemsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}/default-items`,
    method: 'GET',
    token,
  });
};

/**
 * Get spaces by type (e.g., 'project', 'workspace', 'course').
 * @param token - Authentication token
 * @param type - Space type to filter by
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the spaces response
 */
export const getSpacesByType = async (
  token: string,
  type: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetSpacesByTypeResponse> => {
  validateToken(token);

  return requestDatalayerAPI<GetSpacesByTypeResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/types/${type}`,
    method: 'GET',
    token,
  });
};

/**
 * Make a space public.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the updated space response
 */
export const makeSpacePublic = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<UpdateSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<UpdateSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}/public`,
    method: 'PUT',
    token,
  });
};

/**
 * Make a space private.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the updated space response
 */
export const makeSpacePrivate = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<UpdateSpaceResponse> => {
  validateToken(token);

  return requestDatalayerAPI<UpdateSpaceResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}/private`,
    method: 'PUT',
    token,
  });
};

/**
 * Export a space and its contents.
 * @param token - Authentication token
 * @param uid - Space UID
 * @param baseUrl - Base URL for the API
 * @returns Promise resolving to the export data
 */
export const exportSpace = async (
  token: string,
  uid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<any> => {
  validateToken(token);

  return requestDatalayerAPI<any>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/spaces/${uid}/export`,
    method: 'GET',
    token,
  });
};
