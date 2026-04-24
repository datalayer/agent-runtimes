/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import {
  Button,
  Dialog,
  Heading,
  Label,
  Spinner,
  Text,
  Token as PrimerToken,
} from '@primer/react';
import { BriefcaseIcon, FileIcon } from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import { useSkills, useSkillActions } from '../hooks';
import type { SkillInfo } from '../types';

const queryClient = new QueryClient();
const AGENT_NAME = 'skills-demo-agent';
const AGENT_SPEC_ID = 'demo-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

const SkillCard: React.FC<{
  skill: SkillInfo;
  onToggle: (id: string) => void;
}> = ({ skill, onToggle }) => {
  const [showDefinition, setShowDefinition] = useState(false);
  const sourceVariant = skill.source_variant ?? 'unknown';
  const sourceLabel =
    sourceVariant === 'path'
      ? 'file-based'
      : sourceVariant === 'package'
        ? 'package-based'
        : sourceVariant === 'module'
          ? 'module-based'
          : 'unknown';
  const sourceDetail =
    sourceVariant === 'package'
      ? [skill.package, skill.method].filter(Boolean).join('#')
      : sourceVariant === 'module'
        ? skill.module
        : sourceVariant === 'path'
          ? skill.path
          : undefined;

  return (
    <>
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
          <Text sx={{ fontWeight: 600, fontSize: 1 }}>{skill.name}</Text>
          {skill.status && (
            <Label
              size="small"
              variant={
                skill.status === 'loaded'
                  ? 'success'
                  : skill.status === 'enabled'
                    ? 'attention'
                    : 'secondary'
              }
            >
              {skill.status}
            </Label>
          )}
          {skill.status === 'loaded' && skill.skill_definition && (
            <Button
              size="small"
              variant="invisible"
              onClick={() => setShowDefinition(true)}
              leadingVisual={FileIcon}
              sx={{ fontSize: 0, p: 0, color: 'fg.muted' }}
              aria-label="View SKILL.md"
            >
              SKILL.md
            </Button>
          )}
          <Button
            size="small"
            variant="invisible"
            onClick={() => onToggle(skill.id)}
            sx={{ ml: 'auto', fontSize: 0 }}
          >
            {skill.status === 'available' ? 'Enable' : 'Disable'}
          </Button>
        </Box>
        {skill.description && (
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 1, mt: 0 }}>
            {skill.description}
          </Text>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Label size="small" variant="secondary">
            {sourceLabel}
          </Label>
          {sourceDetail && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{sourceDetail}</Text>
          )}
        </Box>
        {skill.tags && skill.tags.length > 0 && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {skill.tags.map(tag => (
              <PrimerToken key={tag} text={tag} size="small" />
            ))}
          </Box>
        )}
      </Box>

      {showDefinition && skill.skill_definition && (
        <Dialog
          title={`${skill.name} — SKILL.md`}
          onClose={() => setShowDefinition(false)}
          width="xlarge"
        >
          <Box sx={{ p: 3, maxHeight: '70vh', overflow: 'auto' }}>
            <Box
              as="pre"
              sx={{
                fontFamily: 'mono',
                fontSize: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                m: 0,
                p: 3,
                bg: 'canvas.inset',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'border.muted',
              }}
            >
              {skill.skill_definition}
            </Box>
          </Box>
        </Dialog>
      )}
    </>
  );
};

const AgentSkillsInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  // WS-sourced skills (reads from codemodeStatus pushed via monitoring WS)
  const skillsQuery = useSkills(isReady);
  const skills = skillsQuery.data?.skills ?? [];
  const { enableSkill, disableSkill } = useSkillActions(agentId);
  const autoEnabledSkillIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    autoEnabledSkillIdsRef.current.clear();
  }, [agentId]);

  useEffect(() => {
    if (!isReady || skills.length === 0) {
      return;
    }
    for (const skill of skills) {
      if (
        skill.status === 'available' &&
        !autoEnabledSkillIdsRef.current.has(skill.id)
      ) {
        autoEnabledSkillIdsRef.current.add(skill.id);
        enableSkill(skill.id);
      }
    }
  }, [enableSkill, isReady, skills]);

  const toggleSkill = useCallback(
    (skillId: string) => {
      const skill = skills.find(s => s.id === skillId);
      if (skill?.status === 'available') {
        enableSkill(skillId);
      } else {
        disableSkill(skillId);
      }
    },
    [skills, enableSkill, disableSkill],
  );

  const fileBasedSkills = skills.filter(s => s.source_variant === 'path');
  const packageBasedSkills = skills.filter(s => s.source_variant === 'package');
  const moduleBasedSkills = skills.filter(s => s.source_variant === 'module');

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
        // The spec contains module-based, package-based and file-based skills.
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description:
              'Agent with skills demo - module, package and file based skills',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            enable_skills: true,
            tools: [],
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
  }, [agentBaseUrl, agentName, authFetch]);

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
    return <ErrorView error={hookError} onLogout={onLogout} />;
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
            showSkillsMenu={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  Skills: {skills.length}
                </Text>
              </Box>
            }
            suggestions={[
              {
                title: 'List available skills',
                message: 'List all your available skills and what they can do.',
              },
              {
                title: '👤 Who am I',
                message:
                  'Use the datalayer-whoami skill to tell me who I am, including my user identity and available context.',
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
                  'Use the GitHub skill to show two sections: first, the top 3 recently updated public repositories from the datalayer organization; second, my top 3 recently updated private repositories. Keep the output clear and concise.',
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
              {skills.length} skill{skills.length !== 1 ? 's' : ''} &middot;{' '}
              {skills.filter(s => s.status === 'loaded').length} loaded &middot;{' '}
              {skills.filter(s => s.status === 'enabled').length} pending
            </Text>
            <Text
              sx={{ fontSize: 0, color: 'fg.muted', mt: 1, display: 'block' }}
            >
              {fileBasedSkills.length} file-based &middot;{' '}
              {packageBasedSkills.length} package-based &middot;{' '}
              {moduleBasedSkills.length} module-based
            </Text>
          </Box>
          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
            {skills.length === 0 ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                Waiting for skills snapshot...
              </Text>
            ) : (
              skills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={toggleSkill}
                />
              ))
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
                Skill Statuses
              </Heading>
              <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                >
                  <Label size="small" variant="secondary">
                    available
                  </Label>
                  <Text>In catalog, not yet enabled</Text>
                </Box>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                >
                  <Label size="small" variant="attention">
                    enabled
                  </Label>
                  <Text>Enabled, loading pending</Text>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Label size="small" variant="success">
                    loaded
                  </Label>
                  <Text>SKILL.md loaded, in system prompt</Text>
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
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
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
        <AgentSkillsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentSkillsExample;
