// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * ContextInspector component - Shows detailed context snapshot with full tool schemas,
 * message history with in_context flags, and model configuration.
 */

import { Text, Spinner, Button, Label, ProgressBar } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  AiModelIcon,
  TerminalIcon,
  CommentDiscussionIcon,
  DatabaseIcon,
  KeyIcon,
  CodeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
} from '@primer/octicons-react';
import { useQuery } from '@tanstack/react-query';
import React, { useState, useMemo } from 'react';

/**
 * Tool detail from API
 */
interface ToolDetail {
  name: string;
  description: string | null;
  parametersSchema: Record<string, unknown>;
  parametersTokens: number;
  totalTokens: number;
  sourceType: string;
  isAsync: boolean;
  requiresApproval: boolean;
  sourceCode: string | null;
}

/**
 * Message detail from API
 */
interface MessageDetail {
  role: string;
  content: string;
  estimatedTokens: number;
  timestamp: string | null;
  inContext: boolean;
  toolName: string | null;
  toolCallId: string | null;
  isToolCall: boolean;
  isToolResult: boolean;
}

/**
 * System prompt from API
 */
interface SystemPrompt {
  content: string;
  tokens: number;
}

/**
 * Token summary from API
 */
interface TokenSummary {
  systemPrompts: number;
  tools: number;
  memory: number;
  history: number;
  current: number;
  total: number;
  contextWindow: number;
  usagePercent: number;
}

/**
 * Full context response from API
 */
export interface FullContextResponse {
  agentId: string;
  modelConfiguration: {
    modelName: string | null;
    contextWindow: number;
    settings: Record<string, unknown>;
  };
  systemPrompts: SystemPrompt[];
  systemPromptTokens: number;
  tools: ToolDetail[];
  toolTokens: number;
  messages: MessageDetail[];
  memoryBlocks: Record<string, unknown>[];
  memoryTokens: number;
  toolEnvironment: Record<string, string>;
  toolRules: Record<string, unknown>[];
  tokenSummary: TokenSummary;
  error?: string;
}

/**
 * Get the API base URL for fetching context data.
 * If apiBase prop is provided, use it.
 * Otherwise, fall back to localhost for local development.
 */
