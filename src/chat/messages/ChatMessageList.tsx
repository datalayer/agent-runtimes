/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MessageList — Renders the scrollable list of chat messages, tool calls,
 * and the typing indicator.
 *
 * @module chat/messages/MessageList
 */

import {
  type ReactNode,
  type RefObject,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Text, Spinner } from '@primer/react';
import { DependabotIcon, PersonIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { Streamdown } from 'streamdown';
import {
  streamdownMarkdownStyles,
  streamdownCodeBlockStyles,
} from '../styles/streamdownStyles';
import { ToolCallDisplay } from '../tools/ToolCallDisplay';

import { isToolCallMessage, getMessageText } from '../../utils';
import {
  useAgentRuntimeStore,
  useAgentRuntimeSubagentActivityByToolCall,
  agentRuntimeStore,
} from '../../stores/agentRuntimeStore';
import type {
  DisplayItem,
  ToolCallMessage,
  AvatarConfig,
  RenderToolResult,
  RespondCallback,
} from '../../types/chat';
import type { ChatMessage } from '../../types/messages';
import type { AgentStreamSubagentPayload } from '../../types/stream';

// ---------------------------------------------------------------------------
// Tool Approval Config (kept for backward compat — no longer used for REST)
// ---------------------------------------------------------------------------

export interface ToolApprovalConfig {
  /** Base API URL for the agent runtime (e.g., `http://localhost:8765/api/v1`). */
  apiBaseUrl: string;
  /** Auth token for API calls */
  authToken?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatMessageListProps {
  /** All display items (messages + tool calls) */
  displayItems: DisplayItem[];
  /** Whether the agent is loading */
  isLoading: boolean;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Show the pulsing-dot typing indicator */
  showLoadingIndicator: boolean;
  /** Hide assistant messages that follow a rendered tool call UI */
  hideMessagesAfterToolUI: boolean;
  /** Resolved avatar configuration */
  avatarConfig: Required<
    Pick<
      AvatarConfig,
      | 'userAvatar'
      | 'assistantAvatar'
      | 'showAvatars'
      | 'avatarSize'
      | 'userAvatarBg'
      | 'assistantAvatarBg'
    >
  >;
  /** Layout padding */
  padding: number;
  /** Optional custom tool-result renderer */
  renderToolResult?: RenderToolResult;
  /** Content to render when there are no messages */
  emptyContent: ReactNode;
  /** Ref attached to the sentinel div at the bottom for auto-scrolling */
  messagesEndRef: RefObject<HTMLDivElement>;
  /**
   * Callback for human-in-the-loop tool responses.
   * Called when the user responds to an 'executing' tool.
   */
  onRespond: (toolCallId: string, result: unknown) => Promise<void>;
  /**
   * Approval config for built-in tool approval support.
   * When provided, the default tool call rendering detects `pending_approval`
   * results and shows approve/deny buttons that call the agent-runtimes
   * approval API.
   */
  approvalConfig?: ToolApprovalConfig;
}

// ---------------------------------------------------------------------------
// Normalize helper
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .replace(/:[0-9]+\.[0-9]+\.[0-9]+.*$/, '')
    .replace(/[-_]/g, '')
    .toLowerCase();
}

/**
 * Expand a single-line markdown table (rows joined with `||`) into one row
 * per line so a markdown renderer can produce a real HTML table. Idempotent:
 * any pre-existing `|\n|` boundaries are unaffected.
 */
function expandCompactMarkdownTableBody(body: string): string {
  if (!body) return body;
  if (!/\|\s*[-:| ]{3,}\|/.test(body)) return body;
  if (!body.includes('||')) return body;
  return body.replace(/\|\|/g, '|\n|');
}

/**
 * Pre-process assistant text for Streamdown:
 *  - Unwrap ```markdown / ```md fenced blocks so tables render as HTML
 *    instead of as a code block.
 *  - Inside any fenced block (or top-level body), expand compact one-line
 *    markdown tables.
 */
function normalizeAssistantMarkdown(text: string): string {
  if (!text) return text;

  // Unwrap explicit ```markdown / ```md fences and expand compact tables.
  let out = text.replace(
    /```(markdown|md)\s*\n([\s\S]*?)```/gi,
    (_match, _lang, body: string) => {
      const expanded = expandCompactMarkdownTableBody(body.trim());
      return `\n\n${expanded}\n\n`;
    },
  );

  // Also expand compact tables inside other fenced blocks that happen to
  // carry a markdown table (e.g. bare ``` fences).
  out = out.replace(
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g,
    (match, lang: string, body: string) => {
      const expanded = expandCompactMarkdownTableBody(body);
      if (expanded === body) return match;
      // If we expanded an unlabeled fence containing a real markdown table,
      // unwrap it so it renders as a table.
      if (!lang || /^(text|plain)$/i.test(lang)) {
        return `\n\n${expanded.trim()}\n\n`;
      }
      return `\`\`\`${lang}\n${expanded}\`\`\``;
    },
  );

  return out;
}

// ---------------------------------------------------------------------------
// SubagentChatPanel — renders a delegated subagent's live run using the same
// message rendering as the main chat (markdown, tool cards, approvals), inside
// a fixed-height scrollable viewport.
// ---------------------------------------------------------------------------

type SubagentAvatarConfig = Required<
  Pick<
    AvatarConfig,
    | 'userAvatar'
    | 'assistantAvatar'
    | 'showAvatars'
    | 'avatarSize'
    | 'userAvatarBg'
    | 'assistantAvatarBg'
  >
>;

const SUBAGENT_AVATAR_CONFIG: SubagentAvatarConfig = {
  userAvatar: <PersonIcon size={14} />,
  assistantAvatar: <DependabotIcon size={14} />,
  showAvatars: true,
  avatarSize: 24,
  userAvatarBg: 'neutral.muted',
  assistantAvatarBg: 'accent.emphasis',
};

/**
 * Convert streamed subagent activity into the `DisplayItem[]` shape the main
 * chat renders: text deltas merge into markdown messages, and tool events pair
 * into tool-call cards (with approval controls when the runtime requests one).
 * Reasoning (`thinking`) is omitted to mirror the primary agent view.
 */
function buildSubagentDisplayItems(
  events: readonly AgentStreamSubagentPayload[],
  keyPrefix: string,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  const openByName = new Map<string, ToolCallMessage>();
  let textBuffer = '';
  let seq = 0;

  const flushText = () => {
    if (textBuffer.trim()) {
      items.push({
        id: `${keyPrefix}:msg:${seq++}`,
        role: 'assistant',
        content: textBuffer,
        createdAt: new Date(0),
      } as ChatMessage);
    }
    textBuffer = '';
  };

  for (const event of events) {
    switch (event.phase) {
      case 'text':
        textBuffer += event.text ?? '';
        break;
      case 'tool_call': {
        flushText();
        const id = `${keyPrefix}:tool:${seq++}`;
        const toolCall: ToolCallMessage = {
          id,
          type: 'tool-call',
          toolCallId: id,
          toolName: event.toolName ?? 'tool',
          args: event.toolArgs ?? {},
          status: 'inProgress',
        };
        items.push(toolCall);
        if (event.toolName) {
          openByName.set(event.toolName, toolCall);
        }
        break;
      }
      case 'tool_result': {
        flushText();
        const open = event.toolName
          ? openByName.get(event.toolName)
          : undefined;
        if (open) {
          open.result = event.result;
          open.status = 'complete';
          if (event.toolName) {
            openByName.delete(event.toolName);
          }
        } else {
          const id = `${keyPrefix}:tool:${seq++}`;
          items.push({
            id,
            type: 'tool-call',
            toolCallId: id,
            toolName: event.toolName ?? 'tool',
            args: {},
            result: event.result,
            status: 'complete',
          } as ToolCallMessage);
        }
        break;
      }
      case 'error':
        flushText();
        items.push({
          id: `${keyPrefix}:msg:${seq++}`,
          role: 'assistant',
          content: `**\u26a0\ufe0f ${event.error ?? 'Subagent failed'}**`,
          createdAt: new Date(0),
        } as ChatMessage);
        break;
      // `start`, `thinking`, and `end` do not produce display items.
      default:
        break;
    }
  }
  flushText();
  return items;
}

export interface SubagentChatPanelProps {
  /** Parent `delegate_task` tool call id used to look up streamed events. */
  toolCallId: string;
  /** Subagent name used as a fallback when the tool-call id does not match. */
  subagentName?: string;
  /** Fixed viewport height in pixels. */
  height?: number;
  /** Avatar configuration for the embedded message list. */
  avatarConfig?: SubagentAvatarConfig;
}

/**
 * Fixed-height, chat-style viewport for a single delegated subagent run.
 * Reuses {@link ChatMessageList} so subagent output is formatted exactly like
 * the primary agent, including tool-call cards and inline approvals. Tool
 * approval decisions are sent over the shared monitoring socket.
 */
export function SubagentChatPanel({
  toolCallId,
  subagentName: subagentNameHint,
  height = 280,
  avatarConfig = SUBAGENT_AVATAR_CONFIG,
}: SubagentChatPanelProps): React.ReactElement | null {
  const events = useAgentRuntimeSubagentActivityByToolCall(
    toolCallId,
    subagentNameHint,
  );
  const displayItems = useMemo(
    () => buildSubagentDisplayItems(events, toolCallId),
    [events, toolCallId],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const subagentName = useMemo(() => {
    for (const event of events) {
      if (event.subagentName) return event.subagentName;
    }
    return subagentNameHint ?? 'subagent';
  }, [events, subagentNameHint]);
  const isDone = useMemo(
    () => events.some(e => e.phase === 'end' || e.phase === 'error'),
    [events],
  );
  const hasError = useMemo(
    () => events.some(e => e.phase === 'error'),
    [events],
  );

  // Forward inline tool-approval decisions to the shared monitoring socket.
  const handleRespond = useCallback(
    async (_toolCallId: string, result: unknown) => {
      if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        if (
          record.type === 'tool-approval-decision' &&
          typeof record.approved === 'boolean' &&
          typeof record.approvalId === 'string'
        ) {
          agentRuntimeStore
            .getState()
            .sendDecision(record.approvalId, record.approved);
        }
      }
    },
    [],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [displayItems]);

  if (events.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        mt: 2,
        display: 'flex',
        flexDirection: 'column',
        height,
        width: '100%',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
        bg: 'canvas.default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'border.muted',
          bg: 'canvas.subtle',
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            color: hasError ? 'danger.fg' : isDone ? 'success.fg' : 'accent.fg',
          }}
        >
          <DependabotIcon size={14} />
        </Box>
        <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.default' }}>
          {subagentName}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}>
          {hasError ? 'failed' : isDone ? 'done' : 'working\u2026'}
        </Text>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <ChatMessageList
          displayItems={displayItems}
          isLoading={!isDone}
          isStreaming={!isDone}
          showLoadingIndicator={!isDone}
          hideMessagesAfterToolUI={false}
          avatarConfig={avatarConfig}
          padding={2}
          onRespond={handleRespond}
          messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
          emptyContent={
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: 'fg.muted',
                p: 2,
              }}
            >
              <Spinner size="small" />
              <Text sx={{ fontSize: 0 }}>Starting…</Text>
            </Box>
          }
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// DefaultToolCallRenderer — reads approvals from the Zustand store,
// sends decisions over the shared WebSocket (no REST polling).
// ---------------------------------------------------------------------------

