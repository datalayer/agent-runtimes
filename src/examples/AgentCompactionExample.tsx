/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCompactionExample
 *
 * Demonstrates history compaction. Before launching, the user picks a context
 * token ceiling (capped at the agentspec model's tokens_limit). A lower ceiling
 * makes the agent summarize older messages sooner. When compaction runs, a
 * live panel shows a spinner and the details (from/to tokens, from/to messages,
 * and time taken).
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Text, Spinner, Heading, Label, Button, FormControl } from '@primer/react';
import {
  HistoryIcon,
  ClockIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  StackIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';
import { useAgentRuntimeCompaction, agentRuntimeStore } from '../stores';
import { getAgentspecs } from '../specs/agents';
import { AI_MODEL_CATALOGUE } from '../specs';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useRuntimeTargetStore } from './utils/runtimeTargetStore';

const AGENT_NAME = 'compaction-example-agent';
const AGENTSPEC_ID = 'example-monitoring';
const MIN_MAX_TOKENS = 1000;
const DEFAULT_MAX_TOKENS = 4000;

/** Resolve the agentspec model's token limit as the upper bound the user can set. */
function resolveAgentspecTokenLimit(): number {
  const spec = getAgentspecs(AGENTSPEC_ID);
  const model = spec?.model;
  const limit = model ? AI_MODEL_CATALOGUE[model]?.tokensLimit : undefined;
  return typeof limit === 'number' && limit > 0 ? limit : 64000;
}

const numberFmt = new Intl.NumberFormat();

