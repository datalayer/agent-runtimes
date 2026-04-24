/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useMemo } from 'react';
import type { SkillInfo, SkillStatus } from '../types/skills';
import { agentRuntimeStore, useAgentRuntimeCodemodeStatus } from '../stores';

function parseSkillStatus(value: unknown): SkillStatus {
  if (value === 'available' || value === 'enabled' || value === 'loaded') {
    return value;
  }
  return 'available';
}

// ---------------------------------------------------------------------------
// Skills from WS snapshot
// ---------------------------------------------------------------------------

/**
 * Derive the list of skills from the WS-pushed `codemodeStatus`.
 *
 * The server-side SkillsArea pushes per-skill status (`available`,
 * `enabled`, `loaded`) via the monitoring WebSocket inside the
 * `codemodeStatus.skills` array.  This hook reads from the Zustand
 * store — no REST call is made.
 */
export function useSkills(
  _enabled: boolean,
  _baseEndpoint?: string,
  _authToken?: string,
) {
  const codemodeStatus = useAgentRuntimeCodemodeStatus();

  const data = useMemo(() => {
    if (!codemodeStatus) {
      return undefined;
    }
    const skills: SkillInfo[] = (codemodeStatus.skills ?? []).map(s => ({
      id: s.id ?? s.name,
      name: s.name,
      description: s.description,
      tags: s.tags,
      has_scripts: s.has_scripts,
      has_resources: s.has_resources,
      status: parseSkillStatus(s.status),
      approved: s.approved !== false,
      skill_definition: s.skill_definition ?? null,
      source_variant: s.source_variant,
      module: s.module,
      package: s.package,
      method: s.method,
      path: s.path,
    }));
    return { skills, total: skills.length };
  }, [codemodeStatus]);

  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => Promise.resolve({ data }),
  };
}

// ---------------------------------------------------------------------------
// Skill enable / disable via WebSocket
// ---------------------------------------------------------------------------

export function useSkillActions(agentId?: string) {
  const enableSkill = useCallback(
    (skillId: string) => {
      const ok = agentRuntimeStore
        .getState()
        .sendRawMessage({ type: 'skill_enable', skillId }, agentId);
      if (!ok) {
        console.warn(
          '[useSkillActions] skill_enable dropped: websocket not ready',
        );
      }
      return ok;
    },
    [agentId],
  );

  const disableSkill = useCallback(
    (skillId: string) => {
      const ok = agentRuntimeStore
        .getState()
        .sendRawMessage({ type: 'skill_disable', skillId }, agentId);
      if (!ok) {
        console.warn(
          '[useSkillActions] skill_disable dropped: websocket not ready',
        );
      }
      return ok;
    },
    [agentId],
  );

  const approveSkill = useCallback(
    (skillId: string) => {
      const ok = agentRuntimeStore
        .getState()
        .sendRawMessage({ type: 'skill_approve', skillId }, agentId);
      if (!ok) {
        console.warn(
          '[useSkillActions] skill_approve dropped: websocket not ready',
        );
      }
      return ok;
    },
    [agentId],
  );

  const unapproveSkill = useCallback(
    (skillId: string) => {
      const ok = agentRuntimeStore
        .getState()
        .sendRawMessage({ type: 'skill_unapprove', skillId }, agentId);
      if (!ok) {
        console.warn(
          '[useSkillActions] skill_unapprove dropped: websocket not ready',
        );
      }
      return ok;
    },
    [agentId],
  );

  return { enableSkill, disableSkill, approveSkill, unapproveSkill };
}

// ---------------------------------------------------------------------------
// Loaded skills (kept for backward compat with AgentSkillsExample sidebar)
// ---------------------------------------------------------------------------

export { useAgentRuntimeLoadedSkills } from '../stores';
