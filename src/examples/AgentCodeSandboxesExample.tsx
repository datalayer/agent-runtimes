/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useCallback, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Heading, Label, Spinner, Text } from '@primer/react';
import { PackageIcon } from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { AuthRequiredView, ErrorView } from './components';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { Chat } from '../chat';

type SandboxVariant =
  | 'eval'
  | 'jupyter'
  | 'docker'
  | 'datalayer'
  | 'colab'
  | 'kaggle'
  | 'monty'
  | 'modal';

interface SandboxSpecOption {
  variant: SandboxVariant;
  specId: string;
  title: string;
  description: string;
}

const SANDBOX_SPEC_OPTIONS: SandboxSpecOption[] = [
  {
    variant: 'eval',
    specId: 'example-sandbox-eval',
    title: 'Eval Sandbox',
    description: 'In-process Python execution for quick local iteration.',
  },
  {
    variant: 'jupyter',
    specId: 'example-sandbox-jupyter',
    title: 'Jupyter Sandbox',
    description: 'Kernel-backed execution with notebook-compatible behavior.',
  },
  {
    variant: 'docker',
    specId: 'example-sandbox-docker',
    title: 'Docker Sandbox',
    description: 'Containerized execution for stronger process isolation.',
  },
  {
    variant: 'datalayer',
    specId: 'example-sandbox-datalayer',
    title: 'Datalayer Sandbox',
    description: 'Cloud sandbox runtime powered by Datalayer environments.',
  },
  {
    variant: 'colab',
    specId: 'example-sandbox-colab',
    title: 'Colab Sandbox',
    description:
      'Google Colab runtime connector (reuse an already-running kernel).',
  },
  {
    variant: 'kaggle',
    specId: 'example-sandbox-kaggle',
    title: 'Kaggle Sandbox',
    description:
      'Kaggle runtime connector (create kernel with API token or attach existing).',
  },
  {
    variant: 'monty',
    specId: 'example-sandbox-monty',
    title: 'Monty Sandbox',
    description: 'Secure in-process interpreter focused on safe snippets.',
  },
  {
    variant: 'modal',
    specId: 'example-sandbox-modal',
    title: 'Modal Sandbox',
    description: 'Modal cloud sandbox for scalable remote code execution.',
  },
];

const AgentCodeSandboxesInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const baseUrl = useExampleAgentRuntimesUrl();

  const [selectedSpecId, setSelectedSpecId] = useState<string>(
    SANDBOX_SPEC_OPTIONS[0].specId,
  );
  const [agentId, setAgentId] = useState<string | null>(null);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = useMemo(
    () =>
      SANDBOX_SPEC_OPTIONS.find(option => option.specId === selectedSpecId) ??
      SANDBOX_SPEC_OPTIONS[0],
    [selectedSpecId],
  );

  const activeOption = useMemo(
    () =>
      SANDBOX_SPEC_OPTIONS.find(option => option.specId === activeSpecId) ??
      selectedOption,
    [activeSpecId, selectedOption],
  );

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

  const launchAgent = useCallback(async () => {
    setIsLaunching(true);
    setError(null);

    try {
      if (agentId) {
        await authFetch(`${baseUrl}/api/v1/agents/${agentId}`, {
          method: 'DELETE',
        }).catch(() => {
          // Ignore teardown errors while switching specs.
        });
      }

      const agentName = uniqueAgentId(`code-sandbox-${selectedOption.variant}`);

      const response = await authFetch(`${baseUrl}/api/v1/agents`, {
        method: 'POST',
        body: JSON.stringify({
          name: agentName,
          description: `Code sandbox demo (${selectedOption.variant})`,
          agent_library: 'pydantic-ai',
          transport: 'vercel-ai',
          agent_spec_id: selectedOption.specId,
          enable_codemode: true,
          enable_skills: true,
          tools: [],
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let detail = '';
        if (contentType.includes('application/json')) {
          const payload = await response.json().catch(() => null);
          detail =
            (typeof payload?.detail === 'string' && payload.detail) ||
            (typeof payload?.message === 'string' && payload.message) ||
            '';
        } else {
          detail = await response.text().catch(() => '');
        }

        throw new Error(
          detail || `Failed to create agent (${response.status})`,
        );
      }

      const payload = await response.json();
      const createdAgentId = payload?.id || agentName;

      setAgentId(createdAgentId);
      setActiveSpecId(selectedOption.specId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch agent');
    } finally {
      setIsLaunching(false);
    }
  }, [agentId, authFetch, baseUrl, selectedOption]);

  if (!agentId) {
    return (
      <Box
        sx={{
          maxWidth: 840,
          mx: 'auto',
          mt: 6,
          px: 3,
          py: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          bg: 'canvas.default',
        }}
      >
        <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
          SANDBOX VARIANT DEMO
        </Text>
        <Heading as="h2" sx={{ fontSize: 3 }}>
          Agent Code Sandboxes
        </Heading>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Choose a sandbox variant-backed spec, launch the agent, then run code
          from chat to compare behavior across sandboxes.
        </Text>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Label variant="accent">Spec: {selectedOption.specId}</Label>
          <Label variant="secondary">Variant: {selectedOption.variant}</Label>
          <Label variant="success">Codemode: enabled</Label>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontSize: 1, fontWeight: 600 }}>Sandbox Variant</Text>
          <select
            value={selectedSpecId}
            onChange={event => {
              setSelectedSpecId(event.target.value);
            }}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--borderColor-default)',
              background: 'var(--bgColor-default)',
              color: 'var(--fgColor-default)',
            }}
          >
            {SANDBOX_SPEC_OPTIONS.map(option => (
              <option key={option.specId} value={option.specId}>
                {option.title} ({option.variant})
              </option>
            ))}
          </select>
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            {selectedOption.description}
          </Text>
        </Box>

        <Button
          variant="primary"
          onClick={() => {
            void launchAgent();
          }}
          disabled={isLaunching}
          sx={{ width: '100%', maxWidth: 420 }}
        >
          {isLaunching ? (
            <>
              <Spinner size="small" /> Launching...
            </>
          ) : (
            `Launch ${selectedOption.title}`
          )}
        </Button>

        {error && <ErrorView error={error} onLogout={onLogout} />}
      </Box>
    );
  }

  return (
    <Chat
      protocol="vercel-ai"
      baseUrl={baseUrl}
      agentId={agentId}
      runtimeId={agentId}
      title={`Code Sandboxes: ${activeOption.title}`}
      description={`Spec ${activeOption.specId} (${activeOption.variant})`}
      brandIcon={<PackageIcon size={16} />}
      showHeader={true}
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      height="100vh"
      historyEndpoint={`${baseUrl}/api/v1/history`}
      suggestions={[
        {
          title: 'Identify sandbox variant',
          message:
            'Use execute_code to print(os.getenv("DATALAYER_CODE_SANDBOX_VARIANT")) and summarize the result.',
        },
        {
          title: 'Run numeric workload',
          message:
            'Use execute_code to compute sum(i*i for i in range(10000)) and report timing and result.',
        },
        {
          title: 'Check package availability',
          message:
            'Use execute_code to import pandas and print(pandas.__version__).',
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

const AgentCodeSandboxesExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();

  const handleLogout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  if (!token) {
    return <AuthRequiredView />;
  }

  return (
    <ThemedProvider>
      <AgentCodeSandboxesInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentCodeSandboxesExample;
