/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ACP specific types (WebSocket-based)
 */
export namespace ACP {
  export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
    id: string | number;
  }

  export interface JsonRpcResponse {
    jsonrpc: '2.0';
    result?: unknown;
    error?: {
      code: number;
      message: string;
      data?: unknown;
    };
    id: string | number;
  }
}
