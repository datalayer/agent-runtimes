/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Middleware exports for chat component.
 *
 * @module components/chat/middleware
 */

export {
  MiddlewarePipeline,
  createMiddleware,
  loggingMiddleware,
  createHITLMiddleware,
  type RequestContext,
  type ResponseContext,
} from './MiddlewarePipeline';

// Re-export middleware types
export type { ChatMiddleware, MiddlewareContext } from '../types/middleware';