function getApiBase(apiBase?: string): string {
  if (apiBase) {
    return apiBase;
  }
  if (typeof window === 'undefined') {
    return '';
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://127.0.0.1:8765'
    : '';
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export interface ContextInspectorProps {
  /** Agent ID for fetching full context */
  agentId: string;
  /** API base URL for fetching context data */
  apiBase?: string;
}

/**
 * Collapsible section component
 */
function CollapsibleSection({
  title,
  icon,
  count,
  tokens,
  defaultExpanded = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  tokens?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        as="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          width: '100%',
          p: 2,
          bg: 'canvas.subtle',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          cursor: 'pointer',
          '&:hover': {
            bg: 'canvas.inset',
          },
        }}
      >
        {expanded ? (
          <ChevronDownIcon size={16} />
        ) : (
          <ChevronRightIcon size={16} />
        )}
        {React.createElement(icon, { size: 16 })}
        <Text sx={{ fontWeight: 'semibold', flex: 1, textAlign: 'left' }}>
          {title}
        </Text>
        {count !== undefined && (
          <Label variant="secondary" size="small">
            {count}
          </Label>
        )}
        {tokens !== undefined && tokens > 0 && (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {formatTokens(tokens)} tokens
          </Text>
        )}
      </Box>
      {expanded && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            p: 2,
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}

/**
 * Tool detail view component
 */
function ToolDetailView({ tool }: { tool: ToolDetail }) {
  const [showSchema, setShowSchema] = useState(false);
  const [showSource, setShowSource] = useState(false);

  return (
    <Box
      sx={{
        p: 2,
        mb: 2,
        bg: 'canvas.default',
        border: '1px solid',
        borderColor: 'border.muted',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Text sx={{ fontWeight: 'bold', fontFamily: 'mono', fontSize: 1 }}>
          {tool.name}
        </Text>
        <Label size="small" variant="secondary">
          {tool.sourceType}
        </Label>
        {tool.isAsync && (
          <Label size="small" variant="accent">
            async
          </Label>
        )}
        {tool.requiresApproval && (
          <Label size="small" variant="attention">
            requires approval
          </Label>
        )}
        <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}>
          {formatTokens(tool.totalTokens)} tokens
        </Text>
      </Box>

      {tool.description && (
        <Text sx={{ fontSize: 1, color: 'fg.muted', display: 'block', mb: 2 }}>
          {tool.description}
        </Text>
      )}

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          size="small"
          variant="invisible"
          onClick={() => setShowSchema(!showSchema)}
        >
          {showSchema ? 'Hide' : 'Show'} Schema
        </Button>
        {tool.sourceCode && (
          <Button
            size="small"
            variant="invisible"
            onClick={() => setShowSource(!showSource)}
          >
            {showSource ? 'Hide' : 'Show'} Source
          </Button>
        )}
      </Box>

      {showSchema && (
        <Box
          as="pre"
          sx={{
            mt: 2,
            p: 2,
            bg: 'canvas.inset',
            borderRadius: 2,
            fontSize: 0,
            overflow: 'auto',
            maxHeight: 200,
          }}
        >
          {JSON.stringify(tool.parametersSchema, null, 2)}
        </Box>
      )}

      {showSource && tool.sourceCode && (
        <Box
          as="pre"
          sx={{
            mt: 2,
            p: 2,
            bg: 'canvas.inset',
            borderRadius: 2,
            fontSize: 0,
            overflow: 'auto',
            maxHeight: 300,
          }}
        >
          {tool.sourceCode}
        </Box>
      )}
    </Box>
  );
}

/**
 * Message detail view component
 */
function MessageDetailView({ message }: { message: MessageDetail }) {
  const roleColors: Record<string, string> = {
    user: 'accent.fg',
    assistant: 'success.fg',
    system: 'attention.fg',
    tool: 'done.fg',
  };

  const roleIcons: Record<string, React.ElementType> = {
    user: CommentDiscussionIcon,
    assistant: AiModelIcon,
    system: InfoIcon,
    tool: TerminalIcon,
  };

  const RoleIcon = roleIcons[message.role] || CommentDiscussionIcon;

  return (
    <Box
      sx={{
        p: 2,
        mb: 1,
        bg: message.inContext ? 'canvas.default' : 'canvas.inset',
        border: '1px solid',
        borderColor: message.inContext ? 'border.default' : 'border.muted',
        borderRadius: 2,
        opacity: message.inContext ? 1 : 0.7,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <RoleIcon size={14} />
        <Text
          sx={{
            fontWeight: 'semibold',
            fontSize: 0,
            color: roleColors[message.role] || 'fg.default',
            textTransform: 'capitalize',
          }}
        >
          {message.role}
        </Text>
        {message.toolName && (
          <Label size="small" variant="secondary">
            {message.toolName}
          </Label>
        )}
        {message.isToolCall && (
          <Label size="small" variant="accent">
            call
          </Label>
        )}
        {message.isToolResult && (
          <Label size="small" variant="success">
            result
          </Label>
        )}
        {message.inContext ? (
          <CheckCircleIcon size={12} fill="var(--fgColor-success)" />
        ) : (
          <XCircleIcon size={12} fill="var(--fgColor-muted)" />
        )}
        <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}>
          {formatTokens(message.estimatedTokens)} tokens
        </Text>
      </Box>

      <Text
        sx={{
          fontSize: 0,
          fontFamily: 'mono',
          display: 'block',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 100,
          overflow: 'auto',
        }}
      >
        {message.content.length > 500
          ? message.content.slice(0, 500) + '...'
          : message.content}
      </Text>
    </Box>
  );
}

/**
 * ContextInspector component displays full detailed context snapshot.
 */
export function ContextInspector({ agentId, apiBase }: ContextInspectorProps) {
  const {
    data: contextData,
    isLoading,
    error,
  } = useQuery<FullContextResponse>({
    queryKey: ['full-context', agentId, apiBase],
    queryFn: async () => {
      const base = getApiBase(apiBase);
      const response = await fetch(
        `${base}/api/v1/configure/agents/${encodeURIComponent(agentId)}/full-context`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch full context');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds (less frequent than snapshot)
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Separate messages by in_context status
  const { inContextMessages, outOfContextMessages } = useMemo(() => {
    if (!contextData?.messages) {
      return { inContextMessages: [], outOfContextMessages: [] };
    }
    return {
      inContextMessages: contextData.messages.filter(m => m.inContext),
      outOfContextMessages: contextData.messages.filter(m => !m.inContext),
    };
  }, [contextData?.messages]);

  if (isLoading) {
    return (
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner size="small" />
        <Text sx={{ ml: 2, color: 'fg.muted' }}>
          Loading full context snapshot...
        </Text>
      </Box>
    );
  }

  if (error || !contextData) {
    return (
      <Box
        sx={{
          p: 3,
          bg: 'danger.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'danger.muted',
        }}
      >
        <Text sx={{ color: 'danger.fg' }}>Failed to load context snapshot</Text>
      </Box>
    );
  }

  if (contextData.error) {
    return (
      <Box
        sx={{
          p: 3,
          bg: 'attention.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'attention.muted',
        }}
      >
        <Text sx={{ color: 'attention.fg' }}>{contextData.error}</Text>
      </Box>
    );
  }

  const { tokenSummary, modelConfiguration } = contextData;

  return (
    <Box>
      {/* Token Usage Summary */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
            Context Usage: {formatTokens(tokenSummary.total)} /{' '}
            {formatTokens(tokenSummary.contextWindow)}
          </Text>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            {tokenSummary.usagePercent.toFixed(1)}%
          </Text>
        </Box>
        <ProgressBar
          progress={tokenSummary.usagePercent}
          sx={{ height: 8 }}
          bg={
            tokenSummary.usagePercent > 80
              ? 'danger.emphasis'
              : 'accent.emphasis'
          }
        />
        <Box
          sx={{
            display: 'flex',
            gap: 3,
            mt: 2,
            flexWrap: 'wrap',
            fontSize: 0,
            color: 'fg.muted',
          }}
        >
          <Text>System: {formatTokens(tokenSummary.systemPrompts)}</Text>
          <Text>Tools: {formatTokens(tokenSummary.tools)}</Text>
          {tokenSummary.memory > 0 && (
            <Text>Memory: {formatTokens(tokenSummary.memory)}</Text>
          )}
          <Text>History: {formatTokens(tokenSummary.history)}</Text>
          <Text>Current: {formatTokens(tokenSummary.current)}</Text>
        </Box>
      </Box>

      {/* Model Configuration */}
      <CollapsibleSection
        title="Model Configuration"
        icon={AiModelIcon}
        defaultExpanded={true}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>Model:</Text>
          <Text sx={{ fontSize: 1, fontFamily: 'mono' }}>
            {modelConfiguration.modelName || 'Not specified'}
          </Text>

          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Context Window:
          </Text>
          <Text sx={{ fontSize: 1 }}>
            {formatTokens(modelConfiguration.contextWindow)} tokens
          </Text>

          {Object.keys(modelConfiguration.settings).length > 0 && (
            <>
              <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
                Settings:
              </Text>
              <Box
                as="pre"
                sx={{
                  fontSize: 0,
                  p: 2,
                  bg: 'canvas.inset',
                  borderRadius: 2,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(modelConfiguration.settings, null, 2)}
              </Box>
            </>
          )}
        </Box>
      </CollapsibleSection>

      {/* System Prompts */}
      <CollapsibleSection
        title="System Prompts"
        icon={InfoIcon}
        count={contextData.systemPrompts.length}
        tokens={contextData.systemPromptTokens}
      >
        {contextData.systemPrompts.length === 0 ? (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            No system prompts configured
          </Text>
        ) : (
          contextData.systemPrompts.map((prompt, idx) => (
            <Box
              key={idx}
              sx={{
                p: 2,
                mb: 2,
                bg: 'canvas.inset',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'border.muted',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Text sx={{ fontWeight: 'semibold', fontSize: 0 }}>
                  Prompt {idx + 1}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {formatTokens(prompt.tokens)} tokens
                </Text>
              </Box>
              <Text
                as="pre"
                sx={{
                  fontSize: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {prompt.content}
              </Text>
            </Box>
          ))
        )}
      </CollapsibleSection>

      {/* Tools */}
      <CollapsibleSection
        title="Tools"
        icon={TerminalIcon}
        count={contextData.tools.length}
        tokens={contextData.toolTokens}
      >
        {contextData.tools.length === 0 ? (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            No tools configured
          </Text>
        ) : (
          contextData.tools.map((tool, idx) => (
            <ToolDetailView key={idx} tool={tool} />
          ))
        )}
      </CollapsibleSection>

      {/* Message History */}
      <CollapsibleSection
        title="Message History"
        icon={CommentDiscussionIcon}
        count={contextData.messages.length}
      >
        {contextData.messages.length === 0 ? (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>No messages yet</Text>
        ) : (
          <>
            {outOfContextMessages.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Text
                  sx={{
                    fontWeight: 'semibold',
                    fontSize: 1,
                    color: 'fg.muted',
                    mb: 2,
                    display: 'block',
                  }}
                >
                  Out of Context ({outOfContextMessages.length})
                </Text>
                {outOfContextMessages.map((msg, idx) => (
                  <MessageDetailView key={`out-${idx}`} message={msg} />
                ))}
              </Box>
            )}

            {inContextMessages.length > 0 && (
              <Box>
                <Text
                  sx={{
                    fontWeight: 'semibold',
                    fontSize: 1,
                    color: 'success.fg',
                    mb: 2,
                    display: 'block',
                  }}
                >
                  In Context ({inContextMessages.length})
                </Text>
                {inContextMessages.map((msg, idx) => (
                  <MessageDetailView key={`in-${idx}`} message={msg} />
                ))}
              </Box>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* Memory Blocks */}
      {contextData.memoryBlocks.length > 0 && (
        <CollapsibleSection
          title="Memory Blocks"
          icon={DatabaseIcon}
          count={contextData.memoryBlocks.length}
          tokens={contextData.memoryTokens}
        >
          {contextData.memoryBlocks.map((block, idx) => (
            <Box
              key={idx}
              as="pre"
              sx={{
                p: 2,
                mb: 2,
                bg: 'canvas.inset',
                borderRadius: 2,
                fontSize: 0,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(block, null, 2)}
            </Box>
          ))}
        </CollapsibleSection>
      )}

      {/* Tool Environment */}
      {Object.keys(contextData.toolEnvironment).length > 0 && (
        <CollapsibleSection
          title="Tool Environment"
          icon={KeyIcon}
          count={Object.keys(contextData.toolEnvironment).length}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
            {Object.entries(contextData.toolEnvironment).map(([key, value]) => (
              <React.Fragment key={key}>
                <Text
                  sx={{
                    fontFamily: 'mono',
                    fontSize: 1,
                    fontWeight: 'semibold',
                  }}
                >
                  {key}
                </Text>
                <Text
                  sx={{ fontFamily: 'mono', fontSize: 1, color: 'fg.muted' }}
                >
                  {value}
                </Text>
              </React.Fragment>
            ))}
          </Box>
        </CollapsibleSection>
      )}

      {/* Tool Rules */}
      {contextData.toolRules.length > 0 && (
        <CollapsibleSection
          title="Tool Rules"
          icon={CodeIcon}
          count={contextData.toolRules.length}
        >
          {contextData.toolRules.map((rule, idx) => (
            <Box
              key={idx}
              as="pre"
              sx={{
                p: 2,
                mb: 2,
                bg: 'canvas.inset',
                borderRadius: 2,
                fontSize: 0,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(rule, null, 2)}
            </Box>
          ))}
        </CollapsibleSection>
      )}
    </Box>
  );
}

export default ContextInspector;
