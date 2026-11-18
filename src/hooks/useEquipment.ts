/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's agent is equipped with, for its composer to list
 * (the user, 18 November 2026: "the application component should show in the
 * footer the model, mcp and skill selector — those selectors should indicate
 * all the available (enabled or disabled)").
 *
 * Three lists, each of everything the agent declares, on or off, with why
 * one is off — by the names of the variables it needs, never a value:
 *
 * - its **MCP servers** and its **skills**, from the runtime's
 *   `GET /api/v1/apps/agents/{agent}/equipment` (`agent_runtimes.apps.equipment`),
 *   which every runtime that serves an application answers, the visitors'
 *   and a deployment's included;
 * - its **models**, from the chat's own read, `GET /api/v1/configure/models`,
 *   which those runtimes answer too.
 *
 * Until the runtime answers, the lists are the agent's spec in the
 * catalogue, said `declared`: what it names, with no state. Read only:
 * nothing here switches anything, and no model is sent with a run.
 *
 * @module hooks/useEquipment
 */

import { useEffect, useMemo, useState } from 'react';
import { readServerCatalogue } from '../chat/base/modelChoice';
import { AGENTSPECS } from '../specs/agents';
import { getModel } from '../specs/models';
import type { ModelConfig } from '../types/chat';

export type McpServerState =
  'started' | 'starting' | 'failed' | 'not_started' | 'left_out';

export type SkillState = 'active' | 'not_activated';

/** An MCP server the agent declares. */
export type EquipmentServer = {
  id: string;
  name: string;
  optional: boolean;
  /** Its live state; none while only its spec was read. */
  state?: McpServerState;
  /** Why it is off, in a few words; variable names, never values. */
  reason?: string;
  missingEnvVars: string[];
  /** How many tools it brings, once started. */
  tools?: number;
};

/** A skill the agent declares. */
export type EquipmentSkill = {
  id: string;
  name: string;
  description: string;
  optional: boolean;
  state?: SkillState;
  reason?: string;
  missingEnvVars: string[];
  oneOfEnvVars: string[];
};

/** A model the agent may run on. */
export type EquipmentModel = ModelConfig & {
  /** The one it runs on. */
  current: boolean;
};

export type Equipment = {
  /** `live`: the runtime's answer; `declared`: the spec, before it answered. */
  source: 'live' | 'declared';
  servers: EquipmentServer[];
  skills: EquipmentSkill[];
  models: EquipmentModel[];
  /** `live` for the models too: whether the runtime said which it may run on. */
  modelsSource: 'live' | 'declared';
};

const base = (url: string): string => url.replace(/\/+$/, '');

const bare = (id: string): string => id.split(':')[0];

/** `GET /api/v1/apps/agents/{agent}/equipment`: answered wherever an application runs. */
export function equipmentUrl(agentServerUrl: string, agentId: string): string {
  return `${base(agentServerUrl)}/api/v1/apps/agents/${encodeURIComponent(agentId)}/equipment`;
}

/** `GET /api/v1/configure/models` for an agent: a read every such runtime answers. */
export function equipmentModelsUrl(
  agentServerUrl: string,
  agentId: string,
): string {
  return `${base(agentServerUrl)}/api/v1/configure/models?agent_id=${encodeURIComponent(agentId)}`;
}

const SERVER_STATES: readonly McpServerState[] = [
  'started',
  'starting',
  'failed',
  'not_started',
  'left_out',
];

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((each): each is string => typeof each === 'string')
    : [];

/** The runtime's answer, in the page's shape; what it does not know is left out. */
export function readEquipment(
  payload: unknown,
): Pick<Equipment, 'servers' | 'skills'> {
  const said = (payload ?? {}) as {
    mcp_servers?: Array<Record<string, unknown>>;
    skills?: Array<Record<string, unknown>>;
  };
  return {
    servers: (said.mcp_servers ?? []).map(row => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? row.id ?? ''),
      optional: row.optional === true,
      state: SERVER_STATES.includes(row.state as McpServerState)
        ? (row.state as McpServerState)
        : 'not_started',
      ...(typeof row.reason === 'string' && row.reason
        ? { reason: row.reason }
        : {}),
      missingEnvVars: names(row.missing_env_vars),
      ...(typeof row.tools === 'number' ? { tools: row.tools } : {}),
    })),
    skills: (said.skills ?? []).map(row => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? row.id ?? ''),
      description: String(row.description ?? ''),
      optional: row.optional === true,
      state: row.state === 'not_activated' ? 'not_activated' : 'active',
      ...(typeof row.reason === 'string' && row.reason
        ? { reason: row.reason }
        : {}),
      missingEnvVars: names(row.missing_env_vars),
      oneOfEnvVars: names(row.one_of_env_vars),
    })),
  };
}