function DefaultToolCallRenderer({
  item,
  onRespond,
}: {
  item: ToolCallMessage;
  approvalConfig?: ToolApprovalConfig;
  onRespond: RespondCallback;
}) {
  const resultObject =
    item.result && typeof item.result === 'object'
      ? (item.result as Record<string, unknown>)
      : undefined;

  // Detect pending approval from tool result (pydantic-deferred mode)
  const isPendingFromResult =
    item.status === 'inProgress' && resultObject?.pending_approval === true;

  // Extract the approval_id carried in the tool result by the adapter.
  // This is always available when the SSE stream contained a
  // `tool-approval-request` event, even when the Zustand store has not been
  // populated (e.g. no monitoring WS open).
  const resultApprovalId =
    typeof resultObject?.approval_id === 'string'
      ? resultObject.approval_id
      : undefined;

  // In ai-agents-wrapper mode, the server blocks waiting for approval and
  // never sends a tool-result with pending_approval. The tool stays in
  // 'executing' status.
  const isExecuting = item.status === 'executing';

  const [decision, setDecision] = useState<'approved' | 'denied' | undefined>();

  const normalizedToolName = useMemo(
    () => normalizeName(item.toolName),
    [item.toolName],
  );

  // Skill tools (`run_skill_script`, `load_skill`, `read_skill_resource`) are
  // gated by the server under a synthetic approval ``tool_name`` of the form
  // ``skill:<skill_id>`` (see ``SkillsGuardrailCapability._request_skill_approval``).
  // Capture the skill id carried in the tool-call arguments so we can match
  // the inline approval button against that synthetic approval entry.
  const skillApprovalKey = useMemo(() => {
    const SKILL_TOOLS = new Set([
      'run_skill_script',
      'load_skill',
      'read_skill_resource',
    ]);
    if (!SKILL_TOOLS.has(item.toolName)) return null;
    const a = (item.args ?? {}) as Record<string, unknown>;
    const raw = a.skill_name ?? a.skill ?? a.name;
    if (typeof raw !== 'string' || raw.length === 0) return null;
    // Strip optional ``<name>:<version>`` suffix to the base skill id.
    const base = raw.split(':', 1)[0] || raw;
    return `skill:${base}`.toLowerCase();
  }, [item.toolName, item.args]);

  // Read pending approvals from the Zustand store (fed by the agent-runtime WS).
  const approvals = useAgentRuntimeStore(s => s.approvals);

  // Prefer an exact match by approval id (when present in SSE tool result).
  const matchedByResultId = useMemo(() => {
    if (!resultApprovalId) return null;
    return approvals.find(a => a.id === resultApprovalId) ?? null;
  }, [approvals, resultApprovalId]);

  // Match the synthetic ``skill:<id>`` approval for skill tool calls.  This
  // runs whenever the tool call is a skill tool so the inline Approve/Deny
  // buttons surface even when the server is blocked in
  // ``ToolApprovalManager.request_and_wait`` (status stays ``executing`` and
  // no ``pending_approval=True`` result is ever emitted).
  const matchedBySkill = useMemo(() => {
    if (!skillApprovalKey) return null;
    return (
      approvals.find(a => a.tool_name?.toLowerCase() === skillApprovalKey) ??
      null
    );
  }, [approvals, skillApprovalKey]);

  // Fallback to matching by tool name for inline approval flows that don't
  // always provide approval_id in the tool result payload.
  const matchedByName = useMemo(() => {
    if (!isPendingFromResult && !isExecuting) return null;
    return (
      approvals.find(a => normalizeName(a.tool_name) === normalizedToolName) ??
      null
    );
  }, [approvals, normalizedToolName, isPendingFromResult, isExecuting]);

  const matchedApproval = matchedByResultId ?? matchedBySkill ?? matchedByName;

  // Prefer the store-matched approval id, fall back to the id from the tool
  // result (SSE path). This ensures the approve/deny buttons work even when
  // the monitoring WS is not connected.
  const effectiveApprovalId = matchedApproval?.id ?? resultApprovalId ?? null;

  // Reflect approval decisions that happened outside this card (e.g. sidebar).
  const externalDecision: 'approved' | 'denied' | undefined =
    matchedApproval?.status === 'approved'
      ? 'approved'
      : matchedApproval?.status === 'rejected'
        ? 'denied'
        : undefined;

  const makeDecision = useCallback(
    (action: 'approve' | 'reject') => {
      if (!effectiveApprovalId) return;
      const approved = action === 'approve';
      // Use ONLY the adapter continuation path (SSE/POST). Sending both WS and
      // continuation decisions can trigger duplicate approval cycles.
      setDecision(approved ? 'approved' : 'denied');
      onRespond({
        type: 'tool-approval-decision',
        approved,
        approvalId: effectiveApprovalId,
        toolName: item.toolName,
      });
    },
    [effectiveApprovalId, onRespond, item.toolName],
  );

  // Show approval UI when we have a confirmed pending approval (from result
  // or discovered via the store) or after a decision has been made.
  const hasApproval =
    isPendingFromResult || !!effectiveApprovalId || !!externalDecision;

  const approvalState: 'pending' | 'approved' | 'denied' | undefined =
    decision || externalDecision || (hasApproval ? 'pending' : undefined);

  const approvalDecisionSource: 'inline' | 'external' | undefined = decision
    ? 'inline'
    : externalDecision
      ? 'external'
      : undefined;

  // `normalizeName` strips underscores, so compare against the normalized form.
  const isSubagentDelegation = normalizedToolName === 'delegatetask';
  const delegatedSubagentName =
    typeof item.args?.subagent_name === 'string'
      ? item.args.subagent_name
      : undefined;

  return (
    <>
      <ToolCallDisplay
        toolCallId={item.toolCallId}
        toolName={item.toolName}
        args={item.args}
        result={item.result}
        status={item.status}
        error={item.error}
        executionError={item.executionError}
        codeError={item.codeError}
        exitCode={item.exitCode}
        approvalRequired={hasApproval}
        approvalState={approvalState}
        approvalDecisionSource={approvalDecisionSource}
        onApprove={
          effectiveApprovalId && !decision && !externalDecision
            ? () => makeDecision('approve')
            : undefined
        }
        onDeny={
          effectiveApprovalId && !decision && !externalDecision
            ? () => makeDecision('reject')
            : undefined
        }
        approvalLoading={false}
      />
      {isSubagentDelegation && (
        <SubagentChatPanel
          toolCallId={item.toolCallId}
          subagentName={delegatedSubagentName}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatMessageList({
  displayItems,
  isLoading,
  isStreaming,
  showLoadingIndicator,
  hideMessagesAfterToolUI,
  avatarConfig,
  padding,
  renderToolResult,
  emptyContent,
  messagesEndRef,
  onRespond,
  approvalConfig,
}: ChatMessageListProps) {
  if (displayItems.length === 0) {
    return <>{emptyContent}</>;
  }

  // Create respond callback for a tool call (human-in-the-loop)
  const createRespondCallback = (toolCallId: string): RespondCallback => {
    return (result: unknown) => {
      onRespond(toolCallId, result);
    };
  };

  // Build set of rendered tool call IDs to support hideMessagesAfterToolUI
  const renderedToolCallIds = new Set<string>();
  displayItems.forEach(item => {
    if (isToolCallMessage(item)) {
      if (renderToolResult) {
        const rendered = renderToolResult({
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          name: item.toolName,
          args: item.args,
          result: item.result,
          status: item.status,
          error: item.error,
          // Only tested for null-ness here, so the node itself is not built.
          defaultUI: null,
        });
        if (rendered !== null && rendered !== undefined) {
          renderedToolCallIds.add(item.toolCallId);
        }
      } else {
        // Default display always renders tool calls
        renderedToolCallIds.add(item.toolCallId);
      }
    }
  });
  const hasRenderedToolCall = renderedToolCallIds.size > 0;

  return (
    <>
      {displayItems.map((item, index) => {
        // ---- Tool call item ----
        if (isToolCallMessage(item)) {
          const respond =
            item.status === 'executing' || item.status === 'inProgress'
              ? createRespondCallback(item.toolCallId)
              : undefined;

          /*
            The row the chat would draw by itself, handed to the caller.

            `renderToolResult` replaces this outright, which is right for a
            caller substituting a custom card and wrong for one that only
            wants to add something beneath the row — that caller previously
            had to reimplement it, and returning nothing for the tools it did
            not care about hid those tools entirely. Offering the default as a
            node lets it compose instead of choosing.
          */
          const defaultUI = (
            <DefaultToolCallRenderer
              item={item}
              approvalConfig={approvalConfig}
              onRespond={createRespondCallback(item.toolCallId)}
            />
          );

          const toolUI = renderToolResult
            ? renderToolResult({
                toolCallId: item.toolCallId,
                toolName: item.toolName,
                name: item.toolName,
                args: item.args,
                result: item.result,
                status: item.status,
                error: item.error,
                respond,
                defaultUI,
              })
            : defaultUI;

          if (toolUI === null || toolUI === undefined) return null;

          return (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                maxWidth: '95%',
                px: padding,
                py: 1,
              }}
            >
              {toolUI}
            </Box>
          );
        }

        // ---- Chat message item ----
        const message = item as ChatMessage;
        const isUser = message.role === 'user';

        // Optionally hide assistant messages that follow a rendered tool call
        if (!isUser && hideMessagesAfterToolUI && hasRenderedToolCall) {
          const messageText = getMessageText(message);

          const prevIndex = index - 1;
          if (prevIndex >= 0) {
            const prevItem = displayItems[prevIndex];
            if (
              isToolCallMessage(prevItem) &&
              renderedToolCallIds.has(prevItem.toolCallId)
            ) {
              return null;
            }
          }

          // Check for HITL-specific patterns
          const hitlToolCall = displayItems.find(
            di =>
              isToolCallMessage(di) &&
              renderedToolCallIds.has(di.toolCallId) &&
              di.args &&
              'steps' in di.args &&
              Array.isArray(di.args.steps),
          ) as ToolCallMessage | undefined;

          if (hitlToolCall && messageText) {
            const steps = hitlToolCall.args.steps as Array<{
              description?: string;
            }>;
            const hasStepContent =
              steps.some(
                step =>
                  step.description &&
                  messageText
                    .toLowerCase()
                    .includes(step.description.toLowerCase().slice(0, 20)),
              ) ||
              /^\s*(\d+\.\s|[-*]\s|\*\*)/.test(messageText) ||
              messageText.includes('**Enabled**') ||
              messageText.includes('steps below');

            if (hasStepContent) {
              return null;
            }
          }
        }

        return (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              px: padding,
              py: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                /*
                  Full width, always.

                  This row used to shrink to its content under the column's
                  alignment, so the bubble's `maxWidth: '85%'` resolved
                  against a parent whose width was itself the content's —
                  circular geometry that re-settled with every streamed
                  chunk, and the person's own message drifted leftward while
                  the agent was answering. A full-width row is fixed ground:
                  `row-reverse` pins the person's bubble to the right edge,
                  `row` pins the agent's to the left, and 85% means 85% of
                  the column whatever is being generated below.
                */
                width: '100%',
              }}
            >
              {/* Avatar */}
              {avatarConfig.showAvatars && (
                <Box
                  sx={{
                    width: avatarConfig.avatarSize,
                    height: avatarConfig.avatarSize,
                    borderRadius: '50%',
                    bg: isUser
                      ? avatarConfig.userAvatarBg
                      : avatarConfig.assistantAvatarBg,
                    color: isUser
                      ? 'fg.default'
                      : 'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isUser
                    ? avatarConfig.userAvatar
                    : avatarConfig.assistantAvatar}
                </Box>
              )}

              {/* Message bubble */}
              <Box
                sx={{
                  maxWidth: '85%',
                  p: 2,
                  overflowX: 'auto',
                  borderRadius: 2,
                  backgroundColor: isUser ? 'accent.emphasis' : 'canvas.subtle',
                  // Use primary-button text token for better contrast when
                  // accent.emphasis is bright (e.g. Matrix dark theme).
                  color: isUser
                    ? 'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))'
                    : 'fg.default',
                  ...streamdownCodeBlockStyles,
                }}
              >
                {isUser ? (
                  <Text
                    sx={{
                      fontSize: 1,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {getMessageText(message)}
                  </Text>
                ) : (
                  <Box sx={streamdownMarkdownStyles}>
                    <Streamdown>
                      {normalizeAssistantMarkdown(
                        getMessageText(message) || (isStreaming ? '...' : ''),
                      )}
                    </Streamdown>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}

      {/* Typing indicator cursor — shows when waiting for response */}
      {showLoadingIndicator && (isLoading || isStreaming) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            px: padding,
            py: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'flex-start',
            }}
          >
            {/* Avatar */}
            {avatarConfig.showAvatars && (
              <Box
                sx={{
                  width: avatarConfig.avatarSize,
                  height: avatarConfig.avatarSize,
                  borderRadius: '50%',
                  bg: avatarConfig.assistantAvatarBg,
                  color:
                    'var(--button-primary-fgColor-rest, var(--fgColor-onEmphasis))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {avatarConfig.assistantAvatar}
              </Box>
            )}
            {/* Pulsing cursor dots */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                p: 2,
                borderRadius: 2,
                bg: 'canvas.subtle',
                minHeight: '32px',
              }}
            >
              {[0, 0.2, 0.4].map((delay, i) => (
                <Box
                  key={i}
                  sx={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    bg: 'fg.muted',
                    animation: 'typingPulse 1.4s ease-in-out infinite',
                    animationDelay: `${delay}s`,
                    '@keyframes typingPulse': {
                      '0%, 60%, 100%': {
                        transform: 'scale(0.6)',
                        opacity: 0.4,
                      },
                      '30%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}
      <div ref={messagesEndRef} />
    </>
  );
}
