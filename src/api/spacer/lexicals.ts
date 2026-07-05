/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lexical documents API functions for the Datalayer platform.
 *
 * Provides functions for creating, retrieving, and updating lexical (rich text) documents.
 *
 * @module api/spacer/lexicals
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  CreateLexicalRequest,
  CreateLexicalResponse,
  GetLexicalResponse,
  UpdateLexicalRequest,
  UpdateLexicalResponse,
} from '../../models/LexicalDTO';

/**
 * Create a new lexical document.
 * @param token - Authentication token
 * @param data - Document creation configuration
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the created document response
 */
export const createLexical = async (
  token: string,
  data: CreateLexicalRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<CreateLexicalResponse> => {
  // Create FormData for multipart/form-data request (like the working example)
  const formData = new FormData();
  formData.append('spaceId', data.spaceId);
  formData.append('name', data.name);
  formData.append('documentType', data.documentType || 'lexical'); // Required field
  formData.append('description', data.description || ''); // Required field - can be empty

  // Add file if provided
  if (data.file) {
    if (data.file instanceof File) {
      formData.append('file', data.file, data.file.name);
    } else {
      // Handle Blob case
      formData.append('file', data.file, `${data.name}.json`);
    }
  }

  const url = `${baseUrl}${API_BASE_PATHS.SPACER}/lexicals`;
  return requestDatalayerAPI<CreateLexicalResponse>({
    url,
    method: 'POST',
    token,
    body: formData,
  });
};

/**
 * Get a lexical document by ID.
 * @param token - Authentication token
 * @param id - The document ID
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the document response
 */
export const getLexical = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<GetLexicalResponse> => {
  return requestDatalayerAPI<GetLexicalResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/lexicals/${id}`,
    method: 'GET',
    token,
  });
};

/**
 * Update a lexical document.
 * @param token - Authentication token
 * @param id - The document ID
 * @param data - Update data containing name and/or description
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the updated document response
 */
export const updateLexical = async (
  token: string,
  id: string,
  data: UpdateLexicalRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<UpdateLexicalResponse> => {
  return requestDatalayerAPI<UpdateLexicalResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/lexicals/${id}`,
    method: 'PUT',
    token,
    body: data,
  });
};

/**
 * Clone a lexical document.
 * @param token - Authentication token
 * @param id - The document ID to clone
 * @param baseUrl - Base URL for the API (defaults to production)
 * @returns Promise resolving to the cloned document response
 */
export const cloneLexical = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SPACER,
): Promise<CreateLexicalResponse> => {
  return requestDatalayerAPI<CreateLexicalResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SPACER}/lexicals/${id}/clone`,
    method: 'POST',
    token,
  });
};
