/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Main ChatBase component.
 * Provides a full chat interface with messages and input.
 * This is the base component used by all other chat container components.
 *
 * Supports multiple modes:
 * 1. Store mode: Uses Zustand store for state management (default)
 * 2. Protocol mode: Connects to backend via AG-UI, A2A, Vercel AI, or ACP protocols
 * 3. Custom mode: Uses onSendMessage prop for custom message handling
 *
 * @module chat/base/ChatBase
 */

import { useContext } from 'react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, Spinner, IconButton } from '@primer/react';
import { ReactorLazy } from '@datalayer/reactor/react';
import {
  ANSWER_ACTION,
  emptyUiModel,
  isFileRef,
  uploadFile,
  type Display,
  type UiAct,
  type UiModel,
  type UiOp,
} from '@datalayer/reactor/ui';
import { UiSocket } from '@datalayer/reactor/ui/ws';
import { SkeletonText } from '@primer/react/experimental';
import { SidebarExpandIcon } from '@primer/octicons-react';
import type { KernelMessage } from '@jupyterlab/services';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import type { INotebookContent } from '@jupyterlab/nbformat';
import { notebookStore, JupyterReactTheme } from '@datalayer/jupyter-react';
import {
  Box,
  setupPrimerPortals,
  useThemeStore,
  getColorPalette,
  getThemeConfig,
  useSystemColorMode,
} from '@datalayer/primer-addons';
import { AlertIcon, PersonIcon, UnmuteIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { QueryClientProvider, QueryClientContext } from '@tanstack/react-query';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import type { ChatMessage } from '../../types/messages';
import { askedOf } from '../../portable/records';
import { extractChatMessagesFromFullContext } from './fullContextMessages';
import { generateMessageId, createUserMessage } from '../../types/messages';
import type { ProtocolConfig, ProtocolEvent } from '../../types/protocol';
import type { BaseProtocolAdapter } from '../../protocols';
import type {
  ChatBaseProps,
  AvatarConfig,
  DisplayItem,
  ToolCallMessage,
  Suggestion,
  EphemeralSurfaceMode,
  ModelConfig,
} from '../../types/chat';
import type { AgentDetails } from '../../agents/AgentDetails';
import type { BuiltinTool } from '../../types/models';
import {
  AI_MODEL_CATALOGUE,
  DEFAULT_MODEL,
  isChatModel,
} from '../../specs/models';
import type { ContextSnapshotData } from '../../types/context';
import type { FrontendToolDefinition } from '../../types/tools';
import {
  internalQueryClient,
  isToolCallMessage,
  getMessageText,
  createProtocolAdapter,
  getApiBaseFromConfig,
  sanitizeAssistantContent,
} from '../../utils';
import {
  BROWSER_LIMITS,
  emptyConversation,
  reduceConversation,
  withError,
  withoutItems,
  withPrompt,
  withTurnEnded,
  type ConversationState,
} from '../../portable/conversation';
import {
  conversationEventsOf,
  snapshotOfMessages,
} from '../../portable/adapterEvents';
import type { AgUiEvent } from '../../portable/agui';
import {
  conversationDrawer,
  emptyChatLayer,
  rowIdOf,
  toolCallOf,
  type ChatLayer,
  type MessageExtras,
} from './conversationItems';
import {
  useConfig,
  useSkills,
  useSkillActions,
  useContextSnapshot,
  useSandbox,
} from '../../hooks';
import { useAgentRuntimeWebSocket } from '../../hooks/useAgentRuntimes';
import {
  agentRuntimeStore,
  useAgentRuntimeStore,
  useAgentRuntimeWsState,
} from '../../stores/agentRuntimeStore';
import {
  ChatBaseHeader,
  type ChatBaseHeaderProps,
} from '../header/ChatHeaderBase';
import { useChatAvailability } from './ChatAvailability';
import { ChatEmptyState } from '../display/EmptyState';
import { FloatingBrandButton } from '../display/FloatingBrandButton';
import { PoweredByTag } from '../display/PoweredByTag';
import type { ToolbarItem } from '@datalayer/primer-addons';
import { EphemeralSurfaceControl } from '../EphemeralSurfaceControl';
import {
  ChatMessageList,
  type ToolApprovalConfig,
} from '../messages/ChatMessageList';
import { InputPrompt } from '../prompt/InputPrompt';
import { ComposerVoice, spokenOf } from '../../voice/ComposerVoice';
import { answerSpokenOver } from '../../voice/handsFree';
import { ReadAloud, readsAloud } from '../../voice/ReadAloud';
import type { SpokenMetadata } from '../../voice/types';
import { settledVoice } from '../../voice/chatVoice';
import { useVoiceSettings } from '../../voice/useVoiceSettings';
import { useVoiceSpeaker } from '../../voice/useVoiceSpeaker';
import { useSpokenAnswers } from '../../voice/useSpokenAnswers';
import { saidMessageId, useSaidSentence } from '../../voice/captions';
import {
  isVoiceInterrupted,
  lineToSay,
  type VoiceActivity,
} from '../../voice/sayAloud';
import { isFloatingChatViewMode } from '../viewModes';
import {
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../tools';
import type { EphemeralNotebook } from '../notebook/EphemeralNotebook';
import {
  initialModelId,
  isOffered,
  offeredModels as offeredModelsFor,
} from './modelChoice';
// EphemeralDocument statically imports `@datalayer/jupyter-lexical` (which
// initialises Lumino-backed nodes on load). Lazy-load it so notebook-only chats
// never pull lexical into the bundle or trigger its module side effects.
const EphemeralDocument = React.lazy(() =>
  import('../document/EphemeralDocument').then(m => ({
    default: m.EphemeralDocument,
  })),
);
// The agent's details (its context charts draw with ECharts) and the
// companion notebook (JupyterLab's notebook) are opened by a click, not drawn
// with the conversation: each is its own chunk, fetched when first shown, so
// a chat — and an embedded application (D-08) — loads without them.
// A chunk that cannot load says so where the view would be.
const loadAgentDetails = () =>
  import('../../agents/AgentDetails').then(m => ({ default: m.AgentDetails }));
const loadEphemeralNotebook = () =>
  import('../notebook/EphemeralNotebook').then(m => ({
    default: m.EphemeralNotebook,
  }));
const lazyViewRefused = (what: string) => (error: Error) => (
  <Text as="p" sx={{ p: 3, color: 'danger.fg' }}>
    {`The ${what} could not be loaded: ${error.message}`}
  </Text>
);
const agentDetailsRefused = lazyViewRefused('agent details');
const ephemeralNotebookRefused = lazyViewRefused('notebook');
import { useNotebookTools } from '../../tools/adapters/agent-runtimes/notebookHooks';
import type { AgentStreamToolApprovalPayload } from '../../types/stream';
import { useAgentInspectorTracer } from '../../components/inspector/agentSpans';
import {
  chatSpanRecorder,
  type ChatSpanRecorder,
} from '../../components/inspector/chatSpans';
import { isStepDisplay, withLoopStep } from './loopStep';
import { applyLoopElement } from './loopElement';
import { tellLoopWindow } from './loopWindow';
import {
  displayPressOf,
  placeable,
  routeUiOp,
  withPress,
  withUiOp,
} from './uiOps';
import {
  namesFiles,
  withUploadedFiles,
  type UploadToConversation,
} from './uiFiles';
import { useChatWords } from '../ChatLanguage';

// Tracks pending prompts already auto-sent for a given conversation scope.
// This prevents layout-driven unmount/remount cycles from re-sending prompts.
const sentPendingPromptKeys = new Set<string>();

/**
 * Inline skeleton placeholder rendered inside the companion surface (notebook
 * or document) while the agent runtime is still launching and the real
 * ephemeral notebook/document is not yet ready. Shown in place of the surface
 * content (never as an overlay) so structure appears as early as possible.
 */
/**
 * Whether a frontend tool declares any parameter.
 *
 * The empty-args guard around execution exists for AG-UI, which emits a
 * first tool-call with `{}` and the real arguments in a later update. A
 * tool that declares no parameters never gets that update — `{}` IS its
 * full argument set — so waiting on it left the call executing forever.
 */
function frontendToolExpectsArgs(
  tool: FrontendToolDefinition | undefined,
): boolean {
  const parameters = tool?.parameters;
  if (!parameters) {
    return false;
  }
  if (Array.isArray(parameters)) {
    return parameters.length > 0;
  }
  const properties = (parameters as Record<string, unknown>).properties;
  if (properties && typeof properties === 'object') {
    return Object.keys(properties).length > 0;
  }
  return Object.keys(parameters).length > 0;
}

function CompanionSurfaceSkeleton({ mode }: { mode: 'notebook' | 'document' }) {
  return (
    <Box
      aria-label={
        mode === 'notebook' ? 'Preparing notebook…' : 'Preparing document…'
      }
      flex={1}
      minHeight={0}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      gap={3}
      p={4}
    >
      {mode === 'notebook' ? (
        <>
          {/* A few placeholder "cells". */}
          {[0, 1, 2].map(i => (
            <Box
              key={i}
              p={3}
              border="1px solid"
              borderColor="border.muted"
              borderRadius={2}
              bg="canvas.subtle"
              display="flex"
              flexDirection="column"
              gap={2}
            >
              <SkeletonText lines={1} />
              <SkeletonText lines={i === 0 ? 2 : 3} />
            </Box>
          ))}
        </>
      ) : (
        <Box
          maxWidth={860}
          width="100%"
          mx="auto"
          display="flex"
          flexDirection="column"
          gap={3}
        >
          <SkeletonText lines={1} />
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
          <SkeletonText lines={5} />
        </Box>
      )}
    </Box>
  );
}

// JupyterReactTheme forwards unknown props (e.g. `style`) to its inner Primer
// `BaseStyles`. `style` is not part of its typings, so we widen the type here.
const ThemedJupyterReactTheme = JupyterReactTheme as unknown as React.FC<
  React.PropsWithChildren<{
    colormode?: 'light' | 'dark' | 'auto';
    loadJupyterLabCss?: boolean;
    theme?: Record<string, unknown>;
    backgroundColor?: string;
    style?: React.CSSProperties;
  }>
>;

/**
 * Theme boundary shared by every chat variant.
 *
 * Makes the chat follow the active Datalayer theme *variant* (matrix, earth,
 * …) — its colours AND fonts — not merely the color mode, while keeping the
 * jupyter-react Primer context required by `KernelIndicator`.
 *
 * Implementation notes:
 * - We deliberately DON'T nest a `DatalayerThemeProvider` here. The host layout
 *   already provides one, and it themes Primer portals by writing styles onto
 *   `document.body`. Nesting another (especially one carrying layout styles
 *   like `display: contents`) clobbers those body/portal styles and breaks
 *   every overlay menu globally.
 * - Instead we re-assert the variant's CSS custom properties (`--bgColor-*`,
 *   `--fgColor-*`, `--fontStack-*`, …) INLINE on `JupyterReactTheme`'s
 *   `BaseStyles`. Inline styles win over the `@primer/primitives`
 *   `[data-color-mode]` rules that `JupyterReactTheme` re-scopes, so the chat
 *   subtree renders in the selected theme (colours + fonts). `JupyterReactTheme`
 *   also supplies the matching Primer theme object + resolved color mode for
 *   jupyter-react components.
 * - `display: contents` keeps the boundary from emitting a layout box (so the
 *   chat height/flex chain is preserved); CSS custom properties and inherited
 *   properties (color, font) still cascade through it.
 */
function ThemedChatBoundary({
  children,
  themeVariant,
  colorMode,
  themeOverrides,
}: React.PropsWithChildren<{
  themeVariant?: string;
  colorMode?: 'light' | 'dark' | 'auto';
  themeOverrides?: ChatBaseProps['themeOverrides'];
}>) {
  const storeColorMode = useThemeStore(s => s.colorMode);
  const storeThemeVariant = useThemeStore(s => s.theme);
  const resolvedColorMode = colorMode ?? storeColorMode;
  const resolvedThemeVariant = themeVariant ?? storeThemeVariant;
  const systemMode = useSystemColorMode();
  const themeConfig = getThemeConfig(resolvedThemeVariant as any);
  const resolvedMode =
    resolvedColorMode === 'auto' ? systemMode : resolvedColorMode;
  const modeStyles = {
    ...(resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light),
    // What the host lays over the theme: an application's accent (T-05).
    ...themeOverrides?.[resolvedMode],
  };
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';
  return (
    <ThemedJupyterReactTheme
      colormode={resolvedMode}
      theme={themeConfig.primerTheme}
      backgroundColor={themeBackground}
      loadJupyterLabCss={false}
      style={{
        ...(modeStyles as React.CSSProperties),
        color: 'var(--fgColor-default)',
        fontSize: 'var(--text-body-size-medium)',
        display: 'contents',
      }}
    >
      {children}
    </ThemedJupyterReactTheme>
  );
}
const AI_AGENTS_API_PREFIX = '/api/ai-agents/v1';

const isDevTraceEnabled = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

const logApprovalTrace = (
  label: string,
  details: Record<string, unknown>,
): void => {
  if (!isDevTraceEnabled()) {
    return;
  }
  console.debug(`[approval-trace] ${label}`, details);
};

const normalizeAgentId = (value?: string): string =>
  (value ?? '').trim().toLowerCase();
const normalizeToolName = (value: string): string =>
  value.replace(/[-_]/g, '').toLowerCase();
const normalizeSkillApprovalId = (value: string): string => {
  const idx = value.indexOf(':');
  if (idx <= 0) return value;
  return value.slice(0, idx);
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, itemValue]) =>
        `${JSON.stringify(key)}:${stableStringify(itemValue)}`,
    );
  return `{${entries.join(',')}}`;
};

const approvalSignature = (
  toolName: string,
  args: Record<string, unknown>,
): string => `${normalizeToolName(toolName)}::${stableStringify(args ?? {})}`;

const normalizeAiAgentsBaseUrl = (rawBaseUrl: string): string => {
  const trimmed = rawBaseUrl.replace(/\/$/, '');
  if (trimmed.endsWith(AI_AGENTS_API_PREFIX)) {
    return trimmed.slice(0, -AI_AGENTS_API_PREFIX.length);
  }
  return trimmed;
};

const toWsUrl = (
  baseUrl: string,
  path: string,
  token?: string,
): string | null => {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    if (token) {
      url.searchParams.set('token', token);
    } else {
      url.search = '';
    }
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeApprovalPayload = (
  input: Record<string, unknown>,
): AgentStreamToolApprovalPayload | null => {
  const id =
    (typeof input.id === 'string' && input.id) ||
    (typeof input.approval_id === 'string' && input.approval_id) ||
    (typeof input.approvalId === 'string' && input.approvalId) ||
    '';
  const toolName =
    (typeof input.tool_name === 'string' && input.tool_name) ||
    (typeof input.toolName === 'string' && input.toolName) ||
    '';
  if (!id || !toolName) {
    return null;
  }
  const toolArgs =
    (input.tool_args && typeof input.tool_args === 'object'
      ? (input.tool_args as Record<string, unknown>)
      : input.toolArgs && typeof input.toolArgs === 'object'
        ? (input.toolArgs as Record<string, unknown>)
        : undefined) ?? {};

  return {
    id,
    tool_name: toolName,
    tool_args: toolArgs,
    tool_call_id:
      (typeof input.tool_call_id === 'string' && input.tool_call_id) ||
      (typeof input.toolCallId === 'string' && input.toolCallId) ||
      undefined,
    note:
      (typeof input.note === 'string' && input.note) ||
      (typeof input.message === 'string' && input.message) ||
      undefined,
    status: (typeof input.status === 'string' && input.status) || 'pending',
    agent_id:
      (typeof input.agent_id === 'string' && input.agent_id) ||
      (typeof input.agentId === 'string' && input.agentId) ||
      undefined,
    created_at:
      (typeof input.created_at === 'string' && input.created_at) ||
      (typeof input.createdAt === 'string' && input.createdAt) ||
      undefined,
    updated_at:
      (typeof input.updated_at === 'string' && input.updated_at) ||
      (typeof input.updatedAt === 'string' && input.updatedAt) ||
      undefined,
  };
};

const statusFromApprovalEvent = (
  eventName?: string,
): 'pending' | 'approved' | 'rejected' | 'deleted' | undefined => {
  if (eventName === 'tool_approval_created') {
    return 'pending';
  }
  if (eventName === 'tool_approval_approved') {
    return 'approved';
  }
  if (eventName === 'tool_approval_rejected') {
    return 'rejected';
  }
  if (eventName === 'tool_approval_deleted') {
    return 'deleted';
  }
  return undefined;
};

const RESOLVED_TOOL_CALL_SUPPRESSION_MS = 15_000;

const isApprovalForAgent = (
  approval: AgentStreamToolApprovalPayload,
  activeAgentId?: string,
): boolean => {
  if (!activeAgentId) {
    return true;
  }
  if (!approval.agent_id) {
    return false;
  }
  if (approval.agent_id === activeAgentId) {
    return true;
  }
  const normalizedApprovalAgentId = normalizeAgentId(approval.agent_id);
  const normalizedActiveAgentId = normalizeAgentId(activeAgentId);
  return (
    normalizedApprovalAgentId.includes(normalizedActiveAgentId) ||
    normalizedActiveAgentId.includes(normalizedApprovalAgentId)
  );
};

function isToolCallOnlyPrompt(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /tool\s*call\s*only/.test(normalized) ||
    /use\s+(?:a\s+)?tool\s+call\s+only/.test(normalized)
  );
}

function formatToolResultFallback(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (
    typeof result === 'number' ||
    typeof result === 'boolean' ||
    result === null
  ) {
    return String(result);
  }
  try {
    const serialized = JSON.stringify(result, null, 2);
    return serialized.length > 2000
      ? `${serialized.slice(0, 2000)}\n...`
      : serialized;
  } catch {
    return 'Tool completed successfully.';
  }
}

function parseEnabledMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }

  const raw = (
    mcpStatusData as {
      enabled_tools_by_server?: unknown;
    }
  ).enabled_tools_by_server;

  if (raw == null) {
    return new Map<string, Set<string>>();
  }

  if (typeof raw !== 'object') {
    return new Map<string, Set<string>>();
  }

  const parsed = new Map<string, Set<string>>();
  for (const [serverId, toolNames] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(toolNames)) {
      continue;
    }
    const validToolNames = toolNames.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    const normalizedToolNames = validToolNames.map(name => {
      const sep = name.indexOf('__');
      return sep >= 0 ? name.slice(sep + 2) : name;
    });
    parsed.set(serverId, new Set(normalizedToolNames));
  }

  return parsed;
}

function parseApprovedMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }

  const raw = (
    mcpStatusData as {
      approved_tools_by_server?: unknown;
    }
  ).approved_tools_by_server;

  if (raw == null) {
    return new Map<string, Set<string>>();
  }

  if (typeof raw !== 'object') {
    return new Map<string, Set<string>>();
  }

  const parsed = new Map<string, Set<string>>();
  for (const [serverId, toolNames] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(toolNames)) {
      continue;
    }
    const validToolNames = toolNames.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    const normalizedToolNames = validToolNames.map(name => {
      const sep = name.indexOf('__');
      return sep >= 0 ? name.slice(sep + 2) : name;
    });
    parsed.set(serverId, new Set(normalizedToolNames));
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// ChatBase (outer wrapper — ensures QueryClient is available)
// ---------------------------------------------------------------------------

/** When the welcome is said: it has no time of its own. */
const WELCOME_AT = new Date(0);

/**
 * ChatBase component — Universal chat panel supporting store, protocol, and custom modes.
 */
export function ChatBase(props: ChatBaseProps) {
  const {
    agentRuntimeConfig,
    protocol: protocolProp,
    useStore: useStoreMode = true,
    disableInternalJupyterTheme = false,
    themeVariant,
    colorMode,
    themeOverrides,
  } = props;

  // Resolve protocol: string Protocol overrides type in agentRuntimeConfig or
  // is combined with a full ProtocolConfig object.
  const protocolType =
    typeof protocolProp === 'string' ? protocolProp : undefined;
  const protocolConfigProp =
    typeof protocolProp === 'object' ? protocolProp : undefined;

  const protocol: ProtocolConfig | undefined = agentRuntimeConfig
    ? {
        type: protocolType || agentRuntimeConfig.protocol || 'vercel-ai',
        endpoint: agentRuntimeConfig.url,
        authToken: agentRuntimeConfig.authToken,
        agentId: agentRuntimeConfig.agentId,
        enableConfigQuery: true,
        configEndpoint: `${agentRuntimeConfig.url}/api/v1/config`,
      }
    : protocolConfigProp;

  // If agentRuntimeConfig is provided, force protocol mode
  const effectiveUseStoreMode = agentRuntimeConfig ? false : useStoreMode;

  // Check if QueryClientProvider is already available
  const existingQueryClient = useContext(QueryClientContext);

  const innerProps: ChatBaseProps = {
    ...props,
    // Protocol is resolved to ProtocolConfig | undefined by the outer wrapper.
    // Force the type to satisfy ChatBaseProps (which accepts the union).
    protocol: protocol as ChatBaseProps['protocol'],
    useStore: effectiveUseStoreMode,
  };

  const content = <ChatBaseInner {...innerProps} />;
  const wrappedContent = disableInternalJupyterTheme ? (
    content
  ) : (
    <ThemedChatBoundary
      themeVariant={themeVariant}
      colorMode={colorMode}
      themeOverrides={themeOverrides}
    >
      {content}
    </ThemedChatBoundary>
  );

  if (!existingQueryClient) {
    return (
      <QueryClientProvider client={internalQueryClient}>
        {wrappedContent}
      </QueryClientProvider>
    );
  }

  return wrappedContent;
}

// ---------------------------------------------------------------------------
// ChatBaseInner — contains all actual logic
// ---------------------------------------------------------------------------

