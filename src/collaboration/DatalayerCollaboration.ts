/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export type IFetchSessionId = {
  url: string;
  token?: string;
  /**
   * Custom fetch function to use instead of global fetch.
   * Useful for proxying requests in environments with CORS restrictions (e.g., VS Code webviews).
   */
  fetchFn?: typeof fetch;
};

/**
 * Fetch the session ID of a collaborative document from Datalayer.
 */
export async function requestDatalayerCollaborationSessionId({
  url,
  token,
  fetchFn = fetch,
}: IFetchSessionId): Promise<string> {
  const headers: HeadersInit = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetchFn(url, {
    method: 'GET',
    headers,
    credentials: token ? 'include' : 'omit',
    mode: 'cors',
    cache: 'no-store',
  });
  if (response.ok) {
    const content = await response.json();
    return content['sessionId'];
  }
  console.error('Failed to fetch session ID.', response);
  throw new Error('Failed to fetch session ID.');
}