/** What the agent's spec declares, with no state: shown until the runtime answers. */
export function declaredEquipment(specId: string | undefined): Equipment {
  const spec = specId
    ? (AGENTSPECS[specId] ?? AGENTSPECS[bare(specId)])
    : undefined;
  const optionalServers = new Set(spec?.optional?.mcpServers ?? []);
  const optionalSkills = new Set(spec?.optional?.skills ?? []);
  const models = spec
    ? [spec.model, ...(spec.modelAdditionals ?? [])].filter(
        (id): id is string => Boolean(id),
      )
    : [];
  return {
    source: 'declared',
    modelsSource: 'declared',
    servers: (spec?.mcpServers ?? []).filter(Boolean).map(server => ({
      id: server.id,
      name: server.name || server.id,
      optional: optionalServers.has(server.id),
      missingEnvVars: [],
    })),
    skills: (spec?.skills ?? []).filter(Boolean).map(skill => ({
      id: skill.id,
      name: skill.name || skill.id,
      description: skill.description ?? '',
      optional: optionalSkills.has(skill.id),
      missingEnvVars: [],
      oneOfEnvVars: [],
    })),
    models: [...new Set(models)].map((id, index) => ({
      id,
      name: getModel(id)?.name ?? id,
      current: index === 0,
    })),
  };
}

/** The models the runtime said, each marked when it is the one the agent runs on. */
export function readEquipmentModels(
  payload: unknown,
  current: string | undefined,
): EquipmentModel[] {
  const models = readServerCatalogue(
    payload as Parameters<typeof readServerCatalogue>[0],
  );
  const running =
    models.find(model => model.id === current)?.id ??
    models.find(model => model.isAvailable !== false)?.id;
  return models.map(model => ({ ...model, current: model.id === running }));
}

/**
 * The agent's equipment, kept current: its spec at once, then the runtime's
 * answer, read again every half minute while the chat is open (a server
 * starts, a skill is set up).
 */
export function useEquipment({
  agentServerUrl,
  agentId,
  token,
  specId,
  model,
  enabled,
  refreshMs = 30_000,
}: {
  agentServerUrl: string | undefined;
  agentId: string;
  token: string | undefined;
  /** The agent's spec in the catalogue: what is listed before the runtime answers. */
  specId: string | undefined;
  /** The model the chat runs on, when it knows. */
  model?: string;
  enabled: boolean;
  refreshMs?: number;
}): Equipment {
  const declared = useMemo(() => declaredEquipment(specId), [specId]);
  const [live, setLive] = useState<Pick<Equipment, 'servers' | 'skills'>>();
  const [models, setModels] = useState<EquipmentModel[]>();
  useEffect(() => {
    setLive(undefined);
    setModels(undefined);
    if (!enabled || !agentServerUrl || !agentId) {
      return undefined;
    }
    let controller = new AbortController();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const read = () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      void fetch(equipmentUrl(agentServerUrl, agentId), { headers, signal })
        .then(response => (response.ok ? response.json() : null))
        .then(payload => {
          if (!signal.aborted && payload) {
            setLive(readEquipment(payload));
          }
        })
        // A runtime that does not answer it (an older one): the spec stays.
        .catch(() => undefined);
      void fetch(equipmentModelsUrl(agentServerUrl, agentId), {
        headers,
        signal,
      })
        .then(response => (response.ok ? response.json() : null))
        .then(payload => {
          if (!signal.aborted && payload) {
            const said = readEquipmentModels(payload, model);
            // A runtime that says none of them usable is not saying which
            // the chat runs on (the visitors' runtime calls the model with
            // each visitor's own token, and holds none itself): the spec's
            // list stays, said declared.
            setModels(
              said.some(each => each.isAvailable !== false) ? said : undefined,
            );
          }
        })
        .catch(() => undefined);
    };
    read();
    const timer = setInterval(read, refreshMs);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [enabled, agentServerUrl, agentId, token, model, refreshMs]);
  return useMemo(
    () => ({
      source: live ? 'live' : 'declared',
      servers: live?.servers ?? declared.servers,
      skills: live?.skills ?? declared.skills,
      modelsSource: models && models.length > 0 ? 'live' : 'declared',
      models: models && models.length > 0 ? models : declared.models,
    }),
    [live, models, declared],
  );
}
