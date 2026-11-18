/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI an agent brings to its chat, and where each goes, read from its spec
 * and its components' specs alone — no plugin loaded. What
 * `apps/agentUiPlugins` mounts, and what a page lists without mounting
 * anything (the Canvas offers an application's agent's own UI first: the
 * user, 18 November 2026).
 *
 * @module apps/agentUiChoices
 */

import { AGENTSPECS } from '../specs/agents';
import { getSkillSpec } from '../specs/skills';
import { UI_CATALOGUE } from '../specs/ui';
import type { UiChoice } from '../types/agentspecs';
import type { UiPlacement } from './toolCards/chrome';

/** A UI the chat injects, where it goes. */
export type AgentUiChoice = {
  plugin: string;
  placement: UiPlacement;
  renderer?: string;
};

/** Where a UI goes: its declaration's placement, else its spec's first, else a message. */
export function placementOf(choice: UiChoice): UiPlacement {
  return (
    choice.placement ??
    UI_CATALOGUE[choice.plugin]?.placements?.[0] ??
    'message'
  );
}

/** What the chat knows of the agent's components while it runs. */
export type AgentUiComponents = {
  /** The MCP servers running, by id; unsaid, the spec's, but those left out. */
  running?: readonly string[];
  /** The skills enabled, by id; unsaid, the spec's, but those left out. */
  skills?: readonly string[];
  /** The optional servers and skills left out (their secret missing), by id. */
  leftOut?: readonly string[];
};

const bare = (id: string): string => id.split(':')[0];

/**
 * The chat's UI, each where it goes (the user, 15 November 2026: "Add the
 * ability for the mcp and skills to define a list of ui that will also be
 * injected", then "make sure ui can be used to be injected in the chat
 * itself (toolbar, header...) or as chat message (a2ui)"): the agent's own
 * `ui`, then the `ui` of each MCP server running, of each skill enabled, of
 * each backend tool it carries — each plugin once, at the first placement
 * named. An optional server or skill left out brings none.
 */
export function agentUiChoicesOf(
  specId: string | undefined,
  components: AgentUiComponents = {},
): AgentUiChoice[] {
  // By its id, with or without its version (`worker-marketer:0.0.1`).
  const spec = specId
    ? (AGENTSPECS[specId] ?? AGENTSPECS[bare(specId)])
    : undefined;
  if (!spec) {
    return [];
  }
  const leftOut = new Set((components.leftOut ?? []).map(bare));
  const running = components.running
    ? new Set(components.running.map(bare))
    : undefined;
  const enabledSkills = components.skills
    ? new Set(components.skills.map(bare))
    : undefined;
  const servers = (spec.mcpServers ?? []).filter(
    server =>
      server &&
      !leftOut.has(server.id) &&
      (running === undefined || running.has(server.id)),
  );
  const skills = (spec.skills ?? []).filter(
    skill =>
      skill &&
      !leftOut.has(skill.id) &&
      (enabledSkills === undefined || enabledSkills.has(skill.id)),
  );
  const named: UiChoice[] = [
    ...(spec.ui ?? []),
    ...servers.flatMap(server => server.ui ?? []),
    ...skills.flatMap(skill => getSkillSpec(skill.id)?.ui ?? []),
    ...(spec.backendTools ?? []).filter(Boolean).flatMap(tool => tool.ui ?? []),
  ];
  const seen = new Set<string>();
  const choices: AgentUiChoice[] = [];
  for (const choice of named) {
    if (seen.has(choice.plugin)) {
      continue;
    }
    seen.add(choice.plugin);
    choices.push({
      plugin: choice.plugin,
      placement: placementOf(choice),
      ...(choice.renderer ? { renderer: choice.renderer } : {}),
    });
  }
  return choices;
}

/** The chat's UI, by id, in order (`agentUiChoicesOf` without the placements). */
export function agentUiIdsOf(
  specId: string | undefined,
  components: AgentUiComponents = {},
): string[] {
  return agentUiChoicesOf(specId, components).map(choice => choice.plugin);
}

/** The UI plugin ids of an agent spec: its own and its components'. */
export function uiPluginIdsOfSpec(specId: string | undefined): string[] {
  return agentUiIdsOf(specId);
}
