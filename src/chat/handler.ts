/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Simple API request handler.
 * Helper function to make API requests to the Simple server.
 *
 * @module components/chat/handler
 */

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

/**
 * Call the API extension
 *
 * @param endPoint - API REST end point for the extension
 * @param init - Initial values for the request
 * @returns The response body interpreted as JSON
 *
 * @example
 * ```typescript
 * // GET request
 * const config = await requestAPI<Config>('config');
 *
 * // POST request
 * const result = await requestAPI<Result>('chat', {
 *   method: 'POST',
 *   body: JSON.stringify({ message: 'Hello' }),
 * });
 * ```
 */
export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {},
): Promise<T> {
  // Make request to Simple API
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(settings.baseUrl, 'agent_runtimes', endPoint);

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as TypeError);
  }

  let data: unknown = await response.text();

  if ((data as string).length > 0) {
    try {
      data = JSON.parse(data as string);
    } catch {
      // Not a JSON response body
    }
  }

  if (!response.ok) {
    throw new ServerConnection.ResponseError(
      response,
      (data as { message?: string }).message || (data as string),
    );
  }

  return data as T;
}
