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
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { LoopEmbed } from '../loop';
import { AgentSkillsPlugin } from '../loop/plugins/agent-skills';
import { useSkills, useSkillActions } from '../hooks';
import type { SkillInfo } from '../types';

const LOOP_PLUGINS_AGENTSKI = [AgentSkillsPlugin];

const queryClient = new QueryClient();
const AGENT_NAME = 'skills-example-agent';
const AGENTSPEC_ID = 'example-skills';

const SkillCard: React.FC<{
  skill: SkillInfo;
  onToggle: (id: string) => void;
  onToggleApproval: (id: string) => void;
}> = ({ skill, onToggle, onToggleApproval }) => {
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
          {skill.approved && (
            <Label size="small" variant="success">
              approved
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
          <Box
            sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Button
              size="small"
              variant="invisible"
              onClick={() => onToggleApproval(skill.id)}
              sx={{ fontSize: 0 }}
            >
              {skill.approved ? 'Unapprove' : 'Approve'}
            </Button>
            <Button
              size="small"
              variant="invisible"
              onClick={() => onToggle(skill.id)}
              sx={{ fontSize: 0 }}
            >
              {skill.status === 'available' ? 'Enable' : 'Disable'}
            </Button>
          </Box>
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
                bg: 'canvas.default',
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

  const {
    agentId = agentName,
    baseUrl: agentBaseUrl,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useExampleAgentRuntime({
    exampleId: 'AgentSkillsExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      description:
        'Agent with skills example - module, package and file based skills',
      protocol: 'vercel-ai',
      agentSpecId: AGENTSPEC_ID,
      enableSkills: true,
      tools: [],
    },
  });
  const chatAuthToken: string | undefined = token === null ? undefined : token;
  void chatAuthToken;

  // WS-sourced skills (reads from codemodeStatus pushed via monitoring WS)
  const skillsQuery = useSkills(isReady);
  const skills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data],
  );
  const { enableSkill, disableSkill, approveSkill, unapproveSkill } =
    useSkillActions(agentId);

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

  const toggleSkillApproval = useCallback(
    (skillId: string) => {
      const skill = skills.find(s => s.id === skillId);
      if (skill?.approved) {
        unapproveSkill(skillId);
      } else {
        approveSkill(skillId);
      }
    },
    [skills, approveSkill, unapproveSkill],
  );

  const fileBasedSkills = skills.filter(s => s.source_variant === 'path');
  const packageBasedSkills = skills.filter(s => s.source_variant === 'package');
  const moduleBasedSkills = skills.filter(s => s.source_variant === 'module');

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
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching skills example agent...
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
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <LoopEmbed
            serverUrl={agentBaseUrl}
            target="local"
            agentId={agentId}
            defaultEditor="none"
            showHeader
            plugins={LOOP_PLUGINS_AGENTSKI}
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
            bg: 'canvas.default',
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
              {skills.filter(s => s.approved).length} approved
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
                  onToggleApproval={toggleSkillApproval}
                />
              ))
            )}

            <Box
              sx={{
                mt: 3,
                p: 2,
                borderRadius: 2,
                bg: 'canvas.default',
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
  import('../state/substates').then(({ iamStore }) => {
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
        <AgentSkillsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentSkillsExample;
