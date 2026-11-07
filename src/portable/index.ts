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
  seatOfApproval,
  seatSaid,
  whyAsked,
  type ApprovalArgs,
  type ApprovalRecord,
  type MessageAsked,
  type SeatAsked,
  type SeatSource,
} from './approvals';

// An approval as every card says it (M-016).
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
// A run's stream reduced to what a chat host shows (DC-005, S-205).
export {
  answerParts,
  isTerminal,
  SEMANTIC_EVENTS_VERSION,
  SEMANTIC_KINDS,
  type AnswerPart,
  type AskQuestion,
  type SemanticEvent,
  type SemanticKind,
} from './semantic';
export {
  askQuestionOf,
  semanticOf,
  turnOf,
  type TurnInfo,
} from './semanticOfAgUi';
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

// What an application is doing, in the words beside its face (T-08).
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
export { activityFixture, conversationFixture } from './fixtures';

// The protocol displays a run's tool results carry (M-037).
export {
  DISPLAY_META_KEY,
  displayLine,
  displayOfToolResult,
  PAP_CONFIRM_TYPE,
  PAP_HANDOFF_TOOL,
  PAP_REPLIES_TYPE,
  PAP_SIGN_IN_TYPE,
  protocolDisplayOf,
  replyAuthor,
  type ActionClass,
  type ProtocolDisplay,
  // A coding agent's diff and terminal (SH-16).
  DIFF_LINES_LIMIT,
  SHIELD_DIFF_TYPE,
  SHIELD_TERMINAL_TYPE,
  languageOf,
  unifiedDiffLines,
  unifiedDiffText,
  type DiffLine,
} from './displays';
export { shieldDisplayFixtures } from './fixtures';
export {
  isPapSignInTool,
  PAP_SIGN_IN_WORDS,
  readPapSignIn,
  safeSignInUrl,
  type PapSignInWaiting,
} from './signIn';

// A Direct Conversation the person types in themselves (P-08, M-038).
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

// How a sign-in under way stands, asked by the person's own client (M-039).
export {
  SIGN_IN_POLL_MS,
  SIGN_IN_STATUS_PATH,
  signInStandsOf,
  signInStatusClient,
  type SignInStands,
} from './signInStatus';

// What a company asks the person to type in a mediated sign-in, sent with its one-use ticket (M-039).
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

// How a streamed turn went, measured without its words (M-036).
export {
  failureOf,
  otlpMetricsOf,
  RunMeter,
  type RunMeasure,
  type StreamFailure,
} from './runMeasures';

// What an application is doing, its record's entries, and its sessions as
// the record lists them (R-15, M-015b).
export {
  ACTIVITY_WORDS,
  activityOf,
  entryOf,
  entrySaid,
  mergeActivityPages,
  runEndOf,
  scheduledSays,
  SESSION_LINEAGE_WORDS,
  SESSION_STATE_WORDS,
  SESSION_STATES,
  SESSION_TURN_WORDS,
  SESSION_TURNS,
  sessionAgentSaid,
  sessionLineageSaid,
  sessionPageOf,
  sessionRowOf,
  sessionSentence,
  sessionStateSaid,
  wakesOn,
  type AppActivity,
  type RecordEntry,
  type RecordKind,
  type ScheduledRun,
  type SessionLineage,
  type SessionRow,
  type SessionRunsOn,
  type SessionState,
  type SessionTurn,
} from './activity';

// A deployment's pause, resume and reset, and its recorded events (R-17, M-041b).
export {
  deploymentEventLine,
  deploymentEventOf,
  notDeletedOf,
  resetBody,
  resetCountsOf,
  resetLines,
  stateChangeBody,
  stoppedWorkLine,
  stoppedWorkOf,
  type DeploymentEvent,
  type DeploymentEventKind,
  type DeploymentState,
  type ResetCounts,
  type StoppedWork,
} from './lifecycle';

// A person's agent runtimes, and an agent's summary (M-014b).
export {
  agentRuntimesOf,
  agentSummaryOfRuntime,
  CREATING_STATUSES,
  isAgentRuntime,
  isCreatingAgent,
  runtimeOf,
  type AgentRuntime,
  type AgentSummaryData,
} from './runtimes';

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
