/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import {
  Button,
  Heading,
  Label,
  Spinner,
  Text,
  Token as PrimerToken,
} from '@primer/react';
import {
  AlertIcon,
  BeakerIcon,
  BriefcaseIcon,
  PackageIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { Chat } from '../chat';

const queryClient = new QueryClient();
const AGENT_NAME = 'skills-demo-agent';
const AGENT_SPEC_ID = 'demo-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

interface SkillInfo {
  name: string;
  description: string;
  variant: 'module' | 'package' | 'path';
  module?: string;
  package?: string;
  method?: string;
  path?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  skillMetadata?: Record<string, string>;
  tags?: string[];
  emoji?: string;
}

const SkillCard: React.FC<{ skill: SkillInfo }> = ({ skill }) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'border.default',
      borderRadius: 2,
      p: 2,
      mb: 2,
      bg: 'canvas.default',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      {skill.emoji && <Text sx={{ fontSize: 2 }}>{skill.emoji}</Text>}
      <Text sx={{ fontWeight: 600, fontSize: 1 }}>{skill.name}</Text>
      <Label
        size="small"
        variant={skill.variant === 'package' ? 'accent' : 'primary'}
      >
        {skill.variant === 'package'
          ? 'package-based'
          : skill.variant === 'path'
            ? 'path-based'
            : 'name-based'}
      </Label>
    </Box>
    <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 1, mt: 0 }}>
      {skill.description}
    </Text>
    {skill.variant === 'module' && skill.module && (
      <Text sx={{ fontSize: 0, fontFamily: 'mono', color: 'fg.muted' }}>
        module: {skill.module}
      </Text>
    )}
    {skill.variant === 'package' && (
      <Box sx={{ fontSize: 0, fontFamily: 'mono', color: 'fg.muted' }}>
        <Text sx={{ display: 'block' }}>package: {skill.package}</Text>
        <Text sx={{ display: 'block' }}>method: {skill.method}</Text>
      </Box>
    )}
    {skill.variant === 'path' && skill.path && (
      <Text sx={{ fontSize: 0, fontFamily: 'mono', color: 'fg.muted' }}>
        path: {skill.path}
      </Text>
    )}
    {skill.license && (
      <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mt: 1 }}>
        License: {skill.license}
      </Text>
    )}
    {skill.compatibility && (
      <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
        Compat: {skill.compatibility}
      </Text>
    )}
    {skill.allowedTools && skill.allowedTools.length > 0 && (
      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {skill.allowedTools.map(tool => (
          <PrimerToken key={tool} text={tool} size="small" />
        ))}
      </Box>
    )}
    {skill.tags && skill.tags.length > 0 && (
      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {skill.tags.map(tag => (
          <PrimerToken key={tag} text={tag} size="small" />
        ))}
      </Box>
    )}
  </Box>
);

const AgentSkillsInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(AGENT_NAME);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
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
    let isCancelled = false;

    const createAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        // Create local agent runtime using the demo-full spec.
        // The spec contains both code-based and path-based skills.
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: AGENT_NAME,
            description:
              'Agent with skills demo - code-based and path-based skills',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = AGENT_NAME;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || AGENT_NAME;
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
              detail || `Failed to create agent: ${response.status}`,
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

    void createAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, authFetch]);

  // Fetch skill information from the agent's spec endpoint
  useEffect(() => {
    if (!isReady) return;

    const fetchSkills = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/spec`,
        );
        if (!res.ok) return;
        const spec = await res.json();
        const skillNames: string[] = spec?.skills ?? [];

        // For each skill name, build a SkillInfo from the catalog when possible.
        const { getSkillSpec } = await import('../specs/skills');
        const infos: SkillInfo[] = skillNames.map((name: string) => {
          const baseName = name.includes(':') ? name.split(':')[0] : name;
          const catalogSpec = getSkillSpec(baseName);

          if (catalogSpec?.path) {
            // Variant 3: path-based skill
            return {
              name: catalogSpec.name,
              description: catalogSpec.description || `Skill: ${baseName}`,
              variant: 'path' as const,
              path: catalogSpec.path,
              tags: catalogSpec.tags ? [...catalogSpec.tags] : [],
              emoji: catalogSpec.emoji,
            };
          }

          if (catalogSpec?.package && catalogSpec?.method) {
            // Variant 2: package-based skill
            return {
              name: catalogSpec.name,
              description: catalogSpec.description || `Skill: ${baseName}`,
              variant: 'package' as const,
              package: catalogSpec.package,
              method: catalogSpec.method,
              license: catalogSpec.license,
              compatibility: catalogSpec.compatibility,
              allowedTools: catalogSpec.allowedTools,
              skillMetadata: catalogSpec.skillMetadata,
              tags: catalogSpec.tags ? [...catalogSpec.tags] : [],
              emoji: catalogSpec.emoji,
            };
          }

          // Variant 1: name-based (module discovery)
          return {
            name: catalogSpec?.name ?? baseName,
            description: catalogSpec?.description ?? `Skill: ${baseName}`,
            variant: 'module' as const,
            module: catalogSpec?.module ?? `agent_skills.skills.${baseName}`,
            tags: catalogSpec?.tags ? [...catalogSpec.tags] : [],
            emoji: catalogSpec?.emoji,
          };
        });

        setSkills(infos);
      } catch {
        // Non-fatal: skill display is informational
      }
    };

    void fetchSkills();
  }, [isReady, agentId, agentBaseUrl, authFetch]);

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>Launching skills demo agent...</Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <AlertIcon size={48} />
        <Text sx={{ color: 'danger.fg' }}>
          {hookError || 'Agent failed to start'}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
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
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title={`Skills Demo Agent`}
            placeholder="Ask the agent to use its skills..."
            showHeader={true}
            showNewChatButton={true}
            showClearButton={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  Skills: {skills.length}
                </Text>
                {token && <UserBadge token={token} variant="small" />}
                <Button
                  size="small"
                  variant="invisible"
                  onClick={onLogout}
                  leadingVisual={SignOutIcon}
                  sx={{ color: 'fg.muted' }}
                >
                  Sign out
                </Button>
              </Box>
            }
            suggestions={[
              {
                title: 'List available skills',
                message: 'List all your available skills and what they can do.',
              },
              {
                title: '🌐 Crawl a webpage',
                message:
                  'Use the crawl skill to fetch the content of https://datalayer.ai and summarize it.',
              },
              {
                title: '📅 Generate an event',
                message:
                  'Use the events skill to create a new event named "team-sync" with status "pending" and describe it.',
              },
              {
                title: '🐙 GitHub repos',
                message:
                  'Use the GitHub skill to list the public repositories for the "datalayer" organization.',
              },
              {
                title: '📄 Read a PDF',
                message:
                  'Use the PDF skill to extract the text from a PDF file at /tmp/sample.pdf and show me the first 200 characters.',
              },
              {
                title: '📝 Summarize text',
                message:
                  'Use the text summarizer skill to summarize the following: "Artificial intelligence has transformed many industries. Machine learning enables computers to learn from data. Natural language processing allows machines to understand human language. Computer vision gives machines the ability to interpret images. These technologies are reshaping healthcare, finance, education, and transportation."',
              },
              {
                title: '😄 Tell me a joke',
                message: 'Use the jokes skill to tell me a random joke.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Skills info panel */}
        <Box
          sx={{
            width: 320,
            minWidth: 280,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            bg: 'canvas.subtle',
          }}
        >
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
              >
                <BriefcaseIcon size={16} />
                Agent Skills
              </Box>
            </Heading>
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              Loaded: {skills.length} skill{skills.length !== 1 ? 's' : ''}
            </Text>
          </Box>
          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
            {skills.length === 0 ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                No skills loaded.
              </Text>
            ) : (
              skills.map(skill => <SkillCard key={skill.name} skill={skill} />)
            )}

            <Box
              sx={{
                mt: 3,
                p: 2,
                borderRadius: 2,
                bg: 'canvas.inset',
                border: '1px solid',
                borderColor: 'border.muted',
              }}
            >
              <Heading as="h5" sx={{ fontSize: 0, mb: 1 }}>
                Skill Spec Variants
              </Heading>
              <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                >
                  <BeakerIcon size={12} />
                  <Text>
                    <strong>Path-based:</strong> Discovered from a local
                    SKILL.md directory path
                  </Text>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PackageIcon size={12} />
                  <Text>
                    <strong>Module-based:</strong> Python module or package +
                    method with frontmatter
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentSkillsExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      syncTokenToIamStore(newToken);
    },
    [setAuth],
  );

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          title="Agent Skills Demo"
          description="Sign in to test code-based and path-based agent skills."
          leadingIcon={<BriefcaseIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentSkillsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentSkillsExample;
