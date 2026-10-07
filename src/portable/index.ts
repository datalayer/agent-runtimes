/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What any JavaScript runtime can import from Agent Runtimes: no React, DOM,
 * Jupyter or Node built-in. Re-exports only; the mobile app reaches Agent
 * Runtimes through this entry alone.
 *
 * @module portable
 */

export {
  messageOfApproval,
  normalizeApproval,
  whyAsked,
  type ApprovalArgs,
  type ApprovalRecord,
  type MessageAsked,
} from '../utils/approvals';

// The AG-UI stream client and the messages it builds; a phone passes a
// streaming `fetch` in the adapter's config.
export { AGUIAdapter, type AGUIAdapterConfig } from '../protocols/AGUIAdapter';
export {
  createActivityMessage,
  createAssistantMessage,
  createUserMessage,
  generateMessageId,
  type ChatMessage,
  type ChatMessageDelta,
  type ChatMessageInput,
  type ChatThread,
  type ContentPart,
  type MessageRole,
  type ToolCallStatus,
} from '../types/messages';
export type {
  ProtocolAdapterConfig,
  ProtocolConnectionState,
  ProtocolEvent,
  ProtocolEventHandler,
} from '../types/protocol';
