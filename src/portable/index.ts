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

// An approval as every card says it (MOBILE M-016).
export {
  actionOf,
  APPROVAL_CARD_WORDS,
  approvalCardOf,
  argumentsShown,
  type ApprovalCard,
  type ApprovalCardProps,
  type ApprovalCardSource,
} from './approvalCard';

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
  BROWSER_LIMITS,
  CUT_MARK,
  DEVICE_LIMITS,
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
  withoutItems,
  withPrompt,
  withTurnEnded,
  type ConversationItem,
  type ConversationLimits,
  type ConversationQuestion,
  type ConversationState,
  type ToolAwaiting,
  type ToolCodeError,
  type TurnEnd,
} from './conversation';

// What every protocol adapter says, as the conversation reads it (M-030).
export {
  conversationEventsOf,
  sanitizeAssistantContent,
  snapshotOfMessages,
  type AdapterEvent,
  type SaidMessage,
} from './adapterEvents';

// What an application is doing, in the words beside its face (LOOP T-08).
export {
  PRESENCE_LINES,
  presenceOfConversation,
  presenceState,
  presenceToolOf,
  type PresenceState,
  type PresenceTool,
} from './presence';

// One contract for every renderer of a conversation's components.
export {
  ANSWER_BELOW,
  ANSWER_COMPLETE,
  composerOf,
  droppedWords,
  ENDED_WORDS,
  messageLabel,
  OPENING_WORDS,
  presenceLine,
  showsQuestion,
  stepLine,
  TOOL_STATUS_WORDS,
  toolLabel,
  type ComposerProps,
  type ComposerState,
  type ConversationViewProps,
  type ErrorItem,
  type ErrorRowProps,
  type MessageItem,
  type MessageRowProps,
  type PresenceLineProps,
  type ProtocolDisplayProps,
  type QuestionCardProps,
  type StepItem,
  type StepRowProps,
  type ToolItem,
  type ToolRowProps,
  type TurnEndItem,
  type TurnEndRowProps,
} from './views';
export { conversationFixture } from './fixtures';

// The protocol displays a run's tool results carry (MOBILE M-037).
export {
  DISPLAY_META_KEY,
  displayLine,
  displayOfToolResult,
  PAP_CONFIRM_TYPE,
  PAP_HANDOFF_TOOL,
  PAP_OUTCOME_TYPE,
  PAP_REPLIES_TYPE,
  PAP_SIGN_IN_TYPE,
  protocolDisplayOf,
  replyAuthor,
  type ActionClass,
  type ProtocolDisplay,
} from './displays';
export {
  isPapSignInTool,
  PAP_SIGN_IN_WORDS,
  readPapSignIn,
  safeSignInUrl,
  type PapSignInWaiting,
} from './signIn';

// A Direct Conversation the person types in themselves (PAP_DATALAYER P-08, MOBILE M-038).
export {
  DIRECT_MAX,
  DIRECT_WORDS,
  directAnswerOf,
  directAuthor,
  directClient,
  openDirect,
  withDirectAnswer,
  type DirectAnswer,
  type DirectClient,
  type DirectClientOptions,
  type DirectLine,
  type DirectOpen,
  type DirectReply,
  type DirectTarget,
} from './direct';

// How a sign-in under way stands, asked by the person's own client (MOBILE M-039).
export {
  SIGN_IN_POLL_MS,
  SIGN_IN_STATUS_PATH,
  signInStandsOf,
  signInStatusClient,
  type SignInStands,
} from './signInStatus';

// What a company asks the person to type in a mediated sign-in, sent with its one-use ticket (MOBILE M-039).
export {
  emptyFields,
  fieldProblems,
  MAX_VALUE_LENGTH,
  PROTECTED_INPUT_WORDS,
  protectedInputClient,
  protectedRequestOf,
  ProtectedRequestGone,
  sentWords,
  submitBody,
  submitWords,
  ticketComplete,
  ticketOfPage,
  type ProtectedField,
  type ProtectedRequest,
} from './protectedInput';

// How a streamed turn went, measured without its words (MOBILE M-036).
export {
  failureOf,
  otlpMetricsOf,
  RunMeter,
  type RunMeasure,
  type StreamFailure,
} from './runMeasures';

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
