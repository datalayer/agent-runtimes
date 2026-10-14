/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What any JavaScript runtime can import from Agent Runtimes: no React, DOM,
 * Jupyter, Reactor or Node module. Every module it reaches at run time lives
 * in this folder (a test holds it to that), so that Datalayer Mobile's Metro
 * graph takes `lib/portable/*` and nothing else of Agent Runtimes.
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
} from './approvals';

// A run's stream, read as every client reads it.
export {
  AgUiFrames,
  endsRun,
  eventsOfStream,
  NOT_STREAMING,
  REACTOR_UI_NAME,
  readRunStream,
  RUN_CUT_SHORT,
  toolResultOf,
  UI_ON_RUN,
  type AgUiEvent,
  type ToolResultSaid,
} from './agui';
export {
  AG_UI_NOT_ALLOWED,
  AG_UI_NOT_ON_RUNTIME,
  agUiRefusal,
  refusalBody,
  refusalDetail,
} from './agUiRefusal';

// The record's words, and a person's conversation read again.
export { ASKED_FOR_TAG, askedOf, RUN_END_WORDS } from './records';
export {
  messagesOfThread,
  openThread,
  snapshotOfStream,
  THREAD_WORDS,
} from './thread';

// A conversation as its stream builds it, for a native client.
export {
  CUT_MARK,
  DIAGNOSTIC_LIMIT,
  emptyConversation,
  formFieldsOf,
  ITEM_LIMIT,
  MESSAGE_TEXT_LIMIT,
  questionOf,
  questionWords,
  reduceConversation,
  TOOL_TEXT_LIMIT,
  withError,
  withPrompt,
  withTurnEnded,
  type ConversationItem,
  type ConversationQuestion,
  type ConversationState,
  type TurnEnd,
} from './conversation';

// The runtime's routes a native client drives.
export {
  agentRunClient,
  agentRuntimesUrlOf,
  appSessionsClient,
  RuntimeRefusal,
  type AgentRunClient,
  type AgentTurn,
  type AppSessionsClient,
  type RuntimeClientOptions,
  type SessionStart,
  type StreamOptions,
} from './sessions';

export type { ChatMessage } from '../types/messages';
