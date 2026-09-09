/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { Text } from '@primer/react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { waitForAgent } from './utils/waitForAgent';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { createAgentToolApprovalsPlugin } from '../loop/plugins/agent-tool-approvals';
import { useAgentRuntimeApprovals } from '../stores/agentRuntimeStore';

const queryClient = new QueryClient();
const AGENT_NAME_PREFIX = 'tool-approval-example-agent';
const DEFAULT_AGENTSPEC_ID = 'example-tool-approvals';

const getSelectedAgentspecIdFromUi = (): string => {
  const params = new URLSearchParams(window.location.search);

  const directKeys = [
    'agent_spec_id',
    'agentSpecId',
    'spec_id',
    'specId',
    'spec',
  ];
  for (const key of directKeys) {
    const value = params.get(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  const selectedAgentId = params.get('selectedAgentId');
  if (selectedAgentId?.startsWith('spec:')) {
    const specId = selectedAgentId.slice('spec:'.length).trim();
    if (specId) {
      return specId;
    }
  }

  return DEFAULT_AGENTSPEC_ID;
};

const buildAgentNameForSpec = (specId: string): string => {
  const slug = specId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = slug ? `${AGENT_NAME_PREFIX}-${slug}` : AGENT_NAME_PREFIX;
  return uniqueAgentId(base);
};

const parseDisableToolApprovalsFromUi = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const raw =
    params.get('disable_tool_approvals') ??
    params.get('disableToolApprovals') ??
    '';
  const normalized = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const AgentToolApprovalsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [selectedSpecId] = useState<string>(() =>
    getSelectedAgentspecIdFromUi(),
  );
  const [disableToolApprovals, setDisableToolApprovals] = useState<boolean>(
    () => parseDisableToolApprovalsFromUi(),
  );
  void setDisableToolApprovals;
  const agentName = useMemo(
    () =>
      buildAgentNameForSpec(
        `${selectedSpecId}-${disableToolApprovals ? 'no-approvals' : 'approvals'}`,
      ),
    [selectedSpecId, disableToolApprovals],
  );
  // The capacity for the choice: the Loop creates the agent from its
  // blueprint, spec and approvals switch included.
  const plugins = useMemo(
    () => [
      createAgentToolApprovalsPlugin({
        specId: selectedSpecId,
        disableToolApprovals,
      }),
    ],
    [selectedSpecId, disableToolApprovals],
  );

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  // Kept for the effect's bookkeeping; the Loop mounts regardless.
  void isReady;
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const chatAuthToken: string | undefined = token === null ? undefined : token;

  void chatAuthToken;
  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const runtimeName = 'localhost';
  void runtimeName;
  const approvals = useAgentRuntimeApprovals();
  const pendingApprovalCount = useMemo(
    () =>
      approvals.filter(
        approval =>
          approval.status === 'pending' &&
          (!agentId || approval.agent_id === agentId),
      ).length,
    [approvals, agentId],
  );
  void pendingApprovalCount;
  const createAttemptedRef = useRef(false);

  useEffect(() => {
    createAttemptedRef.current = false;
  }, [agentName]);

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
    if (createAttemptedRef.current) {
      return;
    }
    createAttemptedRef.current = true;
    let isCancelled = false;
    const controller = new AbortController();
    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        // The Loop creates the agent from the capacity plugin's blueprint —
        // spec, tools and the approvals switch included — as it mounts; the
        // page waits until the server has it.
        const found = await waitForAgent(agentBaseUrl, agentName, {
          signal: controller.signal,
        });
        if (isCancelled) return;
        if (!found) {
          throw new Error(
            `The agent '${agentName}' did not appear on ${agentBaseUrl}.`,
          );
        }
        setAgentId(agentName);
        setIsReconnectedAgent(false);
        setIsReady(true);
        setRuntimeStatus('ready');
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createLocalAgent();
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [
    agentBaseUrl,
    authFetch,
    agentName,
    disableToolApprovals,
    selectedSpecId,
  ]);

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running - reconnected.
          </Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <LoopEmbed
            key={agentName}
            serverUrl={agentBaseUrl}
            target="local"
            showAgentVariants
            agentId={agentId}
            editors={false}
            showHeader
            plugins={plugins}
          />
        </Box>
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('../state/substates').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentToolApprovalsExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('../state/substates').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolApprovalsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolApprovalsExample;
