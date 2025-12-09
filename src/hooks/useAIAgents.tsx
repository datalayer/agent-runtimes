/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCoreStore, useDatalayer } from '@datalayer/core';
import { URLExt } from '@jupyterlab/coreutils';

export type RequestOptions = {
  signal?: AbortSignal;
  baseUrl?: string;
};

export type RoomType = 'notebook_persist' | 'notebook_memory' | 'doc_memory';

export const useAIAgents = (baseUrlOverride = 'api/ai-agents/v1') => {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const createAIAgent = (
    documentId: string,
    documentType: RoomType,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'POST',
      body: {
        document_id: documentId,
        document_type: documentType,
        runtime: {
          ingress,
          token,
          kernel_id: kernelId,
        },
      },
      signal,
    });
  };
  const getAIAgents = ({
    signal,
    baseUrl = baseUrlOverride,
  }: RequestOptions = {}) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'GET',
      signal,
    });
  };
  const deleteAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'DELETE',
      signal,
    });
  };
  const getAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'GET',
      signal,
    });
  };
  const patchAIAgent = (
    documentId: string,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'PATCH',
      body: {
        runtime:
          ingress && token && kernelId
            ? {
                ingress,
                token,
                kernel_id: kernelId,
              }
            : null,
      },
      signal,
    });
  };
  return {
    createAIAgent,
    getAIAgents,
    deleteAIAgent,
    getAIAgent,
    patchAIAgent,
  };
};

export default useAIAgents;