function ChatBaseInner({
  title,
  subtitle,
  showHeader = false,
  showTokenUsage = true,
  showContextRing = false,
  showLoadingIndicator = true,
  showErrors = true,
  showInput = true,
  showModelSelector = true,
  showToolsMenu = true,
  showSkillsMenu = true,
  disableInputPrompt = false,
  promptVariant,
  mentionableAgents: mentionableAgentsProp,
  promptCommands,
  showAgentsMenu = true,
  agents: agentsProp,
  selectedAgentId,
  onSelectAgent,
  disabled: disabledProp,
  disableReason: disableReasonProp,
  overlay,
  launching = false,
  launchingMessage,
  autoConnect = true,
  codemodeEnabled = false,
  onToggleCodemode,
  initialModel,
  availableModels,
  mcpServers,
  initialSkills: _initialSkills,
  className,
  loadingState,
  headerActions,
  kernelIndicatorState,
  kernelIndicatorPlacement = 'left',
  kernel,
  kernelEnvironmentName,
  kernelCpu,
  kernelMemory,
  kernelGpu,
  themeVariant,
  colorMode,
  chatViewMode,
  onChatViewModeChange,
  disabledViewModes,
  // Mode selection
  useStore: useStoreMode = true,
  protocol: protocolRaw,
  onSendMessage,
  onSendReady,
  onLoadingChange,
  onSpeakingChange,
  onContextSnapshot,
  enableStreaming = false,
  // Extended props
  brandIcon,
  avatarConfig,
  headerButtons,
  showPoweredBy = false,
  poweredByProps,
  emptyState,
  renderHeader,
  showTurnFooter = true,
  notebookToolSurfacesId,
  footerContent,
  welcome,
  trailingContent,
  voice,
  voiceSpeaking = false,
  voiceSentence,
  onStopSpeaking,
  voiceLevel,
  onReadAloud,
  showInformation = false,
  onInformationClick,
  headerContent,
  children,
  borderRadius,
  backgroundColor,
  border,
  boxShadow,
  compact = false,
  placeholder,
  description = 'Start a conversation with the AI agent.',
  onStateUpdate,
  onNewChat,
  onClear,
  onMessagesChange,
  onItemsChange,
  onDisplayItemsChange,
  autoFocus = false,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  focusTrigger,
  frontendTools: frontendToolsProp,
  enableEphemeralNotebook = false,
  initialEphemeralNotebookOpen = true,
  onEphemeralNotebookOpenChange,
  enableEphemeralDocument = false,
  initialEphemeralSurfaceMode,
  onEphemeralSurfaceModeChange,
  collapsed = false,
  onExpandFromCollapsed,
  ephemeralNotebookToolbar,
  ephemeralNotebookToolbarExtraItems,
  ephemeralDocumentToolbarExtraItems,
  ephemeralNotebookCollaborationProvider,
  ephemeralNotebookCollaborationDocumentId,
  ephemeralDocumentCollaboration,
  ephemeralRuntimeOverride,
  // Tool invocation hooks
  onToolCallStart,
  onToolCallComplete,
  inspector: inspectorGiven,
  // Identity/Authorization props
  onAuthorizationRequired: _onAuthorizationRequired,
  connectedIdentities,
  // Conversation persistence
  runtimeId,
  thread,
  historyEndpoint,
  historyAuthToken: _historyAuthToken,
  // Pending prompt
  pendingPrompt,
  contextSnapshot: externalContextSnapshot,
  mcpStatusData,
  sandboxStatusData,
  // Tool approval banner
  showToolApprovalBanner = true,
  pendingApprovals: pendingApprovalsProp,
  onApproveApproval: onApproveApprovalProp,
  onRejectApproval: onRejectApprovalProp,
}: ChatBaseProps) {
  const chatText = useChatWords();
  useEffect(() => {
    setupPrimerPortals();
  }, []);

  // Whether there is anything to talk to. The host usually knows — a browser
  // sandbox has no agent beside it — and says so once for everything beneath
  // it; an explicit prop still wins for one particular chat.
  const ambientAvailability = useChatAvailability();
  const disabled = disabledProp ?? ambientAvailability.disabled;
  const disableReason = disableReasonProp ?? ambientAvailability.disableReason;

  const { theme } = useThemeStore();
  const assistantIconColor = getColorPalette(theme, 'dark').textLight;

  // ── Built-in pending approvals from the agent-runtime Zustand store ──
  // When the parent doesn't supply the `pendingApprovals` prop, derive them
  // from the shared store so the banner works out-of-the-box.
  const storeApprovals = useAgentRuntimeStore(s => s.approvals);
  // Bumped when the transcript changed on the server outside a run.
  const historyVersion = useAgentRuntimeStore(s => s.historyVersion);
  const storeMcpStatus = useAgentRuntimeStore(s => s.mcpStatus);
  const effectiveMcpStatusData = mcpStatusData ?? storeMcpStatus;
  const protocolConfig =
    typeof protocolRaw === 'object'
      ? (protocolRaw as ProtocolConfig)
      : undefined;
  const configuredAiAgentsBaseUrl = useCoreStore(
    (s: { configuration?: { aiAgentsUrl?: string } }) =>
      s.configuration?.aiAgentsUrl,
  );
  const activeAgentId = protocolConfig?.agentId || runtimeId;
  const historyScopeId = runtimeId || activeAgentId;
  const aiAgentsAuthToken = protocolConfig?.authToken;

  // ── Ephemeral notebook (in-memory) ──────────────────────────────────────
  // A stable notebook id scoped to this chat instance. Must match the id used
  // by `useNotebookTools` so the agent's notebook tools drive this notebook.
  const generatedNotebookIdRef = useRef(
    `ephemeral-notebook-${Math.random().toString(36).slice(2, 10)}`,
  );
  // Scope the ephemeral notebook to the STABLE runtime identity first (the pod
  // name / route id that stays constant across navigation), falling back to the
  // agent id. This keeps the persisted notebook model addressable by the same
  // key when navigating away from and back to the same runtime page.
  const notebookScopeId = runtimeId || protocolConfig?.agentId || activeAgentId;
  // When an explicit collaboration document id is supplied (e.g. an Agent Node
  // sharing a room with the SaaS UI), it becomes the notebook id directly so
  // BOTH peers join the same collaborative room AND the agent's notebook tools
  // (scoped by this same id) drive the shared notebook. Otherwise fall back to
  // the derived, per-runtime in-memory id.
  const ephemeralNotebookId =
    ephemeralNotebookCollaborationDocumentId ||
    (notebookScopeId
      ? `ephemeral-notebook-${notebookScopeId}`
      : generatedNotebookIdRef.current);
  const persistedEphemeralNbformat = useAgentRuntimeStore(s =>
    s.getEphemeralNotebookModel(ephemeralNotebookId),
  );
  const setEphemeralNotebookModel = useAgentRuntimeStore(
    s => s.setEphemeralNotebookModel,
  );
  const handleEphemeralNotebookChange = useCallback(
    (model: INotebookContent) => {
      setEphemeralNotebookModel(ephemeralNotebookId, model);
    },
    [ephemeralNotebookId, setEphemeralNotebookModel],
  );

  // ── Ephemeral document (in-memory Lexical) ──────────────────────────────
  // Scoped to the same stable runtime identity as the notebook so the persisted
  // document survives navigation away from and back to the runtime page. When a
  // collaboration room is supplied it becomes the document id directly so BOTH
  // peers join the same Loro room AND the agent's lexical tools (scoped by this
  // same id) drive the shared document.
  const ephemeralDocumentId =
    ephemeralDocumentCollaboration?.roomId ||
    (notebookScopeId
      ? `ephemeral-document-${notebookScopeId}`
      : `ephemeral-document-${generatedNotebookIdRef.current}`);
  const persistedEphemeralDocument = useAgentRuntimeStore(s =>
    s.getEphemeralDocumentModel(ephemeralDocumentId),
  );
  const setEphemeralDocumentModel = useAgentRuntimeStore(
    s => s.setEphemeralDocumentModel,
  );
  const handleEphemeralDocumentChange = useCallback(
    (model: string) => {
      setEphemeralDocumentModel(ephemeralDocumentId, model);
    },
    [ephemeralDocumentId, setEphemeralDocumentModel],
  );

  // ── Companion surface mode (none / notebook / document) ─────────────────
  const defaultSurfaceMode: EphemeralSurfaceMode =
    initialEphemeralSurfaceMode ??
    (enableEphemeralNotebook && initialEphemeralNotebookOpen
      ? 'notebook'
      : 'none');
  const [ephemeralSurfaceMode, setEphemeralSurfaceMode] =
    useState<EphemeralSurfaceMode>(defaultSurfaceMode);
  const handleEphemeralSurfaceModeChange = useCallback(
    (mode: EphemeralSurfaceMode) => {
      setEphemeralSurfaceMode(mode);
      onEphemeralSurfaceModeChange?.(mode);
      // Back-compat: keep the legacy notebook open-state callback in sync.
      onEphemeralNotebookOpenChange?.(mode === 'notebook');
    },
    [onEphemeralSurfaceModeChange, onEphemeralNotebookOpenChange],
  );
  const notebookVisible =
    enableEphemeralNotebook && ephemeralSurfaceMode === 'notebook';
  const documentVisible =
    enableEphemeralDocument && ephemeralSurfaceMode === 'document';
  const surfaceVisible = notebookVisible || documentVisible;
  /*
   * Collapsed means collapsed, whether or not there is a way back.
   *
   * Offering to reopen the conversation is what `onExpandFromCollapsed`
   * decides, and the affordance below is guarded by it. Requiring it HERE
   * meant a surface asked to collapse with nothing to expand into — a Code
   * Sandbox, where nothing is listening — kept the conversation on screen
   * instead.
   */
  const surfaceCollapsed = surfaceVisible && collapsed;

  /*
   * The switch between the notebook and the document, for a collapsed chat.
   *
   * It normally sits in the chat's header, which is exactly what a collapsed
   * chat does not draw — so a page without a conversation opened whichever
   * surface came first and could never leave it. On the surface's own toolbar
   * it is reachable either way. "Chat only" is not among the choices here:
   * closing the surface would leave nothing at all.
   */
  const collapsedSurfaceControl: ToolbarItem | null = surfaceCollapsed
    ? {
        key: 'ephemeral-surface',
        type: 'custom',
        // Last of the toolbar, away from what acts on the surface itself.
        order: 900,
        render: () => (
          <EphemeralSurfaceControl
            mode={ephemeralSurfaceMode}
            onChange={handleEphemeralSurfaceModeChange}
            enableNotebook={enableEphemeralNotebook}
            enableDocument={enableEphemeralDocument}
            enableChatOnly={false}
          />
        ),
      }
    : null;
  const notebookToolbarItems = collapsedSurfaceControl
    ? [...(ephemeralNotebookToolbarExtraItems ?? []), collapsedSurfaceControl]
    : ephemeralNotebookToolbarExtraItems;
  const documentToolbarItems = collapsedSurfaceControl
    ? [...(ephemeralDocumentToolbarExtraItems ?? []), collapsedSurfaceControl]
    : ephemeralDocumentToolbarExtraItems;

  // Track the ephemeral notebook's live kernel connection so the chat header
  // renders the same rich `KernelIndicator` details (kernel id, client id,
  // server/ws url, status) as the notebook editor. Without this the header
  // falls back to the sandbox-status placeholder ("disconnected", "no-kernel").
  const [notebookKernel, setNotebookKernel] =
    useState<IKernelConnection | null>(null);
  useEffect(() => {
    if (!notebookVisible) {
      setNotebookKernel(null);
      return;
    }
    const readKernel = (): IKernelConnection | null => {
      const notebook = notebookStore
        .getState()
        .selectNotebook(ephemeralNotebookId);
      const adapter = notebook?.adapter as
        { kernel?: IKernelConnection | null } | undefined;
      return adapter?.kernel ?? null;
    };
    const sync = () => {
      const next = readKernel();
      setNotebookKernel(prev => (prev?.id === next?.id ? prev : next));
    };
    sync();
    // Poll: the kernel connection appears asynchronously after the notebook
    // mounts and can change on restart. Also react to store mutations.
    const intervalId = window.setInterval(sync, 750);
    const unsubscribe = notebookStore.subscribe(sync);
    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [notebookVisible, ephemeralNotebookId]);
  // Track the ephemeral document's live kernel connection the same way, so the
  // header's kernel indicator reflects the real connected kernel while the
  // document surface is active (instead of the "disconnected" placeholder).
  const [documentKernel, setDocumentKernel] =
    useState<IKernelConnection | null>(null);
  const handleDocumentKernelChange = useCallback(
    (next: IKernelConnection | null) => {
      setDocumentKernel(prev => (prev?.id === next?.id ? prev : next));
    },
    [],
  );
  useEffect(() => {
    if (!documentVisible) {
      setDocumentKernel(null);
    }
  }, [documentVisible]);
  // When a companion surface is shown, the chat can be docked as a sidebar
  // (default) or floated over it, driven by the header view-mode toggle.
  const surfaceChatFloating =
    surfaceVisible && isFloatingChatViewMode(chatViewMode);
  // The two smaller floating modes share the compact card over a surface.
  const compactFloating =
    chatViewMode === 'floating-small' || chatViewMode === 'floating-draggable';

  // Notebook frontend tools are always created (hooks must be unconditional)
  // but only merged into the tools sent to the agent while the notebook is
  // visible, so the agent can manipulate the live notebook cells. Document
  // (lexical) tools are reported upward by the lazily-loaded EphemeralDocument
  // and merged in while the document is visible.
  const notebookTools = useNotebookTools(ephemeralNotebookId);
  const [documentTools, setDocumentTools] = useState<FrontendToolDefinition[]>(
    [],
  );
  const handleDocumentToolsReady = useCallback(
    (tools: FrontendToolDefinition[]) => {
      setDocumentTools(tools);
    },
    [],
  );
  const frontendTools = useMemo(() => {
    if (notebookVisible) {
      return [...(frontendToolsProp || []), ...notebookTools];
    }
    if (documentVisible) {
      return [...(frontendToolsProp || []), ...documentTools];
    }
    return frontendToolsProp;
  }, [
    notebookVisible,
    documentVisible,
    frontendToolsProp,
    notebookTools,
    documentTools,
  ]);

  const aiAgentsBaseUrl = useMemo(
    () =>
      normalizeAiAgentsBaseUrl(
        configuredAiAgentsBaseUrl || DEFAULT_SERVICE_URLS.AI_AGENTS,
      ),
    [configuredAiAgentsBaseUrl],
  );
  const aiAgentsApprovalWsRef = useRef<WebSocket | null>(null);
  const resolvedToolCallSuppressionsRef = useRef<Map<string, number>>(
    new Map(),
  );
  const sendAiAgentsApprovalDecision = useCallback(
    (approvalId: string, approved: boolean, note?: string): boolean => {
      const ws = aiAgentsApprovalWsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logApprovalTrace('send_decision_skipped_ws_not_ready', {
          approvalId,
          approved,
          wsReadyState: ws?.readyState,
        });
        return false;
      }
      try {
        logApprovalTrace('send_decision', {
          approvalId,
          approved,
          hasNote: Boolean(note),
        });
        ws.send(
          JSON.stringify({
            type: 'tool_approval_decision',
            approvalId,
            approved,
            ...(note ? { note } : {}),
          }),
        );
        return true;
      } catch {
        logApprovalTrace('send_decision_failed', {
          approvalId,
          approved,
        });
        return false;
      }
    },
    [],
  );
  const requestAiAgentsApprovalHistory = useCallback((): boolean => {
    const ws = aiAgentsApprovalWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      ws.send(JSON.stringify({ type: 'tool-approvals-history' }));
      logApprovalTrace('request_history', {});
      return true;
    } catch {
      return false;
    }
  }, []);
  const rememberResolvedToolCall = useCallback((toolCallId?: string): void => {
    if (!toolCallId) {
      return;
    }
    resolvedToolCallSuppressionsRef.current.set(
      toolCallId,
      Date.now() + RESOLVED_TOOL_CALL_SUPPRESSION_MS,
    );
    logApprovalTrace('suppress_pending_for_tool_call', {
      toolCallId,
      windowMs: RESOLVED_TOOL_CALL_SUPPRESSION_MS,
    });
  }, []);
  const isSuppressedPending = useCallback((toolCallId?: string): boolean => {
    if (!toolCallId) {
      return false;
    }
    const expiresAt = resolvedToolCallSuppressionsRef.current.get(toolCallId);
    if (!expiresAt) {
      return false;
    }
    if (expiresAt < Date.now()) {
      resolvedToolCallSuppressionsRef.current.delete(toolCallId);
      return false;
    }
    return true;
  }, []);
  const queueApprovalDecisionRetry = useCallback(
    (approvalId: string, approved: boolean, note?: string): void => {
      window.setTimeout(() => {
        const stillPending = agentRuntimeStore
          .getState()
          .approvals.some(
            approval =>
              approval.id === approvalId && approval.status === 'pending',
          );
        if (!stillPending) {
          return;
        }
        const resent = sendAiAgentsApprovalDecision(approvalId, approved, note);
        logApprovalTrace('retry_send_decision', {
          approvalId,
          approved,
          sent: resent,
        });
        if (resent) {
          requestAiAgentsApprovalHistory();
        }
      }, 500);
    },
    [requestAiAgentsApprovalHistory, sendAiAgentsApprovalDecision],
  );
  const storePendingApprovals: PendingApproval[] = useMemo(() => {
    if (pendingApprovalsProp) return pendingApprovalsProp;
    return storeApprovals
      .filter(
        a => a.status === 'pending' && isApprovalForAgent(a, activeAgentId),
      )
      .map(a => ({
        id: a.id,
        toolName: a.tool_name,
        toolDescription: a.note ?? undefined,
        args: a.tool_args ?? {},
        agentId: a.agent_id ?? '',
        requestedAt: a.created_at ?? new Date().toISOString(),
      }));
  }, [pendingApprovalsProp, storeApprovals, activeAgentId]);
  const pendingApprovals = storePendingApprovals;

  // Persist a one-off approval decision into the tools/skills dropdown state
  // on the agent-runtime so the "Approved" toggle moves Off→On across
  // sessions and reloads.  For MCP tool approvals (``<server>__<tool>``) this
  // sends ``mcp_server_tool_approve``.  For skill approvals
  // (``skill:<skill_id>``) this sends ``skill_approve`` /
  // ``skill_unapprove``.
  const persistApprovalDecision = useCallback(
    (approvalId: string, approved: boolean): void => {
      const approval = agentRuntimeStore
        .getState()
        .approvals.find(a => a.id === approvalId);
      const toolName = approval?.tool_name;
      if (!toolName) return;

      // Derive the skill id either from a synthetic ``skill:<id>`` tool_name
      // OR from a skill-tool call (``run_skill_script`` / ``load_skill`` /
      // ``read_skill_resource``) carrying ``skill`` / ``skill_name`` / ``name``
      // in its args.  This belt-and-suspenders approach makes sure the
      // Approved toggle flips even if the server emits a bare approval
      // request without the ``skill:`` prefix.
      const deriveSkillId = (): string | null => {
        if (toolName.startsWith('skill:')) {
          const skillRef = toolName.slice('skill:'.length);
          if (!skillRef) return null;
          return normalizeSkillApprovalId(skillRef);
        }
        const SKILL_TOOLS = new Set([
          'run_skill_script',
          'load_skill',
          'read_skill_resource',
        ]);
        if (!SKILL_TOOLS.has(toolName)) return null;
        const a = (approval?.tool_args ?? {}) as Record<string, unknown>;
        const raw = a.skill_name ?? a.skill ?? a.name;
        if (typeof raw !== 'string' || !raw) return null;
        return normalizeSkillApprovalId(raw);
      };

      const skillId = deriveSkillId();
      if (skillId) {
        setLocalSkillApproval(prev => {
          const next = new Map(prev);
          next.set(skillId, approved);
          return next;
        });
        const ok = agentRuntimeStore.getState().sendRawMessage(
          {
            type: approved ? 'skill_approve' : 'skill_unapprove',
            skillId,
          },
          activeAgentId,
        );
        if (!ok) {
          console.warn(
            '[ChatBase] skill_approve persistence dropped: websocket not ready',
          );
        }
        return;
      }

      // MCP tool approvals: tool_name is ``<serverId>__<toolName>``.
      const sep = toolName.indexOf('__');
      if (sep !== -1) {
        const serverId = toolName.slice(0, sep);
        const toolOnly = toolName.slice(sep + 2);
        const ok = agentRuntimeStore.getState().sendRawMessage(
          {
            type: 'mcp_server_tool_approve',
            serverId,
            toolName: toolOnly,
            approved,
          },
          activeAgentId,
        );
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tool_approve persistence dropped: websocket not ready',
          );
        }
      }
    },
    [activeAgentId],
  );

  // Built-in approve/reject: send decisions to the runtime WS only.
  // Approval state updates are sourced from the ai-agents WS listener.
  const onApproveApproval = useCallback(
    async (approvalId: string, note?: string, toolCallId?: string) => {
      const approval = agentRuntimeStore
        .getState()
        .approvals.find(a => a.id === approvalId);
      const resolvedToolCallId = approval?.tool_call_id ?? toolCallId;
      rememberResolvedToolCall(resolvedToolCallId);
      // Persist approval decision to the ai-agents backend WS (single source
      // of truth). This drives SaaS Tool Approvals state and broadcast events.
      const persistedViaBackend = sendAiAgentsApprovalDecision(
        approvalId,
        true,
        note,
      );
      if (!persistedViaBackend) {
        console.warn(
          '[ChatBase] ai-agents tool_approval_decision not sent: websocket not ready',
        );
      }

      // Keep the runtime decision path so the in-flight tool call can resume.
      const runtimeOk = agentRuntimeStore
        .getState()
        .sendDecision(
          approvalId,
          true,
          note,
          resolvedToolCallId,
          activeAgentId,
        );
      if (runtimeOk) {
        // Persist non-approval decisions locally; tool approvals are reconciled
        // from ai-agents WS events/history to keep a single source of truth.
        persistApprovalDecision(approvalId, true);
      } else {
        console.warn(
          '[ChatBase] tool_approval_decision dropped: websocket not ready',
        );
      }
      if (persistedViaBackend || runtimeOk) {
        // Optimistically clear local pending UI so completed tool calls do not
        // stay pinned when websocket reconciliation is delayed.
        agentRuntimeStore.getState().removeApproval(approvalId);
      }
      requestAiAgentsApprovalHistory();
      queueApprovalDecisionRetry(approvalId, true, note);
      await onApproveApprovalProp?.(approvalId, note);
    },
    [
      activeAgentId,
      rememberResolvedToolCall,
      onApproveApprovalProp,
      persistApprovalDecision,
      queueApprovalDecisionRetry,
      requestAiAgentsApprovalHistory,
      sendAiAgentsApprovalDecision,
    ],
  );
  const onRejectApproval = useCallback(
    async (approvalId: string, note?: string, toolCallId?: string) => {
      const approval = agentRuntimeStore
        .getState()
        .approvals.find(a => a.id === approvalId);
      const resolvedToolCallId = approval?.tool_call_id ?? toolCallId;
      rememberResolvedToolCall(resolvedToolCallId);
      const persistedViaBackend = sendAiAgentsApprovalDecision(
        approvalId,
        false,
        note,
      );
      if (!persistedViaBackend) {
        console.warn(
          '[ChatBase] ai-agents tool_approval_decision not sent: websocket not ready',
        );
      }

      const runtimeOk = agentRuntimeStore
        .getState()
        .sendDecision(
          approvalId,
          false,
          note,
          resolvedToolCallId,
          activeAgentId,
        );
      if (runtimeOk) {
        // Tool approval list is reconciled from ai-agents WS updates/history.
      } else {
        console.warn(
          '[ChatBase] tool_approval_decision dropped: websocket not ready',
        );
      }
      if (persistedViaBackend || runtimeOk) {
        // Optimistically clear local pending UI so completed tool calls do not
        // stay pinned when websocket reconciliation is delayed.
        agentRuntimeStore.getState().removeApproval(approvalId);
      }
      requestAiAgentsApprovalHistory();
      queueApprovalDecisionRetry(approvalId, false, note);
      await onRejectApprovalProp?.(approvalId, note);
    },
    [
      activeAgentId,
      rememberResolvedToolCall,
      onRejectApprovalProp,
      queueApprovalDecisionRetry,
      requestAiAgentsApprovalHistory,
      sendAiAgentsApprovalDecision,
    ],
  );

  // Assigned once `applyServerApprovalDecision` is defined below. A ref lets the
  // ai-agents approval WS effect (declared earlier) drive the deferred-run
  // continuation without re-subscribing when the callback identity changes.
  const applyServerApprovalDecisionRef = useRef<
    | ((
        approval: AgentStreamToolApprovalPayload,
        approved: boolean,
        note?: string,
      ) => boolean)
    | null
  >(null);

  const reconcileResolvedApprovalInStore = useCallback(
    (approval: AgentStreamToolApprovalPayload): void => {
      const state = agentRuntimeStore.getState();
      const removalIds = new Set<string>([approval.id]);
      const hasResolvedToolName = Boolean(approval.tool_name);
      const resolvedSignature = hasResolvedToolName
        ? approvalSignature(approval.tool_name, approval.tool_args ?? {})
        : null;

      for (const existing of state.approvals) {
        if (existing.status !== 'pending') {
          continue;
        }
        if (!isApprovalForAgent(existing, activeAgentId)) {
          continue;
        }
        if (existing.id === approval.id) {
          removalIds.add(existing.id);
          continue;
        }
        if (
          approval.tool_call_id &&
          existing.tool_call_id &&
          existing.tool_call_id === approval.tool_call_id
        ) {
          removalIds.add(existing.id);
          continue;
        }
        if (!resolvedSignature || !existing.tool_name) {
          continue;
        }
        const existingSignature = approvalSignature(
          existing.tool_name,
          existing.tool_args ?? {},
        );
        if (existingSignature === resolvedSignature) {
          removalIds.add(existing.id);
        }
      }

      for (const id of removalIds) {
        state.removeApproval(id);
      }
    },
    [activeAgentId],
  );

  // Optional ai-agents bridge for server-mode visibility.
  // This keeps approval synchronization in ChatBase so examples do not need
  // their own approval websocket plumbing.
  useEffect(() => {
    if (!showToolApprovalBanner || pendingApprovalsProp) {
      return;
    }
    if (!aiAgentsAuthToken) {
      return;
    }

    const wsUrl = toWsUrl(
      aiAgentsBaseUrl,
      `${AI_AGENTS_API_PREFIX}/ws`,
      aiAgentsAuthToken,
    );
    if (!wsUrl) {
      return;
    }

    let closedByCleanup = false;
    const ws = new WebSocket(wsUrl);
    aiAgentsApprovalWsRef.current = ws;

    ws.onopen = () => {
      logApprovalTrace('ws_open_request_history', {
        activeAgentId,
      });
      ws.send(JSON.stringify({ type: 'tool-approvals-history' }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const raw = JSON.parse(String(event.data)) as Record<string, unknown>;
        const records: Record<string, unknown>[] = [];
        const msgType = typeof raw.type === 'string' ? raw.type : undefined;
        const msgEvent = typeof raw.event === 'string' ? raw.event : undefined;

        if (msgType === 'tool-approvals-history') {
          const data =
            raw.data && typeof raw.data === 'object'
              ? (raw.data as Record<string, unknown>)
              : {};
          const approvals = data.approvals;
          if (Array.isArray(approvals)) {
            for (const item of approvals) {
              if (item && typeof item === 'object') {
                records.push(item as Record<string, unknown>);
              }
            }
          }
        } else if (msgEvent?.startsWith('tool_approval_')) {
          const data =
            raw.data && typeof raw.data === 'object'
              ? (raw.data as Record<string, unknown>)
              : raw.payload && typeof raw.payload === 'object'
                ? (raw.payload as Record<string, unknown>)
                : null;
          if (data) {
            const eventStatus = statusFromApprovalEvent(msgEvent);
            logApprovalTrace('recv_tool_approval_event', {
              event: msgEvent,
              approvalId:
                typeof data.id === 'string'
                  ? data.id
                  : typeof data.approval_id === 'string'
                    ? data.approval_id
                    : undefined,
              status:
                typeof data.status === 'string' ? data.status : eventStatus,
            });
            records.push(
              eventStatus && typeof data.status !== 'string'
                ? { ...data, status: eventStatus }
                : data,
            );
          }
        }

        if (records.length === 0) {
          return;
        }

        const state = agentRuntimeStore.getState();
        for (const record of records) {
          let approval = normalizeApprovalPayload(record);
          // SaaS-resolved events (tool_approval_approved/rejected) can arrive
          // with only {approvalId, status} and no tool_name/tool_args. Recover
          // the full envelope from the store (populated by the earlier pending
          // event) so the card clears AND the deferred run can resume.
          if (!approval) {
            const rawId =
              (typeof record.id === 'string' && record.id) ||
              (typeof record.approval_id === 'string' && record.approval_id) ||
              (typeof record.approvalId === 'string' && record.approvalId) ||
              '';
            const rawStatus =
              (typeof record.status === 'string' && record.status) || '';
            if (rawId && rawStatus && rawStatus !== 'pending') {
              const stored = state.approvals.find(a => a.id === rawId);
              if (stored) {
                approval = { ...stored, status: rawStatus };
              }
            }
          }
          if (!approval) {
            continue;
          }
          const scopedApproval: AgentStreamToolApprovalPayload =
            approval.agent_id || !activeAgentId
              ? approval
              : { ...approval, agent_id: activeAgentId };
          if (!isApprovalForAgent(scopedApproval, activeAgentId)) {
            continue;
          }
          if (
            scopedApproval.status === 'pending' &&
            isSuppressedPending(scopedApproval.tool_call_id)
          ) {
            logApprovalTrace('drop_transient_pending', {
              approvalId: scopedApproval.id,
              toolCallId: scopedApproval.tool_call_id,
              status: scopedApproval.status,
            });
            continue;
          }
          logApprovalTrace('apply_tool_approval_update', {
            approvalId: scopedApproval.id,
            status: scopedApproval.status,
            agentId: scopedApproval.agent_id,
            activeAgentId,
          });
          if (scopedApproval.status === 'pending') {
            state.upsertApproval(scopedApproval);
          } else {
            reconcileResolvedApprovalInStore(scopedApproval);
            // Resume the deferred tool call when the decision was made on
            // another surface (e.g. the SaaS Tool Approvals UI). Without this
            // the pending card clears but pydantic-ai never receives the
            // client continuation and the run stays parked.
            applyServerApprovalDecisionRef.current?.(
              scopedApproval,
              scopedApproval.status === 'approved',
              scopedApproval.note ?? undefined,
            );
          }
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    ws.onclose = () => {
      if (!closedByCleanup) {
        aiAgentsApprovalWsRef.current = null;
      }
    };
    ws.onerror = () => {
      aiAgentsApprovalWsRef.current = null;
    };

    return () => {
      closedByCleanup = true;
      aiAgentsApprovalWsRef.current = null;
      ws.close();
    };
  }, [
    showToolApprovalBanner,
    pendingApprovalsProp,
    aiAgentsBaseUrl,
    aiAgentsAuthToken,
    activeAgentId,
    isSuppressedPending,
    reconcileResolvedApprovalInStore,
  ]);

  // The outer ChatBase wrapper always resolves a string Protocol to a full
  // ProtocolConfig (or undefined).  Narrow the type for internal use.
  const protocol: ProtocolConfig | undefined =
    typeof protocolRaw === 'object' ? protocolRaw : undefined;

  // Stabilize the protocol reference so that the adapter-init effect only
  // re-runs when the protocol *contents* actually change.
  const protocolKey = protocol ? JSON.stringify(protocol) : '';
  const monitoringServiceName = 'agent-runtimes';

  // Store (optional for message persistence)
  const clearStoreMessages = useChatStore(state => state.clearMessages);

  // Check if protocol is A2A (doesn't support per-request model override)
  const isA2AProtocol = protocol?.type === 'a2a';

  // ---- Component state ----
  /*
   * The conversation (M-030): `reduceConversation`'s, as on the phone,
   * whatever protocol the agent speaks — its adapter's events normalised by
   * `conversationEventsOf`. Kept in a ref as each change lands, so the events
   * of one network chunk each read the last, and drawn on the next render
   * with what only the web holds beside it (`ChatLayer`).
   */
  const [conversation, setConversation] = useState<ConversationState>(() =>
    emptyConversation(BROWSER_LIMITS),
  );
  const conversationRef = useRef(conversation);
  // Whether anything has changed it yet: a store is not written over by the
  // empty conversation a chat mounts with.
  const conversationTouchedRef = useRef(false);
  const changeConversation = useCallback(
    (change: (state: ConversationState) => ConversationState) => {
      const next = change(conversationRef.current);
      if (next === conversationRef.current) return;
      conversationRef.current = next;
      conversationTouchedRef.current = true;
      setConversation(next);
    },
    [],
  );
  const [layer, setLayer] = useState<ChatLayer>(emptyChatLayer);
  const layerRef = useRef(layer);
  const changeLayer = useCallback((change: (layer: ChatLayer) => ChatLayer) => {
    const next = change(layerRef.current);
    if (next === layerRef.current) return;
    layerRef.current = next;
    setLayer(next);
  }, []);
  /** The conversation and what the web held beside it, gone: a new one. */
  const resetConversation = useCallback(() => {
    changeConversation(() => emptyConversation(BROWSER_LIMITS));
    changeLayer(() => emptyChatLayer());
  }, [changeConversation, changeLayer]);
  /** A conversation read again: its messages, its tool calls and their results. */
  const restoreConversation = useCallback(
    (messages: ChatMessage[]) => {
      let restored: ConversationState;
      try {
        restored = reduceConversation(
          emptyConversation(BROWSER_LIMITS),
          snapshotOfMessages(messages),
        );
      } catch (failure) {
        console.error('[ChatBase] Conversation not read again:', failure);
        setError(
          failure instanceof Error ? failure : new Error(String(failure)),
        );
        return;
      }
      const extras = new Map<string, MessageExtras>();
      for (const message of messages) {
        const {
          id,
          role: _role,
          content: _content,
          toolCalls: _calls,
          ...rest
        } = message;
        extras.set(id, rest);
      }
      changeLayer(() => ({ ...emptyChatLayer(), extras }));
      changeConversation(() => restored);
    },
    [changeConversation, changeLayer],
  );
  /** One more input of the reducer. */
  const reduce = useCallback(
    (event: AgUiEvent) =>
      changeConversation(state => reduceConversation(state, event)),
    [changeConversation],
  );
  /** A tool call as its card draws it now, or `undefined`. */
  const toolCardNow = useCallback((toolCallId: string) => {
    const row = conversationRef.current.items.find(
      item => item.kind === 'tool' && item.id === toolCallId,
    );
    return row && row.kind === 'tool' ? toolCallOf(row) : undefined;
  }, []);
  /** Every tool call as its card draws it now. */
  const toolCardsNow = useCallback(
    () =>
      conversationRef.current.items.flatMap(item =>
        item.kind === 'tool' ? [toolCallOf(item)] : [],
      ),
    [],
  );
  const chatTextRef = useRef(chatText);
  chatTextRef.current = chatText;
  const drawConversation = useMemo(
    () => conversationDrawer(text => chatTextRef.current.error(text)),
    [],
  );
  const displayItems = useMemo(
    () => drawConversation(conversation, layer),
    [drawConversation, conversation, layer],
  );
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;
  /*
   * What the harness itself reported, for an agent with no server behind it.
   *
   * The last turn *and* the running session. Both, because the bar shows both
   * — "· 12k ▲ 900 ▼" is the conversation so far and "· turn 800 ▲ 120 ▼" is
   * what the last exchange cost — and a snapshot carrying only a total leaves
   * those two lines out entirely.
   */
  const [localUsage, setLocalUsage] = useState<{
    turnInput: number;
    turnOutput: number;
    sessionInput: number;
    sessionOutput: number;
    totalTokens: number;
  } | null>(null);
  /* Whether the (i) has been pressed. Its own state rather than a view mode:
     it is a detour from the conversation, not a place the chat lives. */
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveKernelStatus, setLiveKernelStatus] =
    useState<KernelMessage.Status>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!kernel) {
      setLiveKernelStatus(undefined);
      return;
    }

    setLiveKernelStatus(kernel.status);

    const handleStatusChange = (
      _: unknown,
      nextStatus: KernelMessage.Status,
    ) => {
      setLiveKernelStatus(nextStatus);
    };

    kernel.statusChanged.connect(handleStatusChange);

    return () => {
      kernel.statusChanged.disconnect(handleStatusChange);
    };
  }, [kernel]);

  // History-loaded flag — true immediately when there is nothing to fetch
  const [historyLoaded, setHistoryLoaded] = useState(!historyScopeId);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const historyRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  // The steps of an application's code shown so far, as displays (patched
  // as they stream), and the elements it showed (RU-3).
  const uiStepsRef = useRef<UiModel>(emptyUiModel());
  const uiElementsRef = useRef<Set<string>>(new Set());
  // Adapter-ready flag — flipped to true once the protocol adapter is initialised
  const [adapterReady, setAdapterReady] = useState(false);
  // Guard so each distinct pending prompt is sent at most once. Stores the
  // last-sent key (not a boolean) so that changing `pendingPrompt` to a new
  // value — e.g. re-submitting an interactive surface — triggers a fresh send.
  const pendingPromptSentRef = useRef<string | null>(null);
  const pendingPromptKey =
    pendingPrompt &&
    [
      runtimeId || historyEndpoint || protocol?.endpoint || protocol?.agentId,
      pendingPrompt,
    ]
      .filter(Boolean)
      .join('::');
  const [selectedModel, setSelectedModel] = useState<string>('');
  // enabledTools tracks which MCP server tools are enabled
  // Format: Map<serverId, Set<toolName>>
  const [enabledMcpTools, setEnabledMcpTools] = useState<
    Map<string, Set<string>>
  >(new Map());
  // approvedMcpTools tracks which MCP server tools are approved per server.
  // Default: no tools approved until explicitly toggled.
  const [approvedMcpTools, setApprovedMcpTools] = useState<
    Map<string, Set<string>>
  >(new Map());
  // Note: legacy _enabledTools for backend-defined tools from config query
  const [_enabledTools, setEnabledTools] = useState<string[]>([]);
  const wsState = useAgentRuntimeWsState();

  // ---- Data queries ----
  // Config-derived queries (models, skills, context, sandbox) must only run
  // once the runtime endpoint exists. `autoConnect` is our single signal for
  // "endpoint ready", so we gate every config query on it to avoid firing
  // requests at a not-yet-created runtime during the launch overlay.
  const configQueriesEnabled =
    Boolean(protocol?.enableConfigQuery) && autoConnect;
  const configQuery = useConfig(
    configQueriesEnabled,
    protocol?.configEndpoint,
    protocol?.authToken,
    protocol?.agentId,
  );
  const skillsQuery = useSkills(
    configQueriesEnabled && showSkillsMenu,
    protocol?.configEndpoint,
    protocol?.authToken,
  );
  const {
    enableSkill: wsEnableSkill,
    disableSkill: wsDisableSkill,
    approveSkill: wsApproveSkill,
    unapproveSkill: wsUnapproveSkill,
  } = useSkillActions(activeAgentId);

  // Optimistic skill-approval overrides so inline approval updates the
  // Skills selector immediately before the next WS snapshot lands.
  const [localSkillApproval, setLocalSkillApproval] = useState<
    Map<string, boolean>
  >(new Map());

  useEffect(() => {
    setLocalSkillApproval(new Map());
  }, [activeAgentId]);

  // Derive enabledSkills from the WS-pushed skill statuses.
  const enabledSkills = useMemo(() => {
    const set = new Set<string>();
    for (const s of skillsQuery.data?.skills ?? []) {
      if (s.status === 'enabled' || s.status === 'loaded') {
        set.add(s.id);
      }
    }
    return set;
  }, [skillsQuery.data]);

  // Backward-compatibility bootstrap: if a running agent reports skills as
  // available-only, enable them once. This is gated per agent so explicit
  // user disable actions are not overridden later.
  useEffect(() => {
    if (!activeAgentId) {
      return;
    }
    if (defaultSkillsBootstrapRef.current.has(activeAgentId)) {
      return;
    }

    const skills = skillsQuery.data?.skills ?? [];
    if (skills.length === 0) {
      return;
    }

    const hasAnyEnabled = skills.some(
      s => s.status === 'enabled' || s.status === 'loaded',
    );
    if (hasAnyEnabled) {
      defaultSkillsBootstrapRef.current.add(activeAgentId);
      return;
    }

    const availableSkillIds = skills
      .filter(s => s.status === 'available')
      .map(s => s.id)
      .filter(Boolean);

    if (availableSkillIds.length === 0) {
      defaultSkillsBootstrapRef.current.add(activeAgentId);
      return;
    }

    const allSent = availableSkillIds.every(skillId => wsEnableSkill(skillId));
    if (allSent) {
      defaultSkillsBootstrapRef.current.add(activeAgentId);
    }
  }, [activeAgentId, skillsQuery.data, wsEnableSkill]);

  // Derive approvedSkills from the WS-pushed skill statuses (default: not approved).
  const approvedSkills = useMemo(() => {
    const set = new Set<string>();
    for (const s of skillsQuery.data?.skills ?? []) {
      if (s.approved === true) {
        set.add(s.id);
      }
    }
    localSkillApproval.forEach((approved, skillId) => {
      if (approved) {
        set.add(skillId);
      } else {
        set.delete(skillId);
      }
    });
    return set;
  }, [localSkillApproval, skillsQuery.data]);
  /*
   * What the Tools menu lists.
   *
   * The server's builtin tools when there are any, and otherwise the tools
   * this page gave the agent. An in-page agent has no config endpoint to ask
   * — that is the whole point of it — so the menu was empty for the one kind
   * of agent whose tools the browser already knows in full.
   */
  const builtinTools = useMemo<{
    runtime: BuiltinTool[];
    frontend: BuiltinTool[];
  }>(() => {
    /*
     * Both lists, not one or the other.
     *
     * The server's builtin tools and the ones this page handed the agent are
     * both things it can call, and a menu naming only the first was wrong for
     * every agent given frontend tools — which is every notebook agent, whose
     * ability to run a cell lives entirely on this side.
     *
     * Server first, because that is the order they were introduced in and a
     * list that reorders itself as a request lands is one nobody can scan.
     * De-duplicated by name: a tool implemented on both sides is one tool.
     */
    const fromConfig = configQuery.data?.builtinTools ?? [];

    /*
     * Including the tools this chat does *not* run.
     *
     * An in-page agent's tools are handed to the harness rather than to the
     * chat — the SDK owns the loop and calls them directly, and giving them
     * to both would run each one twice — so `frontendTools` is empty for
     * exactly the agent whose tools live entirely in the page. The menu was
     * therefore emptiest where the tools were most real.
     *
     * Executing a tool and listing it are different jobs. The protocol config
     * names what the agent can call, which is the question this menu asks.
     */
    const inProtocol =
      (protocol?.options as { frontendTools?: { name: string }[] } | undefined)
        ?.frontendTools ?? [];

    const seen = new Set(fromConfig.map(tool => tool.name));
    const fromPage = [...(frontendTools ?? []), ...inProtocol]
      .filter(tool => {
        if (seen.has(tool.name)) {
          return false;
        }
        seen.add(tool.name);
        return true;
      })
      .map(tool => ({ id: tool.name, name: tool.name }));
    /*
     * Kept apart: the runtime's tools, and the frontend tools — the ones this
     * page runs. The menu names them under two headings, so a person can tell
     * what the agent does on the server from what it does here.
     */
    return { runtime: fromConfig, frontend: fromPage };
  }, [configQuery.data?.builtinTools, frontendTools, protocol?.options]);

  /*
   * Who is answering, as one row when that is all there is.
   *
   * A host with a team passes its own list. Everything else gets the agent
   * this chat is actually talking to — which the control states rather than
   * switches, and which nothing else on screen said. It used to be omitted
   * entirely, so the chip and the footer menu were both simply absent.
   */
  const footerAgents = useMemo(
    () =>
      agentsProp ??
      (activeAgentId
        ? [
            {
              id: activeAgentId,
              name: title || activeAgentId,
              /*
                What this agent is for, beside its name.
                
                The menu renders a description when there is one and a bare
                name when there is not, and a single-agent list built from the
                id alone therefore opened onto one word. `subtitle` is what a
                host writes to say what its chat does, which is the same
                sentence a person clicking the agent control is asking for.
              */
              description: subtitle || description,
            },
          ]
        : []),
    [agentsProp, activeAgentId, title, subtitle, description],
  );

  /*
   * The models on offer.
   *
   * An in-page agent has no config endpoint, and asking one for a catalogue is
   * asking a page about itself. It does know the model it was built with — the
   * protocol carries it — so the control names that rather than disappearing.
   */
  const browserModel =
    typeof (protocol?.options as { model?: unknown } | undefined)?.model ===
    'string'
      ? ((protocol?.options as { model?: string }).model as string)
      : undefined;
  const offeredModels = useMemo<ModelConfig[]>(() => {
    // Only what can actually be called — see `modelChoice` for the rule.
    // The runtime's answer, when it gave one, is the whole list.
    // A runtime that was asked and did not answer offers nothing: the
    // agentspecs catalogue below is not its answer.
    const fromConfig =
      availableModels ||
      configQuery.data?.models ||
      (configQuery.isError ? [] : undefined);
    return offeredModelsFor(fromConfig, () => {
      /*
       * The catalogue, filtered to what is worth offering.
       *
       * A server tells the chat which models it can reach and that answer wins.
       * Without one — an in-page agent, or a server that has not answered yet —
       * this used to offer the single model the protocol was built with, which
       * is a menu with nothing to choose.
       *
       * `available` is the filter, not the whole catalogue: twenty-six models,
       * most of them superseded, is a list nobody reads. The specs say which
       * four are current.
       */
      const catalogued = Object.values(AI_MODEL_CATALOGUE)
        // A typed-decision model answers typed questions, not a chat.
        .filter(model => model.available && isChatModel(model))
        .map(model => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
        }));
      if (catalogued.length > 0) {
        return catalogued;
      }
      return browserModel
        ? [{ id: browserModel, name: browserModel, provider: 'inference' }]
        : [];
    });
  }, [
    availableModels,
    configQuery.data?.models,
    configQuery.isError,
    browserModel,
  ]);

  /*
   * Who `@` may address.
   *
   * The same people the footer offers, unless a host supplies its own list.
   * It used to be the host's or nothing, so a chat that had not been told
   * about mentions had no menu at all — and the menu is also how a person
   * *discovers* that agents can be addressed.
   *
   * The one being addressed is listed and disabled rather than dropped: a
   * menu of one that hides its only row is a menu that looks broken, and
   * "you are already talking to this one" is a useful thing to be told.
   */
  const mentionableAgents = useMemo(
    () =>
      mentionableAgentsProp ??
      footerAgents.map(agent => ({
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        disabled: agent.id === (selectedAgentId ?? footerAgents[0]?.id),
        disabledReason: `You are already talking to ${agent.name}`,
      })),
    [mentionableAgentsProp, footerAgents, selectedAgentId],
  );

  const contextSnapshotQuery = useContextSnapshot(
    configQueriesEnabled && showTokenUsage,
    protocol?.configEndpoint,
    protocol?.agentId,
    protocol?.authToken,
  );
  /*
   * The window, from whoever can account for it.
   *
   * A host's own snapshot first, then the server's, then what the harness
   * reported as it finished. The last is a partial picture — it knows the
   * turn's tokens and the model's window, not how they divide between the
   * system prompt, the tools and the history — so the fields it cannot
   * honestly fill are left at zero rather than guessed at.
   */
  const localSnapshot = useMemo<ContextSnapshotData | undefined>(() => {
    /*
     * Only for a harness that has no server keeping the account.
     *
     * `enableConfigQuery` is what says a runtime is reporting its own context
     * over the socket; where one is, this must not shadow it with a partial
     * picture assembled from turn totals.
     */
    if (protocol?.enableConfigQuery) {
      return undefined;
    }
    /* A conservative window. The harness reports what a turn cost, not what
       the model can hold, and 200k is the smaller of the sizes the models
       this reaches actually offer — so the bar reads as fuller than the truth
       rather than emptier, which is the safer way to be wrong about a
       limit. */
    const contextWindow = 200_000;
    return {
      totalTokens: localUsage?.totalTokens ?? 0,
      contextWindow,
      sumResponseInputTokens: localUsage?.sessionInput ?? 0,
      sumResponseOutputTokens: localUsage?.sessionOutput ?? 0,
      systemPromptTokens: 0,
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      toolTokens: 0,
      toolCallTokens: 0,
      toolReturnTokens: 0,
      historyToolCallTokens: 0,
      historyToolReturnTokens: 0,
      currentToolCallTokens: 0,
      currentToolReturnTokens: 0,
      turnUsage: {
        inputTokens: localUsage?.turnInput ?? 0,
        outputTokens: localUsage?.turnOutput ?? 0,
        // Not counted by the harness, and left at zero rather than invented:
        // the bar reads these only for the numbers it prints beside the ring.
        requests: 0,
        toolCalls: 0,
        toolNames: [],
        durationSeconds: 0,
      },
      sessionUsage: {
        inputTokens: localUsage?.sessionInput ?? 0,
        outputTokens: localUsage?.sessionOutput ?? 0,
        requests: 0,
        toolCalls: 0,
        turns: 0,
        durationSeconds: 0,
      },
    } as ContextSnapshotData;
  }, [localUsage, protocol?.enableConfigQuery]);

  /*
   * Nothing carried over from the agent before this one.
   *
   * The runtime store keeps one snapshot, not one per agent, so after a
   * switch it still holds whatever the previous agent last reported — and the
   * bar went on showing that conversation's numbers under a new agent's name
   * until the new one answered. `localUsage` had the same problem from the
   * other direction: it accumulates a session, and a session belongs to an
   * agent.
   *
   * So the local tally is cleared on a switch, and the store's snapshot is
   * ignored until it is replaced by a different object — which is the only
   * signal available that it is the new agent's and not the old one's.
   */
  const seenAgent = useRef(activeAgentId);
  const snapshotAtSwitch = useRef<ContextSnapshotData | null>(null);
  const storeSnapshot = contextSnapshotQuery.data;
  const storeSnapshotRef = useRef(storeSnapshot);
  storeSnapshotRef.current = storeSnapshot;

  useEffect(() => {
    if (seenAgent.current === activeAgentId) {
      return;
    }
    seenAgent.current = activeAgentId;
    setLocalUsage(null);
    snapshotAtSwitch.current = storeSnapshotRef.current ?? null;
  }, [activeAgentId]);

  const freshStoreSnapshot =
    storeSnapshot && storeSnapshot !== snapshotAtSwitch.current
      ? storeSnapshot
      : undefined;

  const agentUsage =
    externalContextSnapshot ?? freshStoreSnapshot ?? localSnapshot;

  /*
   * Handed on to a host that draws its own prompt.
   *
   * The loop workspace is one: it renders the composer itself, so the usage
   * bar beside it can only show what this component passes out. Without this
   * an in-page agent — whose only account of the window is the totals the
   * harness reports here — left that bar permanently empty.
   */
  useEffect(() => {
    onContextSnapshot?.(agentUsage);
  }, [agentUsage, onContextSnapshot]);
  // Never on a runtime held to the application's own routes: it answers no
  // sandbox socket (OwnRoutesOnly).
  const sandboxStatusQuery = useSandbox(
    configQueriesEnabled && showHeader && !protocol?.ownRoutesOnly,
    protocol?.configEndpoint,
    protocol?.authToken,
    protocol?.agentId,
  );

  // ---- Refs ----
  const adapterRef = useRef<BaseProtocolAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pendingToolExecutionsRef = useRef(0);
  const respondedApprovalIdsRef = useRef<Set<string>>(new Set());
  const defaultSkillsBootstrapRef = useRef<Set<string>>(new Set());
  const defaultMcpToolsBootstrapRef = useRef<Set<string>>(new Set());
  const suppressAssistantTextForToolOnlyRef = useRef(false);
  const hideMessagesAfterToolUIRef = useRef(hideMessagesAfterToolUI);
  hideMessagesAfterToolUIRef.current = hideMessagesAfterToolUI;
  const threadIdRef = useRef<string>(thread?.id || generateMessageId());
  /*
   * The thread a host gave, kept as it was given at mount (D-13), and
   * told when a message is first sent on a thread: the host keeps it.
   */
  const threadGivenRef = useRef(thread);
  const threadStartedRef = useRef<string | null>(
    thread?.messages.length ? thread.id : null,
  );
  const noteThreadStarted = useCallback(() => {
    const id = threadIdRef.current;
    if (threadStartedRef.current !== id) {
      threadStartedRef.current = id;
      threadGivenRef.current?.onStarted?.(id);
    }
  }, []);

  /*
   * The conversation's ui channel (RU-W): one WebSocket per
   * conversation, its thread the scope, opened once its session is there
   * (the first event of its first run, or a thread reopened). What its
   * messages show, its steps, its elements, its authors and its window
   * messages arrive here as `reactor.ui` ops; the presses of what they
   * offered go up it. An op about a message the run stream has not brought
   * yet — they are two connections — waits for it (`placeable`).
   */
  const uiSocketRef = useRef<{ socket: UiSocket; scope: string } | null>(null);
  const parkedUiOpsRef = useRef<UiOp[]>([]);
  const historyStepsRef = useRef<Set<string>>(new Set());
  const uiSocketUrl = protocol?.uiSocket;
  const uiSocketTokenRef = useRef(protocol?.authToken);
  uiSocketTokenRef.current = protocol?.authToken;
  /*
   * Its files (RU-6): uploaded to its runtime before the run or
   * the press that names them, the conversation's thread their scope; the
   * run carries the ref, never the bytes.
   */
  const uiFilesUrl = protocol?.uiFiles;
  const uploadToConversation = useCallback<UploadToConversation>(
    file => {
      if (!uiFilesUrl) {
        return Promise.reject(new Error('This conversation takes no file.'));
      }
      return uploadFile(file, {
        url: uiFilesUrl,
        scope: threadIdRef.current,
        token: uiSocketTokenRef.current,
      });
    },
    [uiFilesUrl],
  );

  /** The messages as a ui op reads them: their ids, what they show, who said them. */
  const messageStubs = useCallback(() => {
    const kept = layerRef.current;
    return conversationRef.current.items.flatMap(item =>
      item.kind === 'message' || item.kind === 'error'
        ? [
            {
              id: item.id,
              displays: kept.displays.get(item.id),
              speaker: kept.speakers.get(item.id),
            },
          ]
        : [],
    );
  }, []);

  /*
   * A ui op on the messages: what they show and who said them are the web's
   * (`ChatLayer`); a message taken back leaves the conversation.
   */
  const applyToMessages = useCallback(
    (op: UiOp) => {
      const stubs = messageStubs();
      let next: typeof stubs;
      try {
        next = withUiOp(stubs, op);
      } catch (error) {
        console.error('[ChatBase] reactor.ui op not applied:', error);
        return;
      }
      const left = new Set(next.map(stub => stub.id));
      const removed = stubs
        .filter(stub => !left.has(stub.id))
        .map(stub => stub.id);
      changeLayer(kept => {
        const displays = new Map(kept.displays);
        const speakers = new Map(kept.speakers);
        for (const stub of next) {
          if (stub.displays) displays.set(stub.id, stub.displays);
          if (stub.speaker) speakers.set(stub.id, stub.speaker);
        }
        for (const id of removed) {
          displays.delete(id);
          speakers.delete(id);
        }
        return { ...kept, displays, speakers };
      });
      if (removed.length > 0) {
        changeConversation(state => withoutItems(state, removed));
      }
    },
    [messageStubs, changeLayer, changeConversation],
  );

  const applySocketOp = useCallback(
    (op: UiOp, history: boolean) => {
      // The past is drawn again, never acted on: a window message is not
      // raised again, and the steps of turns long over are not drawn again.
      if (history) {
        if (op.op === 'window') return;
        if ((op.op === 'show' || op.op === 'ask') && isStepDisplay(op.body)) {
          historyStepsRef.current.add(op.body.id);
          return;
        }
        if (
          (op.op === 'patch' || op.op === 'append') &&
          historyStepsRef.current.has(op.id)
        ) {
          return;
        }
      }
      let next: ReturnType<typeof routeUiOp>;
      try {
        next = routeUiOp(op, uiStepsRef.current, uiElementsRef.current);
      } catch (error) {
        console.error('[ChatBase] reactor.ui op not applied:', error);
        return;
      }
      uiStepsRef.current = next.steps;
      const routed = next.routed;
      if (routed.to === 'window') {
        // For the page it sits in, outside the conversation (P-25).
        tellLoopWindow(routed.data);
      } else if (routed.to === 'step') {
        // A step of its code, drawn as it runs (P-16).
        const step = routed.step;
        changeLayer(kept => {
          const anchors = new Map(
            kept.steps.map(row => [row.item.id, row.after] as const),
          );
          const last = conversationRef.current.items.at(-1)?.id ?? null;
          const items = withLoopStep(
            kept.steps.map(row => row.item),
            step,
          ) as ToolCallMessage[];
          return {
            ...kept,
            steps: items.map(item => ({
              item,
              after: anchors.has(item.id)
                ? (anchors.get(item.id) ?? null)
                : last,
            })),
          };
        });
      } else if (routed.to === 'element') {
        // In a side panel or on a page of its own (P-18).
        uiElementsRef.current.add(routed.change.id);
        applyLoopElement(routed.change);
      } else if (!placeable(messageStubs(), routed.op)) {
        const under =
          routed.op.op === 'show' || routed.op.op === 'ask'
            ? routed.op.body.data?.message_id
            : undefined;
        if (history && typeof under === 'string') {
          // Shown in the past under a message that said nothing: the
          // thread did not draw it, the chat draws it for what it showed.
          reduce({
            type: 'MESSAGE_SAID',
            messageId: under,
            role: 'assistant',
            text: '',
            streaming: false,
          });
          applyToMessages(routed.op);
        } else {
          parkedUiOpsRef.current.push(routed.op);
        }
      } else {
        applyToMessages(routed.op);
      }
    },
    [applyToMessages, messageStubs, changeLayer, reduce],
  );
  const applySocketOpRef = useRef(applySocketOp);
  applySocketOpRef.current = applySocketOp;

  // What waited for its message, applied once the message is here.
  useEffect(() => {
    if (parkedUiOpsRef.current.length === 0) return;
    const parked = parkedUiOpsRef.current.splice(0);
    for (const op of parked) {
      if (!placeable(messageStubs(), op)) {
        parkedUiOpsRef.current.push(op);
        continue;
      }
      applyToMessages(op);
    }
  }, [conversation, applyToMessages, messageStubs]);

  /** The conversation's ui socket, opened for its thread when it is not yet. */
  const ensureUiSocket = useCallback((): UiSocket | null => {
    if (!uiSocketUrl) return null;
    const scope = threadIdRef.current;
    const open = uiSocketRef.current;
    if (open && open.scope === scope) return open.socket;
    // Another conversation: what the last one showed goes with it.
    open?.socket.close();
    uiStepsRef.current = emptyUiModel();
    uiElementsRef.current = new Set();
    parkedUiOpsRef.current = [];
    historyStepsRef.current = new Set();
    const socket = new UiSocket({
      url: uiSocketUrl,
      scope,
      token: () => uiSocketTokenRef.current ?? '',
      onOp: (op, _seq, history) => applySocketOpRef.current(op, history),
      onStatus: (status, reason) => {
        if (status === 'refused' || status === 'gone') {
          console.error(`[ChatBase] ui socket ${status}: ${reason ?? ''}`);
        }
      },
    });
    uiSocketRef.current = { socket, scope };
    socket.connect();
    return socket;
  }, [uiSocketUrl]);
  const ensureUiSocketRef = useRef(ensureUiSocket);
  ensureUiSocketRef.current = ensureUiSocket;

  // A thread reopened has its session already: its socket opens now.
  useEffect(() => {
    if (thread?.messages.length) ensureUiSocketRef.current();
    return () => {
      uiSocketRef.current?.socket.close();
      uiSocketRef.current = null;
    };
    // At mount: the thread it was given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Set to true by handleStop so in-flight / about-to-run tool executions
   *  can bail out early.  Reset to false at the start of each handleSend. */
  const stoppedRef = useRef(false);
  const connectedIdentitiesRef = useRef(connectedIdentities);
  connectedIdentitiesRef.current = connectedIdentities;
  // Keep a ref to frontendTools so the event listener closure (which is NOT
  // re-created when frontendTools changes) always accesses the latest value.
  const frontendToolsRef = useRef(frontendTools);
  frontendToolsRef.current = frontendTools;
  // Stable refs for tool invocation hooks (pre/post)
  const onToolCallStartRef = useRef(onToolCallStart);
  onToolCallStartRef.current = onToolCallStart;
  const onToolCallCompleteRef = useRef(onToolCallComplete);
  onToolCallCompleteRef.current = onToolCallComplete;
  // The Agent Inspector: the turns and tool calls, as spans, as they happen.
  const inspectorFromContext = useAgentInspectorTracer();
  const inspectorTracer = inspectorGiven ?? inspectorFromContext;
  const inspectorActorRef = useRef('Agent');
  inspectorActorRef.current =
    (typeof title === 'string' && title) || activeAgentId || 'Agent';
  const recorderRef = useRef<{
    tracer: unknown;
    recorder: ChatSpanRecorder;
  } | null>(null);
  if (inspectorTracer && recorderRef.current?.tracer !== inspectorTracer) {
    recorderRef.current = {
      tracer: inspectorTracer,
      recorder: chatSpanRecorder(
        inspectorTracer,
        () => inspectorActorRef.current,
        {
          frontendTools: () =>
            (frontendToolsRef.current ?? []).map(tool => tool.name),
        },
      ),
    };
  } else if (!inspectorTracer) {
    recorderRef.current = null;
  }
  const inspectAnswerRef = useRef('');
  // A line the agent says aloud, from a run's `voice.say` (VO-35).
  const voiceSayRef = useRef<((activity: VoiceActivity) => void) | undefined>(
    undefined,
  );
  const handleRespondRef = useRef<
    ((toolCallId: string, result: unknown) => Promise<void>) | null
  >(null);

  // A decision made outside the chat — a host page's own approval banner —
  // is answered exactly as the tool card's buttons answer it: through the
  // run's continuation, addressed to the tool call the approval belongs to.
  useEffect(() => {
    let lastSeq = agentRuntimeStore.getState().toolDecisionRequest?.seq ?? 0;
    return agentRuntimeStore.subscribe(
      state => state.toolDecisionRequest,
      request => {
        if (!request || request.seq === lastSeq) return;
        lastSeq = request.seq;
        const respond = handleRespondRef.current;
        if (!respond) return;
        const normalize = (name?: string) =>
          (name ?? '').toLowerCase().replace(/[-_]/g, '');
        const calls = toolCardsNow();
        // By the approval id the tool result carries, else by the tool
        // name of a call still waiting — the same two matches the card makes.
        const call =
          calls.find(
            entry =>
              (entry.result as { approvalId?: string } | undefined)
                ?.approvalId === request.approvalId,
          ) ??
          calls.find(
            entry =>
              normalize(entry.toolName) === normalize(request.toolName) &&
              (entry.status === 'executing' || entry.status === 'inProgress'),
          );
        if (!call) return;
        void respond(call.toolCallId, {
          type: 'tool-approval-decision',
          approved: request.approved,
          approvalId: request.approvalId,
          toolName: call.toolName,
        });
      },
    );
  }, []);

  const applyServerApprovalDecision = useCallback(
    (
      approval: AgentStreamToolApprovalPayload,
      approved: boolean,
      note?: string,
    ): boolean => {
      if (!approval?.id) {
        return false;
      }
      if (respondedApprovalIdsRef.current.has(approval.id)) {
        return false;
      }

      let targetToolCallId = approval.tool_call_id;
      if (!targetToolCallId) {
        for (const tc of toolCardsNow()) {
          if (tc.status !== 'inProgress' && tc.status !== 'executing') {
            continue;
          }
          const tcSig = approvalSignature(tc.toolName, tc.args ?? {});
          const approvalSig = approvalSignature(
            approval.tool_name,
            approval.tool_args ?? {},
          );
          if (tcSig === approvalSig) {
            targetToolCallId = tc.toolCallId;
            break;
          }
        }
      }

      if (!targetToolCallId) {
        return false;
      }

      const target = toolCardNow(targetToolCallId);
      if (!target) {
        return false;
      }
      if (target.status !== 'inProgress' && target.status !== 'executing') {
        return false;
      }

      respondedApprovalIdsRef.current.add(approval.id);
      void handleRespondRef.current?.(targetToolCallId, {
        type: 'tool-approval-decision',
        approved,
        approvalId: approval.id,
        toolName: approval.tool_name || target.toolName,
        _fromServerEcho: true,
        _alreadyDispatched: true,
        ...(note ? { message: note } : {}),
      });
      return true;
    },
    [activeAgentId],
  );
  applyServerApprovalDecisionRef.current = applyServerApprovalDecision;

  // ---- Agent-runtime WebSocket (monitoring stream) ----
  // Derive the bare base URL from configEndpoint or protocol.endpoint.
  const isAgentNodeTunnelAgUi = Boolean(
    protocol?.endpoint &&
    /\/api\/runtimes\/v1\/agent-nodes\/[^/]+\/ag-ui\/?$/.test(
      protocol.endpoint,
    ),
  );
  const wsBaseUrl = protocol?.configEndpoint
    ? protocol.configEndpoint.replace(/\/api\/v1\/(config|configure)\/?$/, '')
    : (protocol?.endpoint?.replace(/\/api\/v1\/.*$/, '') ?? '');
  /*
   * Not on a runtime held to the application's own routes (OwnRoutesOnly): it
   * answers no monitoring stream, and an application's session asks its
   * approvals in the conversation, over its ui socket.
   */
  useAgentRuntimeWebSocket({
    enabled:
      !!protocol &&
      !!wsBaseUrl &&
      !isAgentNodeTunnelAgUi &&
      !protocol.ownRoutesOnly,
    baseUrl: wsBaseUrl,
    authToken: protocol?.authToken,
    agentId: protocol?.agentId,
    onMessage: msg => {
      if (
        msg.type !== 'tool_approval_created' &&
        msg.type !== 'tool_approval_approved' &&
        msg.type !== 'tool_approval_rejected'
      ) {
        return;
      }
      const payload = msg.payload as AgentStreamToolApprovalPayload | undefined;
      if (!payload) {
        return;
      }

      // Keep the top approval banner populated in local/no-token flows by
      // ingesting pending approval events from the runtime stream.
      if (msg.type === 'tool_approval_created') {
        if (isApprovalForAgent(payload, activeAgentId)) {
          agentRuntimeStore.getState().upsertApproval(payload);
        }
        return;
      }

      reconcileResolvedApprovalInStore(payload);

      applyServerApprovalDecision(
        payload,
        msg.type === 'tool_approval_approved',
        payload.note ?? undefined,
      );
    },
  });

  // ---- Helpers ----
  const isServerSelected = useCallback(
    (server: { id: string; isConfig?: boolean }) => {
      if (!mcpServers) return true;
      const origin = server.isConfig === false ? 'catalog' : 'config';
      return mcpServers.some(s => s.id === server.id && s.origin === origin);
    },
    [mcpServers],
  );

  // ---- Focus management ----
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (focusTrigger !== undefined && focusTrigger > 0 && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timeoutId);
    }
  }, [focusTrigger]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timeoutId);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // ---- Auto-resize textarea ----
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 120;
      const minHeight = 40;
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        maxHeight,
      );
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  useEffect(() => {
    const timer = setTimeout(adjustTextareaHeight, 0);
    return () => clearTimeout(timer);
  }, [adjustTextareaHeight]);

  // ---- The model, whenever what is offered changes ----
  useEffect(() => {
    /*
     * `offeredModels`, not the two sources it is built from.
     *
     * It also carries the model an in-page agent was built with, for the case
     * where there is no config endpoint to ask — and this gate read the raw
     * sources, so that model was offered by the menu and never selected. The
     * menu draws nothing without a selection, so a browser agent had a model
     * list of one and no model control at all.
     *
     * Re-picked, not picked once. Before the server has answered, the offer
     * is the browser's catalogue, and the chat chose from it — the first row,
     * Alibaba, which the catalogue marks available because the platform is
     * entitled to it. The server then answered with the one model this
     * process can call, the guess was not in it, and nothing looked again:
     * the trigger read "none selected" while every turn was still sent to
     * Alibaba and came back asking for its key. A selection stands only while
     * it is offered and usable; otherwise the preferred model — the agent's
     * own, from the server — or the first usable one takes its place.
     */
    if (offeredModels.length === 0 || isOffered(offeredModels, selectedModel)) {
      return;
    }
    // The host's word first, then the server's default, then the platform's:
    // the first row of a catalogue is an order of listing, not a choice, and
    // opening on it sent the first message to Alibaba while the footer —
    // drawn from the host's own model — said Claude.
    const opening = initialModelId(
      offeredModels,
      initialModel || configQuery.data?.defaultModel || DEFAULT_MODEL,
    );
    if (opening && opening !== selectedModel) {
      setSelectedModel(opening);
    }
  }, [
    offeredModels,
    selectedModel,
    initialModel,
    configQuery.data?.defaultModel,
  ]);

  // ---- Initialize tools when config is available ----
  const toolsInitializedRef = useRef(false);
  useEffect(() => {
    // Once: a later change to the offer must not undo what the reader toggled.
    if (offeredModels.length > 0 && !toolsInitializedRef.current) {
      toolsInitializedRef.current = true;

      const allToolIds =
        configQuery.data?.builtinTools?.map(tool => tool.id) || [];
      setEnabledTools(allToolIds);

      if (configQuery.data?.mcpServers) {
        const newEnabledMcpTools = new Map<string, Set<string>>();
        for (const server of configQuery.data.mcpServers) {
          if (server.isAvailable && server.enabled) {
            const shouldEnableServer = isServerSelected(server);
            if (shouldEnableServer) {
              // Default to "all tools enabled" so the dropdown reflects an
              // immediately-usable state. The WS sync effect will reconcile
              // with server-side state once it arrives, and user toggles
              // win after that.
              const enabledToolNames = new Set<string>(
                server.tools
                  .map(t => t.name)
                  .filter((name): name is string => Boolean(name)),
              );
              newEnabledMcpTools.set(server.id, enabledToolNames);
            }
          }
        }
        setEnabledMcpTools(newEnabledMcpTools);
      }
    }
  }, [
    configQuery.data,
    offeredModels,
    selectedModel,
    initialModel,
    availableModels,
    mcpServers,
    isServerSelected,
  ]);

  // Update enabled MCP servers when mcpServers prop changes
  useEffect(() => {
    if (!configQuery.data?.mcpServers || !mcpServers) return;
    setEnabledMcpTools(prev => {
      const newMap = new Map<string, Set<string>>();
      for (const server of configQuery.data?.mcpServers ?? []) {
        if (isServerSelected(server) && prev.has(server.id)) {
          const existing = prev.get(server.id);
          if (existing) newMap.set(server.id, existing);
        } else if (
          isServerSelected(server) &&
          server.isAvailable &&
          server.enabled
        ) {
          const enabledToolNames = new Set<string>(
            server.tools
              .map(t => t.name)
              .filter((name): name is string => Boolean(name)),
          );
          newMap.set(server.id, enabledToolNames);
        }
      }
      return newMap;
    });
  }, [mcpServers, configQuery.data?.mcpServers, isServerSelected]);

  // Keep MCP tool selection synchronized with backend WS snapshots.
  // On first load per agent, if server state reports no enabled tools,
  // bootstrap to "all enabled" from config so codemode starts usable by
  // default. Later user toggles still win because bootstrap runs once.
  const mcpServersRef = useRef(mcpServers);
  mcpServersRef.current = mcpServers;
  useEffect(() => {
    const wsEnabledMcpTools = parseEnabledMcpToolsByServer(
      effectiveMcpStatusData,
    );
    if (!wsEnabledMcpTools) {
      return;
    }

    const bootstrapAgentKey = activeAgentId || '__global__';
    const shouldBootstrap =
      !defaultMcpToolsBootstrapRef.current.has(bootstrapAgentKey) &&
      wsState === 'connected';

    setEnabledMcpTools(prev => {
      const next = new Map<string, Set<string>>(prev);

      // Apply WS state per server, but only when it carries an authoritative,
      // non-empty list. An empty list from WS is treated as "no information"
      // (likely a transient snapshot before backend defaults are projected)
      // so we keep whatever the user / bootstrap already set, preventing
      // the dropdown from flickering between enabled and disabled states.
      wsEnabledMcpTools.forEach((toolNames, serverId) => {
        const selectedInProps =
          !mcpServersRef.current ||
          mcpServersRef.current.some(server => server.id === serverId);
        if (!selectedInProps) {
          return;
        }
        if (toolNames.size === 0) {
          return;
        }
        next.set(serverId, new Set(toolNames));
      });

      if (shouldBootstrap) {
        const bootstrapMessages: Array<{
          serverId: string;
          enabledToolNames: string[];
        }> = [];

        for (const server of configQuery.data?.mcpServers ?? []) {
          const selectedInProps =
            !mcpServersRef.current ||
            mcpServersRef.current.some(s => s.id === server.id);
          if (!selectedInProps || !server.isAvailable || !server.enabled) {
            continue;
          }

          const allToolNames = server.tools
            .map(t => t.name)
            .filter((name): name is string => Boolean(name));

          if (allToolNames.length === 0) {
            continue;
          }

          const current = next.get(server.id);
          if (!current || current.size === 0) {
            next.set(server.id, new Set(allToolNames));
            bootstrapMessages.push({
              serverId: server.id,
              enabledToolNames: allToolNames,
            });
          }
        }

        let allMessagesSent = true;
        for (const msg of bootstrapMessages) {
          const ok = agentRuntimeStore.getState().sendRawMessage(
            {
              type: 'mcp_server_tools_set',
              serverId: msg.serverId,
              enabledToolNames: msg.enabledToolNames,
            },
            activeAgentId,
          );
          if (!ok) {
            allMessagesSent = false;
            console.warn(
              '[ChatBase] initial mcp_server_tools_set dropped: websocket not ready',
            );
          }
        }

        if (allMessagesSent) {
          defaultMcpToolsBootstrapRef.current.add(bootstrapAgentKey);
        }
      }

      return next;
    });
  }, [
    effectiveMcpStatusData,
    activeAgentId,
    configQuery.data?.mcpServers,
    wsState,
  ]);

  // Keep MCP tool *approval* synchronized with backend WS snapshots.
  useEffect(() => {
    const wsApprovedMcpTools = parseApprovedMcpToolsByServer(
      effectiveMcpStatusData,
    );
    if (!wsApprovedMcpTools) {
      return;
    }
    setApprovedMcpTools(() => {
      const next = new Map<string, Set<string>>();
      wsApprovedMcpTools.forEach((toolNames, serverId) => {
        const selectedInProps =
          !mcpServersRef.current ||
          mcpServersRef.current.some(server => server.id === serverId);
        if (selectedInProps) {
          next.set(serverId, new Set(toolNames));
        }
      });
      return next;
    });
  }, [effectiveMcpStatusData]);

  // Refetch configQuery when WS reports MCP servers as started but the
  // cached config response has missing servers or empty tools.
  const lastConfigMcpKeyRef = useRef('');
  useEffect(() => {
    const wsServers = effectiveMcpStatusData?.servers;
    if (!wsServers || wsServers.length === 0) return;
    const startedIds = wsServers
      .filter(s => s.status === 'started')
      .map(s => s.id)
      .sort();
    if (startedIds.length === 0) return;

    const configServers = configQuery.data?.mcpServers || [];
    const needsRefetch = startedIds.some(id => {
      const cs = configServers.find(s => s.id === id);
      return !cs || cs.tools.length === 0;
    });

    // Only refetch once per unique set of started server IDs
    const key = startedIds.join(',');
    if (
      needsRefetch &&
      key !== lastConfigMcpKeyRef.current &&
      configQuery.refetch
    ) {
      lastConfigMcpKeyRef.current = key;
      configQuery.refetch();
    }
  }, [effectiveMcpStatusData, configQuery]);

  // initialSkills are now handled server-side during agent creation.

  // ---- Toggle helpers ----
  const toggleMcpTool = useCallback(
    (serverId: string, toolName: string) => {
      setEnabledMcpTools(prev => {
        const newMap = new Map(prev);
        const serverTools = new Set(prev.get(serverId) || []);
        if (serverTools.has(toolName)) {
          serverTools.delete(toolName);
        } else {
          serverTools.add(toolName);
        }
        newMap.set(serverId, serverTools);

        const ok = agentRuntimeStore.getState().sendRawMessage(
          {
            type: 'mcp_server_tools_set',
            serverId,
            enabledToolNames: Array.from(serverTools),
          },
          activeAgentId,
        );
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tools_set dropped: websocket not ready',
          );
        }

        return newMap;
      });
    },
    [activeAgentId],
  );

  const toggleAllMcpServerTools = useCallback(
    (serverId: string, allToolNames: string[], enable: boolean) => {
      setEnabledMcpTools(prev => {
        const newMap = new Map(prev);
        const nextTools = enable ? new Set(allToolNames) : new Set<string>();
        if (enable) {
          newMap.set(serverId, nextTools);
        } else {
          newMap.set(serverId, nextTools);
        }

        const ok = agentRuntimeStore.getState().sendRawMessage(
          {
            type: 'mcp_server_tools_set',
            serverId,
            enabledToolNames: Array.from(nextTools),
          },
          activeAgentId,
        );
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tools_set dropped: websocket not ready',
          );
        }

        return newMap;
      });
    },
    [activeAgentId],
  );

  const toggleSkill = useCallback(
    (skillId: string) => {
      if (enabledSkills.has(skillId)) {
        wsDisableSkill(skillId);
      } else {
        wsEnableSkill(skillId);
      }
    },
    [enabledSkills, wsEnableSkill, wsDisableSkill],
  );

  const toggleAllSkills = useCallback(
    (allSkillIds: string[], enable: boolean) => {
      for (const id of allSkillIds) {
        if (enable) {
          wsEnableSkill(id);
        } else {
          wsDisableSkill(id);
        }
      }
    },
    [wsEnableSkill, wsDisableSkill],
  );

  const toggleMcpToolApproval = useCallback(
    (serverId: string, toolName: string) => {
      setApprovedMcpTools(prev => {
        const newMap = new Map(prev);
        // Default: if no entry for this server, no tool is approved.
        const serverTools = new Set(prev.get(serverId) ?? []);
        const currentlyApproved = serverTools.has(toolName);
        if (currentlyApproved) {
          serverTools.delete(toolName);
        } else {
          serverTools.add(toolName);
        }
        newMap.set(serverId, serverTools);

        const ok = agentRuntimeStore.getState().sendRawMessage(
          {
            type: 'mcp_server_tool_approve',
            serverId,
            toolName,
            approved: !currentlyApproved,
          },
          activeAgentId,
        );
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tool_approve dropped: websocket not ready',
          );
        }

        return newMap;
      });
    },
    [activeAgentId],
  );

  const toggleSkillApproval = useCallback(
    (skillId: string) => {
      if (approvedSkills.has(skillId)) {
        setLocalSkillApproval(prev => {
          const next = new Map(prev);
          next.set(skillId, false);
          return next;
        });
        wsUnapproveSkill(skillId);
      } else {
        setLocalSkillApproval(prev => {
          const next = new Map(prev);
          next.set(skillId, true);
          return next;
        });
        wsApproveSkill(skillId);
      }
    },
    [approvedSkills, wsApproveSkill, wsUnapproveSkill],
  );

  const getEnabledMcpToolNames = useCallback((): string[] => {
    const toolNames: string[] = [];
    enabledMcpTools.forEach((tools, serverId) => {
      if (!mcpServers || mcpServers.some(s => s.id === serverId)) {
        tools.forEach(toolName => toolNames.push(toolName));
      }
    });
    return toolNames;
  }, [enabledMcpTools, mcpServers]);

  const getEnabledSkillIds = useCallback((): string[] => {
    return Array.from(enabledSkills);
  }, [enabledSkills]);

  // ---- Load messages from store on mount ----
  // Only hydrate from the shared ``useChatStore`` when there is no
  // ``runtimeId`` (pure store mode without server-backed history).  When a
  // ``runtimeId`` is provided the "Conversation history loading" effect
  // below is the single source of truth — reading from the shared store
  // here would otherwise leak messages from a previously-mounted
  // ``ChatBase`` (e.g. after switching examples) before the store reset
  // or history fetch completes.
  useEffect(() => {
    if (useStoreMode && !runtimeId) {
      const storeMessages = useChatStore.getState().messages;
      if (storeMessages.length > 0) {
        restoreConversation(storeMessages);
      }
    }
  }, [useStoreMode, runtimeId, restoreConversation]);

  // ---- Conversation history loading ----
  const prevHistoryScopeRef = useRef<string | undefined>(undefined);
  const historyVersionRef = useRef(0);
  // Set when the next load must come from a fresh snapshot, not the one in
  // the store: what the store holds is the transcript before the change.
  const freshSnapshotRef = useRef(false);
  // The given thread drawn, by its id: once.
  const threadSeededRef = useRef<string | null>(null);

  useEffect(() => {
    if (historyScopeId !== prevHistoryScopeRef.current) {
      if (historyScopeId) {
        historyRetryAttemptsRef.current.set(historyScopeId, 0);
      }
      prevHistoryScopeRef.current = historyScopeId;
      resetConversation();
      if (!historyScopeId) return;
    }

    if (!historyScopeId) return;

    /*
     * A thread the host gave (D-13): its session's conversation, drawn
     * once, and never replaced by the runtime's snapshot, which is its
     * agent's — every session's — not this one's.
     */
    const given = threadGivenRef.current;
    if (given) {
      if (threadSeededRef.current !== given.id) {
        threadSeededRef.current = given.id;
        useConversationStore
          .getState()
          .setMessages(historyScopeId, given.messages);
        restoreConversation(given.messages);
        useConversationStore.getState().markFetched(historyScopeId);
        setHistoryLoaded(true);
      }
      return;
    }

    if (historyVersion !== historyVersionRef.current) {
      historyVersionRef.current = historyVersion;
      if (historyVersion > 0) {
        // The transcript changed on the server outside a run — a rewind to a
        // checkpoint. Forget what is shown and load what the agent now has.
        useConversationStore.getState().clearMessages(historyScopeId);
        resetConversation();
        historyRetryAttemptsRef.current.set(historyScopeId, 0);
        freshSnapshotRef.current = true;
      }
    }

    const store = useConversationStore.getState();
    const currentlyFetching = store.isFetching(historyScopeId);
    const storedMessages = store.getMessages(historyScopeId);

    // 1) Fast local hydration for view switches in the same browser session:
    // only into an empty conversation. The saved copy holds messages, not
    // tool calls, and this effect runs again on every change of the socket's
    // state — put over a live conversation, it erased its tool cards, a
    // pending approval among them, at the socket's first retry.
    if (storedMessages.length > 0) {
      if (conversationRef.current.items.length === 0) {
        restoreConversation(storedMessages);
      }
      setHistoryLoaded(true);
    }

    if (currentlyFetching) {
      return;
    }

    // 2) On refresh/mount, prefer websocket refresh from the runtime.
    // If the socket is not connected yet, keep retryable fetch state and wait.
    if (wsState !== 'connected') {
      if (storedMessages.length === 0) {
        setHistoryLoaded(false);
      }
      return;
    }

    store.setFetching(historyScopeId, true);

    const fullContextToMessages = () =>
      extractChatMessagesFromFullContext(
        agentRuntimeStore.getState().fullContext as Record<
          string,
          unknown
        > | null,
      );

    const applyMessages = (messages: ChatMessage[]) => {
      store.setMessages(historyScopeId, messages);
      restoreConversation(messages);
      historyRetryAttemptsRef.current.set(historyScopeId, 0);
      store.markFetched(historyScopeId);
      setHistoryLoaded(true);
    };

    const existingMessages = freshSnapshotRef.current
      ? []
      : fullContextToMessages();
    freshSnapshotRef.current = false;
    if (existingMessages.length > 0) {
      applyMessages(existingMessages);
      return;
    }

    const requestSnapshotRefresh = (): boolean => {
      const candidates = [
        activeAgentId,
        protocolConfig?.agentId,
        runtimeId,
        historyScopeId,
        'default',
        undefined,
      ];
      const tried = new Set<string>();
      for (const candidate of candidates) {
        const normalized =
          typeof candidate === 'string' ? candidate.trim() : undefined;
        const key = normalized || '__global__';
        if (tried.has(key)) {
          continue;
        }
        tried.add(key);
        const ok = agentRuntimeStore.getState().requestRefresh(normalized);
        if (ok) {
          return true;
        }
      }
      return false;
    };

    // Ask the monitoring websocket for a fresh snapshot and wait briefly
    // for `fullContext.messages` to arrive.
    const refreshRequested = requestSnapshotRefresh();
    if (!refreshRequested) {
      // Socket not ready yet; allow a later retry (e.g. when wsState changes).
      store.setFetching(historyScopeId, false);
      if (storedMessages.length === 0) {
        setHistoryLoaded(false);
      }
      return;
    }

    let resolved = false;
    const retryRefreshTimeout = window.setTimeout(() => {
      if (!resolved) {
        requestSnapshotRefresh();
      }
    }, 500);

    const unsubscribe = agentRuntimeStore.subscribe(
      state => state.fullContext,
      nextFullContext => {
        if (resolved || !nextFullContext) {
          return;
        }
        const messages = extractChatMessagesFromFullContext(
          nextFullContext as Record<string, unknown>,
        );
        resolved = true;
        unsubscribe();
        applyMessages(messages);
      },
    );

    const timeout = window.setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      unsubscribe();
      // Do not mark as fetched on timeout; keep it retryable for late WS snapshots.
      store.setFetching(historyScopeId, false);
      setHistoryLoaded(storedMessages.length > 0);

      const attempts = historyRetryAttemptsRef.current.get(historyScopeId) ?? 0;
      const canRetry = wsState === 'connected' && attempts < 3;
      if (canRetry) {
        historyRetryAttemptsRef.current.set(historyScopeId, attempts + 1);
        requestSnapshotRefresh();
        setHistoryRefreshTick(tick => tick + 1);
      } else {
        // After retries are exhausted, treat the conversation as loaded-empty
        // so pending prompts are not blocked forever on fresh runtimes.
        setHistoryLoaded(true);
      }
    }, 2000);

    return () => {
      window.clearTimeout(retryRefreshTimeout);
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [
    historyScopeId,
    historyEndpoint,
    protocol?.agentId,
    wsState,
    activeAgentId,
    historyRefreshTick,
    historyVersion,
    resetConversation,
    restoreConversation,
  ]);

  // Keep in-memory store in sync with displayItems
  useEffect(() => {
    if (historyScopeId && displayItems.length > 0) {
      const messagesToSave = displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      );
      if (messagesToSave.length > 0) {
        useConversationStore
          .getState()
          .setMessages(historyScopeId, messagesToSave);
      }
    }
  }, [historyScopeId, displayItems]);

  // A store-mode chat keeps its messages in the shared chat store, as drawn.
  useEffect(() => {
    if (!useStoreMode || !conversationTouchedRef.current) return;
    useChatStore
      .getState()
      .setMessages(
        displayItems.filter(
          (item): item is ChatMessage => !isToolCallMessage(item),
        ),
      );
  }, [useStoreMode, displayItems]);

  // ---- Derived state ----
  const messages = displayItems.filter(
    (item): item is ChatMessage => !isToolCallMessage(item),
  );
  const ready = true;

  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount !== prevMessageCountRef.current) {
      prevMessageCountRef.current = currentCount;
      onMessagesChange?.(messages);
    }
  }, [displayItems, messages, onMessagesChange]);

  // Every change, streaming included — for a caller following the reply as
  // it arrives rather than counting messages. See `onItemsChange`.
  useEffect(() => {
    onItemsChange?.(
      displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      ),
    );
  }, [displayItems, onItemsChange]);

  // And everything, tool calls included — see `onDisplayItemsChange`.
  useEffect(() => {
    onDisplayItemsChange?.(displayItems);
  }, [displayItems, onDisplayItemsChange]);

  const padding = compact ? 2 : 3;

  // Derive approval config from protocol for built-in tool approval support
  const approvalConfig = useMemo((): ToolApprovalConfig | undefined => {
    if (!protocol?.configEndpoint) return undefined;
    return {
      apiBaseUrl: getApiBaseFromConfig(protocol.configEndpoint),
      authToken: protocol.authToken,
    };
  }, [protocol?.configEndpoint, protocol?.authToken]);

  const defaultAvatarConfig: Required<
    Pick<
      AvatarConfig,
      | 'userAvatar'
      | 'assistantAvatar'
      | 'showAvatars'
      | 'avatarSize'
      | 'userAvatarBg'
      | 'assistantAvatarBg'
    >
  > = {
    userAvatar: <PersonIcon size={16} />,
    assistantAvatar: <AiAgentIcon size={16} color={assistantIconColor} />,
    showAvatars: true,
    avatarSize: 32,
    userAvatarBg: 'neutral.muted',
    assistantAvatarBg: 'accent.emphasis',
    ...avatarConfig,
  };

  // ========================================================================
  // Protocol adapter subscription
  // ========================================================================
  useEffect(() => {
    if (!protocol) return;
    // Skip opening a protocol connection when auto-connect is disabled (e.g.
    // the runtime endpoint is still being created). The chat shell, companion
    // surface and launching overlay still render; we simply do not connect.
    if (!autoConnect) return;
    // Nor when there is nothing to connect to. A browser sandbox has no agent
    // behind it, and dialling one would only produce errors the person cannot
    // act on — the header already says why the chat is off.
    if (disabled) return;

    const adapter = createProtocolAdapter(protocol);
    if (!adapter) return;

    adapterRef.current = adapter;
    setAdapterReady(true);

    unsubscribeRef.current = adapter.subscribe((event: ProtocolEvent) => {
      // The run's session is there once it answers: its ui socket opens.
      ensureUiSocketRef.current();
      /*
       * Nothing more from a turn the reader has stopped.
       *
       * Stopping aborts the request and asks the backend to cancel, and
       * neither is instant: an SSE stream already in flight keeps delivering,
       * and a model mid-sentence keeps being paid for tokens that are on the
       * wire. Until this guard, every one of those still ran through the
       * handler below — so the transcript went on typing itself for as long
       * as the turn had left, which is the whole of the "I pressed stop and
       * it kept going" report. `stoppedRef` was already set here and only two
       * places downstream ever read it.
       *
       * `state-update` and `error` are still let through: they carry the
       * connection's own condition rather than the turn's output, and a chat
       * that stops listening to those after a stop is a chat that cannot tell
       * you it has since disconnected. `done` too — it is what closes the
       * turn out; suppressing it would leave the session believing a stopped
       * turn is still running.
       */
      if (
        stoppedRef.current &&
        event.type !== 'state-update' &&
        event.type !== 'error' &&
        event.type !== 'done'
      ) {
        return;
      }
      /*
       * The event, as the conversation reads it (`conversationEventsOf`):
       * one reducer whatever the protocol. What it cannot read is said.
       */
      const read = () => {
        try {
          const inputs = conversationEventsOf(event, conversationRef.current);
          changeConversation(state =>
            inputs.reduce(
              (kept, input) => reduceConversation(kept, input),
              state,
            ),
          );
        } catch (failure) {
          console.error('[ChatBase] Protocol event not read:', failure);
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
        }
      };
      /** The conversation's latest tool row with an answer, if any said nothing. */
      const toolResultFallback = (): void => {
        const items = conversationRef.current.items;
        const hasAssistantContent = items.some(
          item =>
            item.kind === 'message' &&
            item.role === 'assistant' &&
            item.text.trim().length > 0,
        );
        if (hasAssistantContent) {
          return;
        }
        const latestCompletedTool = [...items]
          .reverse()
          .find(
            item =>
              item.kind === 'tool' &&
              item.status === 'complete' &&
              item.value !== undefined,
          );
        if (!latestCompletedTool || latestCompletedTool.kind !== 'tool') {
          return;
        }
        reduce({
          type: 'MESSAGE_SAID',
          messageId: generateMessageId(),
          role: 'assistant',
          text: formatToolResultFallback(latestCompletedTool.value),
          streaming: false,
        });
      };
      switch (event.type) {
        case 'message':
          if (event.usage) {
            const timestampMs =
              event.timestamp instanceof Date
                ? event.timestamp.getTime()
                : Date.now();
            const promptTokens = Math.max(0, event.usage.promptTokens ?? 0);
            const completionTokens = Math.max(
              0,
              event.usage.completionTokens ?? 0,
            );
            const totalTokens = Math.max(
              promptTokens + completionTokens,
              event.usage.totalTokens ?? 0,
            );

            const runtimeState = agentRuntimeStore.getState();
            runtimeState.appendLocalTokenTurn({
              serviceName: monitoringServiceName,
              agentId: protocol?.agentId,
              timestampMs,
              promptTokens,
              completionTokens,
              totalTokens,
            });

            const liveCumulativeUsd = runtimeState.costUsage?.cumulativeCostUsd;
            if (
              typeof liveCumulativeUsd === 'number' &&
              Number.isFinite(liveCumulativeUsd)
            ) {
              runtimeState.upsertLocalCostPoint({
                serviceName: monitoringServiceName,
                agentId: protocol?.agentId,
                timestampMs,
                cumulativeUsd: Math.max(0, liveCumulativeUsd),
              });
            }
          }

          // A prompt that only calls a tool shows the tool, not its words.
          if (suppressAssistantTextForToolOnlyRef.current) {
            break;
          }

          if (event.message) {
            const content = event.message.content;
            if (typeof content === 'string' && content) {
              inspectAnswerRef.current = sanitizeAssistantContent(content);
            }
            read();
          }
          break;

        case 'tool-call':
          if (event.toolCall && !stoppedRef.current) {
            const toolCallId = event.toolCall.toolCallId;
            const toolName = event.toolCall.toolName;
            const args = event.toolCall.args || {};
            /*
             * Whether these args are the full set, as the protocol tells it.
             * Vercel's tool event is terminal — `{}` is an answer there,
             * legal for a tool whose parameters are all optional. AG-UI
             * streams the args after a first empty event and says so with
             * `false`. Without the flag, the old heuristics decide.
             */
            const argsComplete = event.toolCall.argsComplete;
            const known = toolCardNow(toolCallId);
            read();
            const card = toolCardNow(toolCallId);
            if (!card) {
              break;
            }
            const frontendTool = frontendToolsRef.current?.find(
              t => t.name === toolName,
            );
            const toolHandler = frontendTool?.handler;

            if (known) {
              if (
                toolHandler &&
                known.status === 'executing' &&
                (argsComplete ?? Object.keys(args).length > 0)
              ) {
                pendingToolExecutionsRef.current++;
                executeFrontendTool(toolHandler, card, toolCallId);
              }
            } else {
              // Fire pre-hook for new tool calls
              onToolCallStartRef.current?.({
                toolName,
                toolCallId,
                args,
              });
              recorderRef.current?.recorder.toolStarted({
                id: toolCallId,
                name: toolName,
                args,
              });
              // Execute when the args are complete. The protocol says so
              // when it can (`argsComplete`); without the flag, fall back
              // to the old heuristics — actual args present, or a tool
              // that declares no parameters, for which `{}` is the full
              // set and no update is ever coming. A protocol that streams
              // its args (AG-UI start) says `false` and the update branch
              // above executes once the full set has arrived.
              if (
                toolHandler &&
                (argsComplete ??
                  (Object.keys(args).length > 0 ||
                    !frontendToolExpectsArgs(frontendTool)))
              ) {
                pendingToolExecutionsRef.current++;
                executeFrontendTool(toolHandler, card, toolCallId);
              }
            }
          }
          break;

        case 'tool-result':
          if (event.toolResult) {
            const toolCallId = event.toolResult.toolCallId ?? '';
            const known = toolCardNow(toolCallId);
            read();
            const card = toolCardNow(toolCallId);
            if (known && card) {
              recorderRef.current?.recorder.toolEnded(toolCallId, {
                result: event.toolResult.result,
                error:
                  event.toolResult.error ??
                  (card.status === 'error'
                    ? (card.executionError ?? 'failed')
                    : undefined),
              });
              // Fire post-hook for tool results
              onToolCallCompleteRef.current?.({
                toolName: known.toolName,
                toolCallId,
                args: known.args,
                result: event.toolResult.result,
                status: card.status,
                error: event.toolResult.error,
              });
            }
          }
          break;

        case 'state-update':
          onStateUpdate?.(event.data);
          // A tool that answers by setting the shared state: the newest
          // running call is answered with it (`conversationEventsOf`).
          read();
          break;

        case 'activity':
          // What the server says besides the conversation's text comes on
          // the ui socket (RU-W); the run's own — `loop.session`
          // among them — are the conversation's.
          if (event.activity) {
            voiceSayRef.current?.(event.activity);
          }
          read();
          break;

        case 'done':
          /*
           * What the turn cost, when nobody else is counting.
           *
           * A server-side agent reports its context through
           * `/configure/context`, and that answer wins. An in-page agent has
           * no server to ask — so the usage the harness reports here was the
           * only account of the window there was, and it was being dropped.
           * The bar and its ring simply never appeared for a browser agent.
           */
          {
            recorderRef.current?.recorder.turnEnded({
              text: inspectAnswerRef.current || undefined,
              usage: event.usage,
            });
            inspectAnswerRef.current = '';
            const turnInput = event.usage?.promptTokens ?? 0;
            const turnOutput = event.usage?.completionTokens ?? 0;
            // The parts sum to the total when the harness did not send one:
            // keying on `totalTokens` alone dropped turns whose provider
            // counted input and output but never totalled them.
            const total = event.usage?.totalTokens ?? turnInput + turnOutput;
            if (total > 0) {
              setLocalUsage(previous => ({
                turnInput,
                turnOutput,
                // Added up, not replaced: the session is every turn so far,
                // and the harness reports one turn at a time.
                sessionInput: (previous?.sessionInput ?? 0) + turnInput,
                sessionOutput: (previous?.sessionOutput ?? 0) + turnOutput,
                totalTokens: total,
              }));
            }
          }
          // The adapter signals the entire multi-turn conversation
          // (including all continuations) has finished.
          if (
            suppressAssistantTextForToolOnlyRef.current &&
            hideMessagesAfterToolUIRef.current
          ) {
            toolResultFallback();
          }
          // A stopped turn was ended when it was stopped.
          if (!stoppedRef.current) {
            read();
          }
          suppressAssistantTextForToolOnlyRef.current = false;
          pendingToolExecutionsRef.current = 0;
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh(activeAgentId);
          break;

        case 'error':
          console.error('[ChatBase] Protocol error:', event.error);
          recorderRef.current?.recorder.turnEnded({
            error: event.error?.message ?? 'error',
          });
          if (
            event.error?.message &&
            /exceeded maximum retries/i.test(event.error.message) &&
            hideMessagesAfterToolUIRef.current
          ) {
            toolResultFallback();
          }
          read();
          suppressAssistantTextForToolOnlyRef.current = false;
          setError(event.error || new Error('Unknown error'));
          pendingToolExecutionsRef.current = 0;
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh(activeAgentId);
          break;

        default:
          read();
          break;
      }
    });

    adapter.connect().catch(console.error);

    return () => {
      unsubscribeRef.current?.();
      adapterRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolKey, onStateUpdate, useStoreMode, autoConnect]);

  // Helper to run a frontend tool and send result back via adapter
  function executeFrontendTool(
    toolHandler: (args: Record<string, unknown>) => Promise<unknown>,
    toolCallMsg: ToolCallMessage,
    toolCallId: string,
  ) {
    (async () => {
      // If the user clicked Stop, skip executing this tool entirely.
      if (stoppedRef.current) {
        pendingToolExecutionsRef.current--;
        if (pendingToolExecutionsRef.current < 0) {
          pendingToolExecutionsRef.current = 0;
        }
        return;
      }
      try {
        const result = await toolHandler(toolCallMsg.args);
        if (adapterRef.current) {
          await adapterRef.current.sendToolResult(toolCallId, {
            toolCallId,
            success: true,
            result,
          });
        }
        recorderRef.current?.recorder.toolEnded(toolCallId, { result });
        reduce({
          type: 'TOOL_CALL_DONE',
          toolCallId,
          success: true,
          result,
        });
      } catch (err) {
        console.error('[ChatBase] Frontend tool execution error:', err);
        recorderRef.current?.recorder.toolEnded(toolCallId, {
          error: (err as Error).message,
        });
        reduce({
          type: 'TOOL_CALL_DONE',
          toolCallId,
          success: false,
          error: (err as Error).message,
        });
      } finally {
        pendingToolExecutionsRef.current--;
        if (pendingToolExecutionsRef.current < 0) {
          pendingToolExecutionsRef.current = 0;
        }
        // NOTE: Do NOT reset isLoading here.  The adapter's 'done' event
        // is the sole authority for ending the loading state — it fires
        // only when RUN_FINISHED arrives with no pending tool calls,
        // meaning the entire multi-turn conversation is truly complete.
      }
    })();
  }

  // ---- Auto-scroll to bottom ----
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayItems]);

  // ========================================================================
  // handleSend
  // ========================================================================
  // Voice (V1): what was said and put in the composer, until sent.
  const spokenRef = useRef<SpokenMetadata | undefined>(undefined);
  // Its voice with what it leaves unsaid filled in: Datalayer's models and packages.
  // The person's own settings, followed as the voice menu changes them (VO-30).
  const [personVoice] = useVoiceSettings();
  const settled = useMemo(
    () => (voice ? settledVoice(voice, personVoice) : undefined),
    [voice, personVoice],
  );
  // The words in the box are still being heard: greyed until final (VO-11).
  const [voiceInterim, setVoiceInterim] = useState(false);
  /*
   * Its answers heard (VO-20, VO-21), by Datalayer's speech service: the
   * host's speaker when it gives one (`ChatFloating`, whose assistant's mouth
   * moves with it), else the chat's own — a chat given a `voice` speaks
   * wherever it is drawn.
   */
  const hostSpeaks = Boolean(onReadAloud || onStopSpeaking);
  const ownVoice = useVoiceSpeaker(settled, !hostSpeaks);
  useSpokenAnswers(
    displayItems,
    isLoading,
    !hostSpeaks && settled?.output === 'always',
    ownVoice.speaker,
  );
  const speakingNow = voiceSpeaking || ownVoice.state.speaking;
  // The sentence being said, marked in the conversation (VO-65).
  const sentenceSaid = hostSpeaks ? voiceSentence : ownVoice.state.sentence;
  const saidConversationRef = useRef<HTMLDivElement>(null);
  useSaidSentence(saidConversationRef, sentenceSaid, displayItems);
  /*
   * A line the agent wants heard, not written (VO-35): a caption while the
   * run goes on, said by the speaker where answers are said by themselves.
   */
  const [voiceSaid, setVoiceSaid] = useState('');
  voiceSayRef.current = activity => {
    if (isVoiceInterrupted(activity)) {
      // Spoken over, the runtime says (VO-46): its voice stops.
      if (onStopSpeaking) {
        onStopSpeaking();
      } else if (ownVoice.speaker) {
        ownVoice.stop();
      }
      return;
    }
    const line = lineToSay(activity);
    if (!line) {
      return;
    }
    setVoiceSaid(line);
    if (settled?.output === 'always') {
      if (onReadAloud) {
        onReadAloud(line);
      } else {
        ownVoice.speaker?.say(line);
      }
    }
  };
  useEffect(() => {
    if (!isLoading) {
      setVoiceSaid('');
    }
  }, [isLoading]);
  // Answers spoken over, hands-free (VO-13): marked *interrupted*.
  const [interruptedIds, setInterruptedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The conversation as shown, read when the person speaks over an answer.
  const shownItemsRef = useRef<readonly DisplayItem[]>([]);
  const markInterrupted = useCallback(() => {
    const spokenOver = answerSpokenOver(
      shownItemsRef.current.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      ),
    );
    if (spokenOver) {
      setInterruptedIds(ids => new Set([...ids, spokenOver]));
    }
  }, []);
  const stopSpeaking =
    onStopSpeaking ?? (ownVoice.speaker ? ownVoice.stop : undefined);
  // How loud the answer plays: the host's speaker's, or the chat's own (VO-13).
  const playbackLevel = hostSpeaks ? voiceLevel : ownVoice.level;
  const readAnswerAloud =
    onReadAloud ?? (ownVoice.speaker ? ownVoice.read : undefined);
  const handleSend = useCallback(
    async (
      messageOverride?: string,
      // AG-UI's: what goes with the run besides the conversation — an
      // application's page says there what it did (R-04).
      forwardedPropsGiven?: Record<string, unknown>,
      // How the message was heard, when it was said (VO-27).
      spokenGiven?: SpokenMetadata,
    ) => {
      const messageContent = (messageOverride ?? input).trim();
      if (!messageContent || isLoading) return;
      if (!adapterRef.current && !onSendMessage) return;
      // Its files are uploaded first: the run names their refs (RU-6).
      if (forwardedPropsGiven && namesFiles(forwardedPropsGiven)) {
        try {
          forwardedPropsGiven = await withUploadedFiles(
            forwardedPropsGiven,
            uploadToConversation,
          );
        } catch (failure) {
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
          return;
        }
      }
      // A press of what a display offered goes up the ui socket, checked
      // there; the run that answers it names it only (RU-W).
      const pressed = displayPressOf(forwardedPropsGiven);
      if (pressed && forwardedPropsGiven) {
        const socket = uiSocketRef.current?.socket;
        if (!socket) {
          setError(new Error('This conversation’s ui channel is not open.'));
          return;
        }
        try {
          const result = await socket.act(pressed);
          if (!result.ok) {
            setError(
              new Error(
                result.detail || `The press was refused (${result.status}).`,
              ),
            );
            return;
          }
          forwardedPropsGiven = withPress(forwardedPropsGiven, result.value);
        } catch (failure) {
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
          return;
        }
      }
      stoppedRef.current = false;
      inspectAnswerRef.current = '';
      recorderRef.current?.recorder.turnStarted(
        messageContent,
        selectedModel || undefined,
      );
      suppressAssistantTextForToolOnlyRef.current =
        isToolCallOnlyPrompt(messageContent);
      // Said, then sent: by the microphone at once, or from the composer it
      // was put in — the words may have been edited, it was still said.
      // Or said in a composer its host holds, riding on the run (`voice`).
      const spoken =
        spokenGiven ??
        spokenOf(forwardedPropsGiven?.voice) ??
        (messageOverride === undefined ? spokenRef.current : undefined);
      spokenRef.current = undefined;
      const forwardedProps = spoken
        ? { ...(forwardedPropsGiven ?? {}), voice: spoken }
        : forwardedPropsGiven;

      // The message says how it was heard; its sound, sent to be kept
      // (VO-63), rides on the run only, never on the conversation.
      let heardAs: SpokenMetadata | undefined;
      if (spoken) {
        const { sound: _sound, ...rest } = spoken;
        heardAs = rest;
      }
      const userMessage = createUserMessage(
        messageContent,
        heardAs ? { ...heardAs } : undefined,
      );
      const currentMessages = displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      );
      const allMessages = [...currentMessages, userMessage];

      {
        const { id, role: _role, content: _content, ...extras } = userMessage;
        changeLayer(kept => ({
          ...kept,
          extras: new Map(kept.extras).set(id, extras),
        }));
      }
      changeConversation(state =>
        reduceConversation(withPrompt(state, userMessage.id, messageContent), {
          type: 'RUN_STARTED',
        }),
      );
      setInput('');
      setIsLoading(true);
      setIsStreaming(true);
      setError(null);

      try {
        if (onSendMessage) {
          if (enableStreaming) {
            const assistantMessageId = generateMessageId();
            const said = (text: string, streaming: boolean) =>
              reduce({
                type: 'MESSAGE_SAID',
                messageId: assistantMessageId,
                role: 'assistant',
                text,
                streaming,
              });
            said('', true);

            if (useStoreMode) {
              useChatStore.getState().startStreaming(assistantMessageId);
            }

            abortControllerRef.current = new AbortController();

            await onSendMessage(messageContent, allMessages, {
              onChunk: (chunk: string) => {
                reduce({
                  type: 'TEXT_MESSAGE_CONTENT',
                  messageId: assistantMessageId,
                  delta: chunk,
                });
              },
              onComplete: (fullResponse: string) => {
                said(fullResponse, false);
                if (useStoreMode) {
                  useChatStore.getState().stopStreaming();
                }
              },
              onError: (error: Error) => {
                said(chatText.error(error.message), false);
                if (useStoreMode) {
                  useChatStore.getState().stopStreaming();
                }
                setError(error);
              },
              signal: abortControllerRef.current.signal,
            });
          } else {
            const response = await onSendMessage(messageContent, allMessages);
            if (response) {
              reduce({
                type: 'MESSAGE_SAID',
                messageId: generateMessageId(),
                role: 'assistant',
                text: response,
                streaming: false,
              });
            }
          }
        } else if (adapterRef.current) {
          const toolsForRequest = (frontendTools || []).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'object', properties: {} },
          }));

          console.warn(
            '[ChatBase] frontendTools count:',
            frontendTools?.length ?? 0,
            'toolsForRequest:',
            toolsForRequest.map(t => t.name),
          );
          const enabledMcpToolNames = getEnabledMcpToolNames();
          const enabledSkillIds = getEnabledSkillIds();

          // The thread is opened by this run: its host keeps it (D-13).
          noteThreadStarted();
          await adapterRef.current.sendMessage(userMessage, {
            threadId: threadIdRef.current,
            messages: allMessages,
            ...(selectedModel && { model: selectedModel }),
            tools: toolsForRequest,
            builtinTools: enabledMcpToolNames,
            skills: enabledSkillIds,
            identities: connectedIdentitiesRef.current,
            ...(forwardedProps ? { forwardedProps } : {}),
          } as Parameters<typeof adapterRef.current.sendMessage>[1]);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[ChatBase] Send error:', err);
          // Said in the conversation, as the assistant's words.
          changeConversation(state => withError(state, (err as Error).message));
          setError(err as Error);
        }
      } finally {
        // NOTE: Do NOT reset isLoading here.  The adapter's 'done' event
        // handles this — it fires only after the entire multi-turn
        // conversation (including all tool-call continuations) completes.
        // For the non-adapter path (onSendMessage), 'done' is never
        // emitted so we reset when no adapter is present.
        if (!adapterRef.current) {
          if (conversationRef.current.running) {
            reduce({ type: 'RUN_FINISHED' });
          }
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh(activeAgentId);
        }
        suppressAssistantTextForToolOnlyRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [
      input,
      isLoading,
      displayItems,
      selectedModel,
      frontendTools,
      useStoreMode,
      onSendMessage,
      activeAgentId,
      enableStreaming,
      getEnabledMcpToolNames,
      getEnabledSkillIds,
      noteThreadStarted,
      chatText,
      uploadToConversation,
      changeConversation,
      changeLayer,
      reduce,
    ],
  );

  // Send pending prompt once history loaded and adapter/handler available
  useEffect(() => {
    if (!pendingPrompt) return;
    // Already handled this exact prompt in the current component instance.
    if (pendingPromptKey && pendingPromptSentRef.current === pendingPromptKey) {
      return;
    }
    if (pendingPromptKey && sentPendingPromptKeys.has(pendingPromptKey)) {
      pendingPromptSentRef.current = pendingPromptKey;
      return;
    }
    // Do not block prompt replay forever when runtime history cannot be fetched
    // (e.g. websocket not connected yet/anymore). In that case we fall back to
    // submitting once the adapter is ready.
    const canProceedWithoutHistory = !historyScopeId || wsState !== 'connected';
    if (!historyLoaded && !canProceedWithoutHistory) return;
    if (!adapterReady && !onSendMessage) return;
    pendingPromptSentRef.current = pendingPromptKey ?? null;
    if (pendingPromptKey) {
      sentPendingPromptKeys.add(pendingPromptKey);
    }
    queueMicrotask(() => handleSend(pendingPrompt));
  }, [
    pendingPrompt,
    pendingPromptKey,
    historyLoaded,
    historyScopeId,
    wsState,
    adapterReady,
    handleSend,
    onSendMessage,
    applyServerApprovalDecision,
  ]);

  // ---- handleStop ----
  // Spoken over (VO-46, VO-13), an application's session is told so and
  // stays open; Stop leaves it to be resumed.
  const stopTurn = useCallback(
    (spokenOver: boolean) => {
      stoppedRef.current = true;
      abortControllerRef.current?.abort();

      // Best-effort cancellation without tearing down adapter/session.
      const adapter = adapterRef.current as {
        interruptSession?: () => Promise<void>;
        terminateSession?: () => Promise<void>;
        terminateAgent?: () => Promise<void>;
        terminateTask?: () => Promise<void>;
        terminateRequest?: () => Promise<void>;
        stopGeneration?: () => void;
      } | null;
      if (adapter) {
        // Abort the client-side SSE / fetch stream (if the adapter exposes it).
        if (typeof adapter.stopGeneration === 'function') {
          adapter.stopGeneration();
        }
        // Also tell the backend to stop (server-side cancellation).
        if (spokenOver && typeof adapter.interruptSession === 'function') {
          void adapter.interruptSession().catch(() => {});
        } else if (typeof adapter.terminateSession === 'function') {
          void adapter.terminateSession().catch(() => {});
        } else if (typeof adapter.terminateAgent === 'function') {
          void adapter.terminateAgent().catch(() => {});
        } else if (typeof adapter.terminateTask === 'function') {
          void adapter.terminateTask().catch(() => {});
        } else if (typeof adapter.terminateRequest === 'function') {
          void adapter.terminateRequest().catch(() => {});
        }
      }

      // The turn ends stopped: what streamed stops, a call under way says so.
      changeConversation(state => withTurnEnded(state, 'stopped'));

      if (useStoreMode) {
        useChatStore.getState().stopStreaming();
      }
      pendingToolExecutionsRef.current = 0;
      setIsLoading(false);
      setIsStreaming(false);
      agentRuntimeStore.getState().requestRefresh(activeAgentId);
      // The boxes under the delegation cards read the runtime store, not the
      // tool calls above; without this they keep their dots until the server's
      // own stop event arrives — if it ever does.
      agentRuntimeStore.getState().stopSubagentActivity();
      suppressAssistantTextForToolOnlyRef.current = false;

      // Also interrupt any code running in the sandbox (best-effort).
      sandboxStatusQuery.interrupt();

      /*
       * Interrupt the connected notebook kernel too, whatever it claims to be
       * doing.
       *
       * This used to fire only when `kernel.status === 'busy'`, and that status
       * is a value pushed from the server: a cell submitted a moment ago is
       * running while the client still reads `idle`, which is precisely the
       * window somebody hits Stop in. The check therefore skipped the interrupt
       * exactly when it was wanted. Interrupting an idle kernel costs nothing —
       * there is no execution to raise `KeyboardInterrupt` in — so the test was
       * only ever able to do harm.
       */
      if (kernel) {
        void kernel.interrupt().catch(() => {});
      }
    },
    [
      kernel,
      useStoreMode,
      activeAgentId,
      protocol?.configEndpoint,
      protocol?.authToken,
      protocol?.agentId,
    ],
  );
  const handleStop = useCallback(() => stopTurn(false), [stopTurn]);
  const handleSpokenOver = useCallback(() => stopTurn(true), [stopTurn]);

  /*
   * How a message's display presses what it offered (RU-4,
   * RU-W): with the token of the offer, as the run's press — which
   * `handleSend` sends up the ui socket before the run, the run naming it
   * only. An answer is the person's words in the conversation; any other
   * press, the action's name.
   */
  const actOnDisplay = useCallback(
    (display: Display): UiAct =>
      async action => {
        const offer = display.actions?.find(one => one.name === action.action);
        if (!offer) {
          throw new Error(`“${action.action}” was not offered here.`);
        }
        const value = (action.payload as { value?: unknown } | undefined)
          ?.value;
        const words =
          action.action === ANSWER_ACTION
            ? typeof value === 'string'
              ? value
              : isFileRef(value)
                ? value.name
                : 'Answered.'
            : action.action;
        await handleSend(words, {
          loop: {
            action: {
              name: action.action,
              display_id: display.id,
              token: offer.token,
              payload: action.payload ?? {},
            },
          },
        });
      },
    [handleSend],
  );

  // ---- handleNewChat ----
  const handleNewChat = useCallback(() => {
    resetConversation();
    pendingToolExecutionsRef.current = 0;
    setInput('');
    threadIdRef.current = generateMessageId();
    if (useStoreMode) clearStoreMessages();
    if (historyScopeId)
      useConversationStore.getState().clearMessages(historyScopeId);
    onNewChat?.();
    headerButtons?.onNewChat?.();
  }, [
    clearStoreMessages,
    onNewChat,
    headerButtons,
    useStoreMode,
    runtimeId,
    resetConversation,
  ]);

  // Hand the send function to a host that owns the input box (the LOOP
  // workspace). Withdrawn on unmount so nothing holds a stale sender.
  useEffect(() => {
    if (!onSendReady) return undefined;
    if (!adapterReady && !onSendMessage) {
      onSendReady(null);
      return undefined;
    }
    onSendReady({
      send: (message: string, forwardedProps?: Record<string, unknown>) => {
        void handleSend(message, forwardedProps);
      },
      stop: handleStop,
      // The same reset the header's + performs, for a host whose controls
      // live outside this component — the LOOP prompt's + reaches it here.
      newChat: handleNewChat,
      thread: () => threadIdRef.current,
      // Its speaker, for a host whose composer holds the microphone (VO-10).
      stopSpeaking,
      // How loud it plays, for a host's hands-free barge-in (VO-13).
      voiceLevel: playbackLevel,
      // The answer spoken over, marked for a host's own composer (VO-13).
      markInterrupted,
      // Spoken over: the run ends, the application's session stays open (VO-46).
      interrupt: handleSpokenOver,
    });
    return () => {
      onSendReady(null);
    };
  }, [
    onSendReady,
    adapterReady,
    onSendMessage,
    handleSend,
    handleStop,
    handleSpokenOver,
    handleNewChat,
    stopSpeaking,
    playbackLevel,
    markInterrupted,
  ]);

  // Streaming state, for a host that draws the prompt.
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [onLoadingChange, isLoading]);

  // Whether its voice speaks, for a host that draws the composer (VO-10).
  useEffect(() => {
    onSpeakingChange?.(speakingNow);
  }, [onSpeakingChange, speakingNow]);

  // ---- handleClear ----
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      resetConversation();
      if (useStoreMode) clearStoreMessages();
      if (historyScopeId)
        useConversationStore.getState().clearMessages(historyScopeId);
      onClear?.();
      headerButtons?.onClear?.();
    }
  }, [
    clearStoreMessages,
    onClear,
    headerButtons,
    useStoreMode,
    runtimeId,
    resetConversation,
  ]);

  // ---- Turn removal (the TurnFooter's remove action) ----
  const handleRemoveItems = useCallback(
    (ids: string[]) => {
      const drop = new Set(ids);
      // The turn's rows leave the conversation, its steps the web's layer.
      const rows = displayItemsRef.current
        .filter(item => drop.has(item.id))
        .map(rowIdOf);
      changeConversation(state => withoutItems(state, rows));
      changeLayer(kept =>
        kept.steps.some(step => drop.has(step.item.id))
          ? {
              ...kept,
              steps: kept.steps.filter(step => !drop.has(step.item.id)),
            }
          : kept,
      );
    },
    [changeConversation, changeLayer],
  );

  // ---- HITL respond handler (passed to MessageList) ----
  const handleRespond = useCallback(
    async (toolCallId: string, result: unknown) => {
      const existingToolCall = toolCardNow(toolCallId);
      if (
        existingToolCall &&
        (existingToolCall.status === 'executing' ||
          existingToolCall.status === 'inProgress')
      ) {
        const isApprovalDecision =
          !!result &&
          typeof result === 'object' &&
          (result as Record<string, unknown>).type ===
            'tool-approval-decision' &&
          typeof (result as Record<string, unknown>).approved === 'boolean';

        if (isApprovalDecision && adapterRef.current) {
          const resultRecord = result as Record<string, unknown>;
          const approved = Boolean(resultRecord.approved);
          const fromServerEcho = resultRecord._fromServerEcho === true;
          const alreadyDispatched = resultRecord._alreadyDispatched === true;
          const requiresClientContinuation =
            existingToolCall.status === 'inProgress';
          const rawToolName =
            typeof resultRecord.toolName === 'string'
              ? (resultRecord.toolName as string)
              : existingToolCall.toolName;
          const isMcpApprovalTool = rawToolName.includes('__');

          // When the user approves a tool call inline, immediately reflect that
          // approval in the tools dropdown so the toggle switches to "On".
          // Tool names follow the convention "serverId__toolName" (MCP) or are
          // bare skill names. We extract the server prefix for MCP tools.
          if (approved) {
            const sep = rawToolName.indexOf('__');
            if (sep !== -1) {
              const serverId = rawToolName.slice(0, sep);
              const toolName = rawToolName.slice(sep + 2);
              setApprovedMcpTools(prev => {
                const newMap = new Map(prev);
                const tools = new Set(prev.get(serverId) ?? []);
                tools.add(toolName);
                newMap.set(serverId, tools);
                return newMap;
              });
            }
          }

          try {
            const approvalId =
              typeof result === 'object' &&
              result !== null &&
              typeof (result as Record<string, unknown>).approvalId === 'string'
                ? ((result as Record<string, unknown>).approvalId as string)
                : undefined;

            // Match AgentToolApprovalsExample semantics: first click sends only
            // a websocket decision; continuation waits for server echo.
            // Deferred pending-approval calls (`status === 'inProgress'`) still
            // require an explicit sendToolResult continuation from the client,
            // so do not return early in that mode.
            if (!fromServerEcho && !requiresClientContinuation) {
              if (approvalId) {
                if (approved) {
                  await onApproveApproval?.(approvalId, undefined, toolCallId);
                } else {
                  await onRejectApproval?.(approvalId, undefined, toolCallId);
                }
              }
              return;
            }

            if (approvalId && !alreadyDispatched) {
              if (approved) {
                await onApproveApproval?.(approvalId, undefined, toolCallId);
              } else {
                await onRejectApproval?.(approvalId, undefined, toolCallId);
              }
            }

            // MCP approvals are unblocked server-side by the websocket decision
            // and continue on the same stream. Avoid sending an extra
            // sendToolResult continuation, which can trigger duplicate approvals.
            if (isMcpApprovalTool && !requiresClientContinuation) {
              return;
            }

            // The person's decision, said on the call; the run goes on.
            changeConversation(state =>
              reduceConversation(
                reduceConversation(state, {
                  type: 'TOOL_CALL_DONE',
                  toolCallId,
                  success: approved,
                  result,
                  answered: true,
                  ...(approved
                    ? {}
                    : { error: 'Tool approval rejected by user' }),
                }),
                { type: 'RUN_STARTED' },
              ),
            );

            setIsLoading(true);
            setIsStreaming(true);

            await adapterRef.current.sendToolResult(toolCallId, {
              toolCallId,
              success: approved,
              result: approved
                ? {
                    approved: true,
                    message: 'Tool call approved by user.',
                    ...(approvalId ? { approvalId } : {}),
                  }
                : {
                    approved: false,
                    message: 'Tool call rejected by user.',
                    ...(approvalId ? { approvalId } : {}),
                  },
              ...(approved ? {} : { error: 'Tool approval rejected by user' }),
            });
          } catch (err) {
            console.error('[ChatBase] Approval continuation error:', err);
            setError(err as Error);
          }
          return;
        }

        // The person's answer completes the call.
        reduce({
          type: 'TOOL_CALL_DONE',
          toolCallId,
          success: true,
          result,
          answered: true,
        });

        if (adapterRef.current) {
          let responseText: string;
          if (typeof result === 'string') {
            responseText = result;
          } else if (
            result &&
            typeof result === 'object' &&
            'accepted' in result
          ) {
            const hitlResult = result as {
              accepted: boolean;
              steps?: Array<{ description: string }>;
            };
            if (hitlResult.accepted) {
              const stepDescriptions =
                hitlResult.steps?.map(s => s.description).join(', ') || '';
              responseText = stepDescriptions
                ? `I confirm and approve the following steps: ${stepDescriptions}`
                : 'I confirm and approve the plan.';
            } else {
              responseText =
                'I reject this plan. Please suggest something else.';
            }
          } else {
            responseText = JSON.stringify(result, null, 2);
          }

          const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'user',
            content: responseText,
            createdAt: new Date(),
          };

          setIsLoading(true);
          setIsStreaming(true);
          reduce({ type: 'RUN_STARTED' });

          try {
            const allMessages = displayItems.filter(
              (item): item is ChatMessage => !isToolCallMessage(item),
            );
            await adapterRef.current.sendMessage(userMessage, {
              threadId: threadIdRef.current,
              messages: [...allMessages, userMessage],
            } as Parameters<typeof adapterRef.current.sendMessage>[1]);
          } catch (err) {
            console.error('[ChatBase] HITL respond error:', err);
          }
          // NOTE: Do NOT reset isLoading here — the adapter's 'done'
          // event will handle it when the run truly completes.
        }
      }
    },
    [
      displayItems,
      onApproveApproval,
      onRejectApproval,
      toolCardNow,
      changeConversation,
      reduce,
    ],
  );
  handleRespondRef.current = handleRespond;

  // ---- Suggestion handlers (for EmptyState) ----
  const handleSuggestionSubmit = useCallback(
    (suggestion: Suggestion) => {
      void handleSend(suggestion.message);
    },
    [handleSend],
  );

  const handleSuggestionFill = useCallback((message: string) => {
    setInput(message);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Banner approvals dispatch the decision immediately; the continuation is
  // resumed when the runtime websocket echoes approved/rejected.
  const handleBannerApprove = useCallback(
    async (approvalId: string, note?: string) => {
      // Decision dispatch happens here; continuation is resumed on server echo.
      await onApproveApproval?.(approvalId, note);
    },
    [onApproveApproval],
  );

  const handleBannerReject = useCallback(
    async (approvalId: string, note?: string) => {
      // Decision dispatch happens here; continuation is resumed on server echo.
      await onRejectApproval?.(approvalId, note);
    },
    [onRejectApproval],
  );

  // ---- Compute data for the prompt ----
  // Merge real-time WebSocket MCP status into the cached config data so the
  // dropdown reflects live availability even when the config query was cached
  // before the MCP servers finished starting.
  const configMcpServers = (configQuery.data?.mcpServers || []).filter(
    server => !mcpServers || isServerSelected(server),
  );
  const filteredMcpServers = useMemo(() => {
    const merged = configMcpServers.map(server => {
      const wsServer = effectiveMcpStatusData?.servers?.find(
        s => s.id === server.id,
      );
      if (wsServer && wsServer.status === 'started') {
        const updates: Partial<typeof server> = {};
        if (!server.isAvailable) {
          updates.isAvailable = true;
        }
        // Always prefer WS-discovered tools over cached config data.
        // The config query may have been fetched before MCP servers
        // finished starting, leaving tools empty or stale.
        if (wsServer.tools && wsServer.tools.length > 0) {
          updates.tools = wsServer.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            enabled: t.enabled ?? true,
          }));
        }
        if (Object.keys(updates).length > 0) {
          return { ...server, ...updates };
        }
      }
      return server;
    });

    // Include WS-only servers that are started but missing from the config
    // query (e.g. config was fetched before the MCP server finished starting).
    const configIds = new Set(configMcpServers.map(s => s.id));
    for (const wsServer of effectiveMcpStatusData?.servers ?? []) {
      if (
        wsServer.status === 'started' &&
        !configIds.has(wsServer.id) &&
        wsServer.tools &&
        wsServer.tools.length > 0
      ) {
        const selected =
          !mcpServers || mcpServers.some(s => s.id === wsServer.id);
        if (selected) {
          merged.push({
            id: wsServer.id,
            name: wsServer.id,
            description: '',
            url: '',
            enabled: true,
            tools: wsServer.tools.map(t => ({
              name: t.name,
              description: t.description || '',
              enabled: t.enabled ?? true,
            })),
            args: [],
            requiredEnvVars: [],
            isAvailable: true,
            transport: 'stdio',
            isConfig: false,
            isRunning: true,
          });
        }
      }
    }

    return merged;
  }, [configMcpServers, effectiveMcpStatusData, mcpServers]);

  // ---- Not ready ----
  if (!ready) {
    return (
      <Box
        className={className}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height="100%"
        p={4}
        borderRadius={borderRadius}
        bg={backgroundColor || 'canvas.default'}
        border={border}
        boxShadow={boxShadow}
      >
        {loadingState || (
          <>
            <Spinner size="large" />
            <Text sx={{ mt: 3, color: 'fg.muted' }}>Initializing chat...</Text>
          </>
        )}
      </Box>
    );
  }

  // ---- apiBase for indicators (derived from configEndpoint) ----
  // Indicators (McpStatusIndicator, SandboxStatusIndicator) prepend
  // "/api/v1/configure/…" themselves, so we need the raw base URL
  // (without "/api/v1") rather than getApiBaseFromConfig() which keeps it.
  const indicatorApiBase = protocol?.configEndpoint
    ? protocol.configEndpoint.replace(/\/api\/v1\/(config|configure)\/?$/, '')
    : undefined;

  /*
   * Whether the composer may be typed in.
   *
   * It waits for the config query because that is the round trip proving the
   * agent is reachable. The condition has to mirror `configQueriesEnabled`
   * exactly, though: a protocol that never runs the query has nothing to wait
   * for, and waiting anyway leaves the input `readOnly` for good — selectable,
   * focusable, and silently ignoring every keystroke.
   *
   * `=== false` was too narrow for that. A config that simply omits the flag —
   * an in-page agent has no endpoint to ask — is equally never going to
   * produce data.
   */
  const connectionConfirmed =
    !protocol ||
    !protocol.enableConfigQuery ||
    !!configQuery.data ||
    !!skillsQuery.data;

  const resolvedDescription =
    description || configQuery.data?.welcomeMessage || '';

  const serverSuggestions = configQuery.data?.suggestions;
  const resolvedSuggestions =
    suggestions && suggestions.length > 0
      ? suggestions
      : Array.isArray(serverSuggestions) && serverSuggestions.length > 0
        ? serverSuggestions
            /*
              Either shape. A running agent may be older than the catalogue it
              was built from, where a suggestion was a bare string —
              `String(item)` on the mapping form yields "[object Object]",
              which is a chip that sends nonsense rather than one that is
              absent.
            */
            .map(item => {
              if (typeof item === 'string') {
                const text = item.trim();
                return { title: text, message: text };
              }
              const text = (item?.text ?? '').trim();
              // The summary is the label when the spec gave one.
              const summary = (item?.summary ?? '').trim();
              return { title: summary || text, message: text };
            })
            .filter(item => item.message)
        : undefined;

  /*
   * The welcome, as the first message: drawn as the agent's own words are,
   * never sent nor kept. With it, the history is never empty, so the empty
   * state gives way to it.
   */
  const welcomedItems: DisplayItem[] = welcome
    ? [
        {
          id: '__welcome__',
          role: 'assistant',
          content: welcome,
          createdAt: WELCOME_AT,
        } as DisplayItem,
        ...displayItems,
      ]
    : displayItems;

  shownItemsRef.current = welcomedItems;
  const saidId = saidMessageId(welcomedItems, sentenceSaid);
  /*
   * *Read aloud* under each answer the agent has finished (VO-21),
   * when the host reads answers aloud on request.
   */
  const writingId =
    isLoading || isStreaming
      ? [...welcomedItems]
          .reverse()
          .find(
            (item): item is ChatMessage =>
              !isToolCallMessage(item) && item.role === 'assistant',
          )?.id
      : undefined;
  const readAloudFooter =
    readAnswerAloud || interruptedIds.size
      ? (message: ChatMessage) => {
          const text = getMessageText(message);
          return (
            <>
              {interruptedIds.has(message.id) ? (
                <Text
                  sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}
                  data-interrupted=""
                >
                  interrupted
                </Text>
              ) : null}
              {readAnswerAloud && readsAloud(message, text, writingId) ? (
                <ReadAloud onRead={() => readAnswerAloud(text)} />
              ) : null}
            </>
          );
        }
      : undefined;

  const messagesContent = children ? (
    children
  ) : (
    <Box
      ref={saidConversationRef}
      display="flex"
      flexDirection="column"
      minHeight={0}
      /*
          A reading column, not a full-bleed sheet.

          The transcript keeps a book-page width and centres itself; on a
          narrow chat column the cap never binds and nothing changes. The
          rows inside carry their own horizontal padding, which becomes the
          margin once the cap does bind.
        */
      width="100%"
      maxWidth={920}
      mx="auto"
      bg="canvas.default"
    >
      <ChatMessageList
        displayItems={welcomedItems}
        actOn={protocol?.uiSocket ? actOnDisplay : undefined}
        upload={protocol?.uiFiles ? uploadToConversation : undefined}
        isLoading={isLoading}
        isStreaming={isStreaming}
        showLoadingIndicator={showLoadingIndicator}
        hideMessagesAfterToolUI={hideMessagesAfterToolUI}
        avatarConfig={defaultAvatarConfig}
        padding={padding}
        // Tool calls are drawn by the page's Reactor plugins; a named
        // notebook's cell surfaces stand in for the default row of its tools,
        // so every chat with a headless notebook gets the same transcript.
        notebookToolSurfacesId={notebookToolSurfacesId}
        approvalConfig={approvalConfig}
        messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
        onRespond={handleRespond}
        showTurnFooters={showTurnFooter}
        renderMessageFooter={readAloudFooter}
        saidMessageId={saidId}
        agentUsage={agentUsage}
        onRemoveItems={handleRemoveItems}
        mcpServers={filteredMcpServers}
        emptyContent={
          launching ? null : (
            <ChatEmptyState
              emptyState={emptyState}
              brandIcon={brandIcon}
              description={resolvedDescription}
              suggestions={resolvedSuggestions}
              submitOnSuggestionClick={submitOnSuggestionClick}
              onSuggestionSubmit={handleSuggestionSubmit}
              onSuggestionFill={handleSuggestionFill}
            />
          )
        }
      />
      {trailingContent}
    </Box>
  );

  // The microphone, in the composer's footer (VO-10, VO-11).
  const voiceControl =
    settled && settled.input !== 'off' ? (
      <ComposerVoice
        voice={settled}
        input={input}
        setInput={setInput}
        disabled={disabled || launching}
        speaking={speakingNow}
        onStopSpeaking={stopSpeaking}
        // Barge-in gated on how loud the answer plays (VO-13): the host's
        // speaker, or the chat's own.
        playbackLevel={playbackLevel}
        // Hands-free (VO-12, VO-13): the run in progress, stopped when the
        // person speaks over it, and the answer marked interrupted.
        running={isLoading}
        // Spoken over, the application's session stays open (VO-46).
        onStopRun={handleSpokenOver}
        onInterrupted={markInterrupted}
        onInterimChange={setVoiceInterim}
        // The menu offers when answers are heard where the application
        // lets them be (VO-21, VO-30).
        answers={Boolean(
          voice?.output && voice.output !== 'off' && voice.speechUrl,
        )}
        onSpoken={metadata => {
          spokenRef.current = metadata;
        }}
        send={(text, metadata) => void handleSend(text, undefined, metadata)}
      />
    ) : undefined;
  // Why an answer could not be heard, in a sentence, by the composer.
  const voiceRefused =
    !hostSpeaks && ownVoice.state.refused ? (
      <Text
        role="alert"
        sx={{ fontSize: 0, color: 'danger.fg', maxWidth: 260 }}
        data-voice-refused=""
      >
        {ownVoice.state.refused}
      </Text>
    ) : null;

  // The line said aloud, written as it is said: captions always (VO-65).
  const voiceSayCaption = voiceSaid ? (
    <Text
      aria-live="polite"
      sx={{
        fontSize: 0,
        fontStyle: 'italic',
        color: 'fg.muted',
        maxWidth: 260,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
      }}
      data-voice-say=""
    >
      <UnmuteIcon size={12} aria-label="Said aloud" />
      {voiceSaid}
    </Text>
  ) : null;

  const inputToolbar = showInput ? (
    <InputPrompt
      footerExtras={
        voiceRefused || voiceSayCaption ? (
          <>
            {voiceSayCaption}
            {voiceRefused}
            {voiceControl}
          </>
        ) : (
          voiceControl
        )
      }
      interim={voiceInterim}
      input={input}
      setInput={setInput}
      isLoading={isLoading}
      kernelStatus={liveKernelStatus}
      connectionConfirmed={connectionConfirmed}
      placeholder={placeholder}
      /*
        The same openers the empty state offers, typed into the box they would
        be typed into.

        `message` rather than `title`: the animation is meant to look like
        somebody typing, and what they would have typed is the message the
        chip sends, not the label on it.
      */
      typingSuggestions={resolvedSuggestions?.map(
        item => item.message || item.title,
      )}
      autoFocus={autoFocus}
      focusTrigger={focusTrigger}
      padding={padding}
      onSend={() => handleSend()}
      onStop={handleStop}
      disableInputPrompt={
        disableInputPrompt || disabled || !!overlay || launching
      }
      promptVariant={promptVariant}
      mentionableAgents={mentionableAgents}
      promptCommands={promptCommands}
      // The runtime's memory of what was sent to this agent, for the arrow
      // keys — part of the same initial state as the models and tools.
      // Without what the runtime told the application before a personal
      // agent's request (`askedOf`): the person never wrote it.
      promptHistory={configQuery.data?.promptHistory?.map(askedOf)}
      showTokenUsage={showTokenUsage}
      showContextRing={showContextRing}
      agentUsage={agentUsage}
      showModelSelector={showModelSelector}
      showToolsMenu={showToolsMenu}
      showSkillsMenu={showSkillsMenu}
      codemodeEnabled={codemodeEnabled}
      onToggleCodemode={onToggleCodemode}
      isA2AProtocol={isA2AProtocol}
      showAgentsMenu={showAgentsMenu}
      agents={footerAgents}
      selectedAgentId={selectedAgentId ?? footerAgents[0]?.id}
      onSelectAgent={onSelectAgent}
      hasConfigData={!!configQuery.data}
      hasSkillsData={!!skillsQuery.data}
      // So the bar can tell "not here yet" from "not coming": a chat whose
      // agent has no config endpoint waits for ever otherwise.
      configLoading={configQuery.isLoading}
      models={offeredModels}
      // Listed apart and read-only: a typed-decision model is never the
      // agent's model.
      decisions={
        configQuery.data
          ? {
              models: configQuery.data.decisionModels,
              note: configQuery.data.decisionsNote,
            }
          : undefined
      }
      selectedModel={selectedModel}
      onModelSelect={setSelectedModel}
      availableTools={builtinTools.runtime}
      availableFrontendTools={builtinTools.frontend}
      mcpServers={filteredMcpServers}
      enabledMcpTools={enabledMcpTools}
      enabledMcpToolCount={getEnabledMcpToolNames().length}
      onToggleMcpTool={toggleMcpTool}
      onToggleAllMcpServerTools={toggleAllMcpServerTools}
      approvedMcpTools={approvedMcpTools}
      onToggleMcpToolApproval={toggleMcpToolApproval}
      skills={skillsQuery.data?.skills || []}
      skillsLoading={!!skillsQuery.isLoading}
      enabledSkills={enabledSkills}
      onToggleSkill={toggleSkill}
      onToggleAllSkills={toggleAllSkills}
      approvedSkills={approvedSkills}
      onToggleSkillApproval={toggleSkillApproval}
      apiBase={indicatorApiBase}
      authToken={protocol?.authToken}
      mcpStatusData={effectiveMcpStatusData}
    />
  ) : null;

  // Shared header element. It is rendered either at the top of the chat (when
  // no ephemeral notebook is shown) or INSIDE the chat body column (when the
  // notebook is visible) so the header always follows the chat body across all
  // view modes (docked sidebar, floating popup, floating-small).
  //
  // Assembled as a props object first: `renderHeader` lets a host take these
  // exact props — kernel indicator, runtime status, actions, all of it — and
  // draw the bar itself. The loop's chat-header plugin is that host: the
  // header then *arrives as a plugin* without this component re-deriving any
  // of what only it knows.
  const chatHeaderProps: ChatBaseHeaderProps = {
    title,
    subtitle,
    disableReason: disabled ? disableReason : undefined,
    brandIcon,
    headerContent,
    headerActions,
    showInformation,
    /*
      A default, so the button does something.

      `showInformation` drew an (i) and then forwarded a click to whatever
      the host supplied — and a host that supplied nothing got a button that
      did nothing at all, which is worse than no button. `Chat` still passes
      its own handler and keeps its own pane; everything else gets this one.
    */
    onInformationClick: onInformationClick ?? (() => setShowDetails(true)),
    padding,
    kernelIndicatorState,
    kernelIndicatorPlacement,
    runtimeStatus: sandboxStatusData ?? sandboxStatusQuery.data,
    kernel: notebookVisible
      ? (notebookKernel ?? kernel)
      : documentVisible
        ? (documentKernel ?? kernel)
        : kernel,
    kernelEnvironmentName,
    kernelCpu,
    kernelMemory,
    kernelGpu,
    headerButtons,
    messageCount: messages.length,
    onNewChat: handleNewChat,
    onClear: handleClear,
    chatViewMode,
    onChatViewModeChange,
    disabledViewModes,
    showEphemeralSurfaceControl:
      enableEphemeralNotebook || enableEphemeralDocument,
    enableEphemeralNotebookOption: enableEphemeralNotebook,
    enableEphemeralDocumentOption: enableEphemeralDocument,
    ephemeralSurfaceMode,
    onEphemeralSurfaceModeChange: handleEphemeralSurfaceModeChange,
  };
  const chatHeaderElement = showHeader ? (
    renderHeader ? (
      renderHeader(chatHeaderProps)
    ) : (
      <ChatBaseHeader {...chatHeaderProps} />
    )
  ) : null;

  // ========================================================================
  // Render
  // ========================================================================
  return (
    <Box
      className={className}
      position="relative"
      display="flex"
      flexDirection="column"
      height="100%"
      maxHeight="100%"
      minHeight={0}
      /*
          As wide as the host, always.

          The root set its height and said nothing about width, so mounted in
          a flex row — which is how the LOOP chat mounts it — it was a
          shrink-to-fit item: as wide as its widest line and no wider,
          anchored to the left of a row it should have filled, and re-sizing
          with every streamed chunk. That is what made the person's own
          bubble drift while the agent answered. A chat fills the column it
          is given; the column decides the width, not the transcript.
        */
      flex="1 1 auto"
      width="100%"
      minWidth={0}
      bg={backgroundColor || 'canvas.default'}
      borderRadius={borderRadius}
      border={border}
      boxShadow={boxShadow}
      overflow="hidden"
    >
      {/* Header — shown at the top only when no companion surface is visible.
          When a surface (notebook/document) is visible the header is rendered
          inside the chat body column (below) so it follows the chat across
          view modes instead of staying pinned to the top. */}
      {!surfaceVisible && chatHeaderElement}

      {/*
        The agent, described. Over the transcript rather than beside it: the
        two answer different questions and a person reading one is not reading
        the other, and covering it keeps every message exactly where it was
        when they come back.
      */}
      {showDetails && (
        /*
          A column, not a row.
       
          This is a flex container holding one child, and `AgentDetails` sets a
          height but no width — so in a row it was a flex item with `flex-basis:
          auto` and no grow, which is to say it was as wide as its longest line
          of text and no wider. On the LOOP workspace, where the chat column is
          already narrow, that read as the panel occupying half the space it was
          given, with the rest of the surface blank beside it.
       
          Turning the axis makes width the *cross* axis, and a flex item
          stretches across that by default. `Chat.tsx` mounts the same component
          the same way and has always looked right for exactly this reason.
        */
        <Box
          flex="1 1 auto"
          minHeight={0}
          display="flex"
          flexDirection="column"
        >
          <ReactorLazy<React.ComponentProps<typeof AgentDetails>>
            load={loadAgentDetails}
            errorFallback={agentDetailsRefused}
            props={{
              name: title || 'AI Agent',
              icon: brandIcon,
              protocol: protocol?.type ?? 'unknown',
              url: protocol?.endpoint || '',
              messageCount: displayItems.length,
              agentId: activeAgentId,
              apiBase: protocol?.configEndpoint,
              onBack: () => setShowDetails(false),
            }}
          />
        </Box>
      )}

      {/* Tool approval banner (top-of-chat) */}
      {showToolApprovalBanner &&
        pendingApprovals &&
        pendingApprovals.length > 0 && (
          <ToolApprovalBannerSection
            pendingApprovals={pendingApprovals}
            onApprove={handleBannerApprove}
            onReject={handleBannerReject}
          />
        )}

      {/* Error banner */}
      {showErrors && error && (
        <Box
          display="flex"
          alignItems="center"
          gap={2}
          p={padding}
          bg="danger.subtle"
          borderBottom="1px solid"
          borderColor="danger.muted"
        >
          <AlertIcon size={16} />
          <Text sx={{ color: 'danger.fg', fontSize: 1 }}>{error.message}</Text>
        </Box>
      )}

      {/* Messages area */}
      {surfaceVisible ? (
        <Box
          flex={1}
          minHeight={0}
          display="flex"
          overflow="hidden"
          position="relative"
        >
          {/* Left: in-memory companion surface (notebook or document). */}
          <Box
            flex={1}
            minWidth={0}
            minHeight={0}
            display="flex"
            flexDirection="column"
            overflow="hidden"
            sx={
              surfaceChatFloating
                ? null
                : surfaceCollapsed
                  ? null
                  : {
                      borderRight: '1px solid',
                      borderColor: 'border.default',
                    }
            }
          >
            {launching || overlay ? (
              <CompanionSurfaceSkeleton
                mode={notebookVisible ? 'notebook' : 'document'}
              />
            ) : notebookVisible ? (
              <ReactorLazy<React.ComponentProps<typeof EphemeralNotebook>>
                load={loadEphemeralNotebook}
                errorFallback={ephemeralNotebookRefused}
                fallback={<CompanionSurfaceSkeleton mode="notebook" />}
                props={{
                  notebookId: ephemeralNotebookId,
                  runtimeName: runtimeId || activeAgentId,
                  runtimeOverride: ephemeralRuntimeOverride,
                  themeVariant,
                  colorMode,
                  nbformat: persistedEphemeralNbformat ?? undefined,
                  onNbformatChange: handleEphemeralNotebookChange,
                  toolbarComponent: ephemeralNotebookToolbar,
                  toolbarExtraItems: notebookToolbarItems,
                  collaborationProvider: ephemeralNotebookCollaborationProvider,
                }}
              />
            ) : (
              <React.Suspense fallback={null}>
                <EphemeralDocument
                  documentId={ephemeralDocumentId}
                  runtimeName={runtimeId || activeAgentId}
                  runtimeOverride={ephemeralRuntimeOverride}
                  themeVariant={themeVariant}
                  colorMode={colorMode}
                  content={persistedEphemeralDocument ?? undefined}
                  onContentChange={handleEphemeralDocumentChange}
                  onToolsReady={handleDocumentToolsReady}
                  onKernelChange={handleDocumentKernelChange}
                  collaboration={ephemeralDocumentCollaboration}
                  toolbarExtraItems={documentToolbarItems}
                />
              </React.Suspense>
            )}
          </Box>

          {/* Right: chat — docked as a sidebar, or floating over the surface
              depending on the selected chat view mode. */}
          {!surfaceCollapsed && (
            <Box
              sx={
                surfaceChatFloating
                  ? {
                      position: 'absolute',
                      right: 16,
                      width: compactFloating ? 360 : 440,
                      maxWidth: 'calc(100% - 32px)',
                      ...(compactFloating
                        ? { bottom: 16, height: '62%' }
                        : { top: 16, bottom: 16 }),
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      overflow: 'hidden',
                      bg: 'canvas.default',
                      border: '1px solid',
                      borderColor: 'border.default',
                      borderRadius: 2,
                      boxShadow: 'shadow.large',
                      zIndex: 5,
                    }
                  : {
                      flexShrink: 0,
                      width: 440,
                      minWidth: 320,
                      maxWidth: '48%',
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      bg: 'canvas.default',
                    }
              }
            >
              {/* Header lives inside the chat column when a companion surface
                  is shown so it follows the chat body across all view modes. */}
              {chatHeaderElement}
              <Box
                ref={messagesContainerRef}
                flex={1}
                minHeight={0}
                overflow="auto"
                bg="canvas.default"
              >
                {messagesContent}
              </Box>
              {footerContent}
              {inputToolbar}
            </Box>
          )}

          {surfaceCollapsed &&
            onExpandFromCollapsed &&
            (chatViewMode === 'sidebar' ? (
              <Box position="absolute" top={8} right={8} zIndex={6}>
                <IconButton
                  icon={SidebarExpandIcon}
                  aria-label="Open chat"
                  onClick={onExpandFromCollapsed}
                  variant="default"
                  size="small"
                />
              </Box>
            ) : (
              <FloatingBrandButton
                isOpen={false}
                onToggle={onExpandFromCollapsed}
                position="bottom-right"
                tooltip="Open chat"
              />
            ))}
        </Box>
      ) : (
        <>
          <Box
            ref={messagesContainerRef}
            data-chat-history=""
            flex={1}
            flexGrow={1}
            minHeight={0}
            overflow="auto"
            bg="canvas.default"
          >
            {messagesContent}
          </Box>

          {/* Footer content */}
          {footerContent}

          {/* Input */}
          {inputToolbar}
        </>
      )}

      {/* Powered by tag */}
      {showPoweredBy && <PoweredByTag {...poweredByProps} />}

      {/* Overlay (e.g. sign-in gate for anonymous users). Rendered above the
          chat surface with a translucent backdrop so the (disabled) chat
          header, controls, and input stay visible behind it. The input and
          selectors are force-disabled while an overlay is set. */}
      {overlay && (
        <Box
          position="absolute"
          inset={0}
          zIndex={20}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={3}
          overflow="auto"
        >
          {/* Translucent dim layer (kept separate so the card stays opaque). */}
          <Box
            aria-hidden
            position="absolute"
            inset={0}
            bg="canvas.default"
            opacity={0.4}
            backdropFilter="blur(1px)"
          />
          {/* Foreground gate content (opaque, above the dim layer). */}
          <Box position="relative" zIndex={1} maxWidth="100%">
            {overlay}
          </Box>
        </Box>
      )}

      {/* Launching overlay — shown while the agent runtime is still starting.
          Keeps the plain chat shell visible (header, disabled input, disabled
          controls) with a centered spinner so the view appears immediately
          when the agent begins to be created. The companion surface renders its
          own inline skeletons underneath. */}
      {launching && !overlay && (
        <Box
          position="absolute"
          inset={0}
          zIndex={15}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={3}
        >
          <Box
            aria-hidden
            position="absolute"
            inset={0}
            bg="canvas.default"
            opacity={0.35}
            backdropFilter="blur(1px)"
          />
          <Box
            position="relative"
            zIndex={1}
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={3}
          >
            <Spinner size="large" />
            <Text sx={{ color: 'fg.muted' }}>
              {launchingMessage || 'Launching your agent…'}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Internal component rendering the top-of-chat approval banner + review dialog.
 * Extracted so we can keep `ChatBase` focused on chat flow while still owning
 * the banner UX via the `showToolApprovalBanner` prop.
 */
function ToolApprovalBannerSection({
  pendingApprovals,
  onApprove,
  onReject,
}: {
  pendingApprovals: PendingApproval[];
  onApprove?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;
  onReject?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;
}) {
  const [activeApproval, setActiveApproval] = useState<PendingApproval | null>(
    null,
  );

  // Keep the active approval in sync with the incoming list; if the active
  // one is no longer pending (resolved), dismiss the dialog.
  useEffect(() => {
    if (!activeApproval) {
      return;
    }
    if (!pendingApprovals.some(a => a.id === activeApproval.id)) {
      setActiveApproval(null);
    }
  }, [pendingApprovals, activeApproval]);

  return (
    <>
      <ToolApprovalBanner
        pendingApprovals={pendingApprovals}
        onReview={approval => setActiveApproval(approval)}
        onApproveAll={async () => {
          if (!onApprove) return;
          for (const approval of pendingApprovals) {
            await onApprove(approval.id);
          }
        }}
      />

      <ToolApprovalDialog
        isOpen={!!activeApproval}
        toolName={activeApproval?.toolName ?? ''}
        toolDescription={activeApproval?.toolDescription}
        args={activeApproval?.args ?? {}}
        onApprove={async () => {
          if (!activeApproval || !onApprove) {
            setActiveApproval(null);
            return;
          }
          const result = await onApprove(activeApproval.id);
          if (result !== false) {
            setActiveApproval(null);
          }
        }}
        onDeny={async () => {
          if (!activeApproval || !onReject) {
            setActiveApproval(null);
            return;
          }
          const result = await onReject(
            activeApproval.id,
            'Rejected from tool approval dialog',
          );
          if (result !== false) {
            setActiveApproval(null);
          }
        }}
        onClose={() => setActiveApproval(null)}
      />
    </>
  );
}

export default ChatBase;