/** Live compaction status: spinner while running, details when complete. */
const CompactionPanel: React.FC<{ maxTokens: number }> = ({ maxTokens }) => {
  const compaction = useAgentRuntimeCompaction();

  return (
    <Box
      sx={{
        p: 3,
        borderBottom: '1px solid',
        borderColor: 'border.default',
      }}
    >
      <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
        Compaction
      </Heading>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <StackIcon size={14} />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Budget: {numberFmt.format(maxTokens)} tokens
        </Text>
      </Box>

      {!compaction && (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
          No compaction yet. Keep chatting — once the history exceeds the token
          budget, older messages are summarized automatically.
        </Text>
      )}

      {compaction?.phase === 'start' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            border: '1px solid',
            borderColor: 'attention.emphasis',
            borderRadius: 2,
            bg: 'attention.subtle',
          }}
        >
          <Spinner size="small" />
          <Box>
            <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>Compacting…</Text>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
              Summarizing {numberFmt.format(compaction.beforeMessages)} messages
              (~{numberFmt.format(compaction.beforeTokens)} tokens)
            </Text>
          </Box>
        </Box>
      )}

      {compaction?.phase === 'end' && (
        <Box
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: compaction.reduced
              ? 'success.emphasis'
              : 'border.default',
            borderRadius: 2,
            bg: compaction.reduced ? 'success.subtle' : 'canvas.subtle',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <CheckCircleIcon size={14} />
            <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
              {compaction.reduced ? 'Compacted' : 'History already minimal'}
            </Text>
          </Box>

          <Box
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 0 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Text sx={{ color: 'fg.muted', minWidth: 64 }}>Tokens</Text>
              <Text sx={{ fontFamily: 'mono' }}>
                {numberFmt.format(compaction.beforeTokens)}
              </Text>
              <ArrowRightIcon size={12} />
              <Text sx={{ fontFamily: 'mono' }}>
                {numberFmt.format(compaction.afterTokens ?? compaction.beforeTokens)}
              </Text>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Text sx={{ color: 'fg.muted', minWidth: 64 }}>Messages</Text>
              <Text sx={{ fontFamily: 'mono' }}>
                {numberFmt.format(compaction.beforeMessages)}
              </Text>
              <ArrowRightIcon size={12} />
              <Text sx={{ fontFamily: 'mono' }}>
                {numberFmt.format(
                  compaction.afterMessages ?? compaction.beforeMessages,
                )}
              </Text>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ClockIcon size={12} />
              <Text sx={{ color: 'fg.muted', minWidth: 52 }}>Time</Text>
              <Text sx={{ fontFamily: 'mono' }}>
                {numberFmt.format(Math.round(compaction.durationMs ?? 0))} ms
              </Text>
            </Box>
            {typeof compaction.compactionCount === 'number' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Text sx={{ color: 'fg.muted', minWidth: 64 }}>Total runs</Text>
                <Text sx={{ fontFamily: 'mono' }}>
                  {numberFmt.format(compaction.compactionCount)}
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

const AgentCompactionInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const tokenLimit = useRef(resolveAgentspecTokenLimit()).current;

  const [maxTokensInput, setMaxTokensInput] = useState<number>(
    Math.min(DEFAULT_MAX_TOKENS, tokenLimit),
  );
  const [launchedMaxTokens, setLaunchedMaxTokens] = useState<number | null>(
    null,
  );
  const [runtimeStatus, setRuntimeStatus] = useState<
    'idle' | 'launching' | 'ready' | 'error'
  >('idle');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers ?? {}),
        },
      }),
    [token],
  );

  useEffect(() => {
    if (launchedMaxTokens === null) return;
    let isCancelled = false;

    const createAgentForTarget = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);
      // Clear any prior compaction status from a previous stream.
      agentRuntimeStore.getState().setCompaction(null);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description:
              'Compaction example – history summarization under a token budget',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
            memory: 'ephemeral',
            enable_skills: true,
            tools: [],
            compactionMaxTokens: launchedMaxTokens,
          }),
        });

        let resolvedAgentId = agentName;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (response.status === 409 || /already exists/i.test(detail || '')) {
            isAlreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(isAlreadyRunning);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createAgentForTarget();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, authFetch, runtimeTarget, launchedMaxTokens, agentName]);

  // Setup phase: choose the compaction token budget before launching.
  if (launchedMaxTokens === null) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            width: 460,
            maxWidth: '90%',
            p: 4,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.subtle',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <HistoryIcon size={20} />
            <Heading as="h3" sx={{ fontSize: 3 }}>
              History Compaction
            </Heading>
          </Box>
          <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mt: 0, mb: 3 }}>
            Set the context token budget before launching. When the conversation
            grows past this budget, older messages are summarized so the input
            stays within the limit. A lower budget triggers compaction sooner.
          </Text>

          <FormControl>
            <FormControl.Label>
              Max context tokens: {numberFmt.format(maxTokensInput)}
            </FormControl.Label>
            <Box sx={{ mt: 2 }}>
              <input
                type="range"
                min={MIN_MAX_TOKENS}
                max={tokenLimit}
                step={500}
                value={maxTokensInput}
                onChange={e => setMaxTokensInput(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </Box>
            <FormControl.Caption>
              Agentspec max: {numberFmt.format(tokenLimit)} tokens (model limit)
            </FormControl.Caption>
          </FormControl>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            <Button
              variant="primary"
              leadingVisual={HistoryIcon}
              onClick={() => setLaunchedMaxTokens(maxTokensInput)}
            >
              Launch agent
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 3,
          bg: 'canvas.default',
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching compaction example agent ({runtimeTarget})...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bg: 'canvas.default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        <HistoryIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Compaction Demo
        </Heading>
        {isReconnectedAgent && (
          <Label variant="secondary" size="small">
            Reconnected
          </Label>
        )}
        <Label variant="accent">{runtimeTarget}</Label>
        <Label variant="accent">
          {numberFmt.format(launchedMaxTokens)} tok budget
        </Label>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Compaction Agent"
            brandIcon={<HistoryIcon size={16} />}
            placeholder="Chat until the history exceeds the token budget..."
            description="History summarization under a token budget"
            showHeader={true}
            kernelIndicatorPlacement="right"
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Fill the context',
                message:
                  'Write a detailed, multi-paragraph essay on the history of computing, covering hardware, software, and networking eras.',
              },
              {
                title: 'Keep going',
                message:
                  'Now expand each section with more detail and concrete examples, adding at least three paragraphs per era.',
              },
              {
                title: 'Recall earlier',
                message:
                  'Summarize everything we have discussed so far in this conversation.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        <Box
          sx={{
            width: 320,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          <CompactionPanel maxTokens={launchedMaxTokens} />

          <Box sx={{ p: 3 }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              How It Works
            </Heading>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
              Before each model request, the compaction capability estimates the
              history size. When it exceeds a fraction of the{' '}
              {numberFmt.format(launchedMaxTokens)}-token budget, older messages
              are replaced by an LLM-generated summary while recent messages are
              preserved.
            </Text>
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 0 }}>
              The budget is capped at the agentspec model's token limit (
              {numberFmt.format(tokenLimit)}). Lower it to trigger compaction
              with a shorter conversation.
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const AgentCompactionExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();

  const handleLogout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <AgentCompactionInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentCompactionExample;
